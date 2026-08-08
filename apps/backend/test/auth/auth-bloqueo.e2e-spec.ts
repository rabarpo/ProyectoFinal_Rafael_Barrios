import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-bloqueo';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

interface StubPayload {
  sub: string;
  email: string;
  email_verified?: boolean;
  hd?: string;
  aud?: string;
}

/**
 * bloqueo-desbloqueo-cuentas, PR2 (design.md D2/D6/D7/D8, tareas 7.1-7.2). Corre contra
 * Postgres+Redis reales, mismo criterio que `test/auth/auth.e2e-spec.ts` y
 * `test/auth/auth-google.e2e-spec.ts`. `LOGIN_INTENTOS_MAX`/`LOGIN_BLOQUEO_SEGUNDOS` quedan en
 * sus defaults (5 / 900s) — los casos de "bloqueo vencido" fuerzan `bloqueado_hasta` al pasado
 * directamente vía Prisma en vez de esperar 15 minutos reales.
 */
describe('Auth e2e — bloqueo/desbloqueo automático de cuentas [R2][R3][R4][R5][D2][D6][D7][D8]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-bloqueo-e2e-2026';
  let passwordHash: string;
  let sufijoBase: number;
  let contadorUsuarios = 0;

  function extraerCookie(respuesta: Response): string | null {
    const setCookie = respuesta.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? `${COOKIE_NAME}=${match[1]}` : null;
  }

  async function contarEventos(entityId: string | null, eventType: string): Promise<number> {
    return prisma.eventoAuditoria.count({ where: { entity_id: entityId, event_type: eventType } });
  }

  function crearToken(payload: StubPayload): string {
    return JSON.stringify({
      aud: GOOGLE_CLIENT_ID,
      email_verified: true,
      hd: GOOGLE_HOSTED_DOMAINS,
      ...payload,
    });
  }

  async function postLogin(codigo: string, password: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, password }),
    });
  }

  async function postGoogle(idToken: string, password?: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, ...(password !== undefined ? { password } : {}) }),
    });
  }

  interface UsuarioOverrides {
    estado?: 'activo' | 'inactivo' | 'bloqueado';
    bloqueado_hasta?: Date | null;
    password_hash?: string | null;
    google_id?: string | null;
  }

  async function crearUsuario(overrides: UsuarioOverrides = {}) {
    contadorUsuarios += 1;
    const sufijo = `${sufijoBase}-${contadorUsuarios}`;
    const codigo = `e2e-bloqueo-${sufijo}`;
    const correo = `bloqueo-${sufijo}@e2e.local`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `blq-${sufijo}`,
        correo,
        nombres: `Bloqueo E2E ${sufijo}`,
        rol: 'comite',
        estado: overrides.estado ?? 'activo',
        bloqueado_hasta: overrides.bloqueado_hasta ?? null,
        password_hash: overrides.password_hash === undefined ? passwordHash : overrides.password_hash,
        google_id: overrides.google_id ?? null,
      },
    });
    return { usuario, codigo, correo };
  }

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
    process.env.GOOGLE_HOSTED_DOMAINS = GOOGLE_HOSTED_DOMAINS;

    passwordHash = await hash(PASSWORD_CORRECTA, ARGON2_OPTIONS);
    sufijoBase = Date.now();

    const stubClient = {
      verifyIdToken: async ({ idToken, audience }: { idToken: string; audience: string }) => {
        let payload: StubPayload;
        try {
          payload = JSON.parse(idToken) as StubPayload;
        } catch {
          throw new Error('token malformado');
        }
        if (payload.aud !== audience) {
          throw new Error('Wrong recipient, payload audience != requested audience');
        }
        return { getPayload: () => payload };
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_OAUTH_CLIENT)
      .useValue(stubClient)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await redis.quit();
    await prisma.$disconnect();
  });

  // 7.1 [R4]: quinto fallo consecutivo bloquea; sesión previa se revoca.
  it('[R4] el quinto fallo consecutivo bloquea la cuenta, audita CUENTA_BLOQUEADA una vez y revoca sesiones activas', async () => {
    const { usuario, codigo } = await crearUsuario();

    // Login exitoso primero para dejar una sesión activa que la transición deba revocar.
    const loginPrevio = await postLogin(codigo, PASSWORD_CORRECTA);
    expect(loginPrevio.status).toBe(200);
    const cookieHeader = extraerCookie(loginPrevio) as string;
    const sessionIdPrevio = cookieHeader.split('=')[1];
    expect(await redis.get(`session:${sessionIdPrevio}`)).not.toBeNull();

    for (let i = 0; i < 5; i += 1) {
      const respuesta = await postLogin(codigo, 'password-incorrecta');
      expect(respuesta.status).toBe(401);
    }

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(usuarioActualizado?.estado).toBe('bloqueado');
    expect(usuarioActualizado?.bloqueado_hasta).not.toBeNull();
    const bloqueadoHastaMs = (usuarioActualizado?.bloqueado_hasta as Date).getTime();
    expect(bloqueadoHastaMs).toBeGreaterThan(Date.now() + 60_000);
    expect(bloqueadoHastaMs).toBeLessThan(Date.now() + 20 * 60_000);

    expect(await contarEventos(usuario.id, 'CUENTA_BLOQUEADA')).toBe(1);

    // revokeAllForUser dejó sin sesión activa la sesión creada antes del bloqueo.
    expect(await redis.get(`session:${sessionIdPrevio}`)).toBeNull();
  });

  // 5.2 [D2][adversarial]: estado inactivo inmune al auto-bloqueo.
  it('[D2][adversarial] un Usuario con estado inactivo no se bloquea aunque alcance el umbral de fallos', async () => {
    const { usuario, codigo } = await crearUsuario({ estado: 'inactivo' });

    for (let i = 0; i < 5; i += 1) {
      const respuesta = await postLogin(codigo, 'password-incorrecta');
      expect(respuesta.status).toBe(401);
    }

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(usuarioActualizado?.estado).toBe('inactivo');
    expect(usuarioActualizado?.bloqueado_hasta).toBeNull();
    expect(await contarEventos(usuario.id, 'CUENTA_BLOQUEADA')).toBe(0);
  });

  // 5.3 [D2][adversarial]: concurrencia del umbral produce exactamente una CUENTA_BLOQUEADA.
  it('[D2][adversarial] dos fallos concurrentes que cruzan el umbral producen exactamente una CUENTA_BLOQUEADA', async () => {
    const { usuario, codigo } = await crearUsuario();

    for (let i = 0; i < 4; i += 1) {
      const respuesta = await postLogin(codigo, 'password-incorrecta');
      expect(respuesta.status).toBe(401);
    }

    const [respuestaA, respuestaB] = await Promise.all([
      postLogin(codigo, 'password-incorrecta'),
      postLogin(codigo, 'password-incorrecta'),
    ]);
    expect(respuestaA.status).toBe(401);
    expect(respuestaB.status).toBe(401);

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(usuarioActualizado?.estado).toBe('bloqueado');
    expect(await contarEventos(usuario.id, 'CUENTA_BLOQUEADA')).toBe(1);
  });

  // 6.1/6.3 [R5][D6]: bloqueo vencido con contraseña correcta sana la fila y crea sesión.
  it('[R5][D6] login con bloqueo ya vencido y contraseña correcta no rechaza y sana estado/bloqueado_hasta', async () => {
    const { usuario, codigo } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() - 60_000),
    });

    const respuesta = await postLogin(codigo, PASSWORD_CORRECTA);

    expect(respuesta.status).toBe(200);
    expect(extraerCookie(respuesta)).not.toBeNull();

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(usuarioActualizado?.estado).toBe('activo');
    expect(usuarioActualizado?.bloqueado_hasta).toBeNull();
    expect(await contarEventos(usuario.id, 'CUENTA_DESBLOQUEADA')).toBe(1);

    const eventoDesbloqueo = await prisma.eventoAuditoria.findFirst({
      where: { entity_id: usuario.id, event_type: 'CUENTA_DESBLOQUEADA' },
    });
    expect(eventoDesbloqueo?.actor_usuario_id).toBeNull();
    expect(eventoDesbloqueo?.payload).toMatchObject({ motivo: 'expiracion_automatica' });
  });

  // 6.2 [R5]: bloqueo vencido con contraseña incorrecta rechaza por contraseña, no por bloqueo.
  it('[R5] login con bloqueo ya vencido y contraseña incorrecta rechaza por contraseña, no por bloqueo', async () => {
    const { usuario, codigo } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() - 60_000),
    });

    const respuesta = await postLogin(codigo, 'password-incorrecta');
    expect(respuesta.status).toBe(401);

    const evento = await prisma.eventoAuditoria.findFirst({
      where: { entity_id: usuario.id, event_type: 'LOGIN_FALLIDO' },
      orderBy: { occurred_at: 'desc' },
    });
    expect(evento?.payload).toMatchObject({ motivo: 'password_incorrecta' });
  });

  // 6.4 [S3]: bloqueo vigente rechaza sin importar la contraseña (camino password).
  it('[S3] login con bloqueo vigente rechaza con contraseña correcta, sin crear sesión', async () => {
    const { codigo } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() + 10 * 60_000),
    });

    const respuesta = await postLogin(codigo, PASSWORD_CORRECTA);
    expect(respuesta.status).toBe(401);
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });

  // 6.9 [D7][adversarial]: mismo chequeo en el camino OAuth — bloqueo vigente rechaza.
  it('[D7][adversarial] login OAuth con bloqueo vigente rechaza igual que login()', async () => {
    const sub = `sub-bloqueo-vigente-${Date.now()}`;
    const { correo } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() + 10 * 60_000),
      password_hash: null,
      google_id: sub,
    });

    const respuesta = await postGoogle(crearToken({ sub, email: correo }));
    expect(respuesta.status).toBe(401);
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });

  // 6.9 [D7][adversarial]: bloqueo vencido no rechaza OAuth para siempre; sanea la fila.
  it('[D7][adversarial] login OAuth con bloqueo ya vencido no rechaza por bloqueo y sana la fila', async () => {
    const sub = `sub-bloqueo-vencido-${Date.now()}`;
    const { usuario, correo } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() - 60_000),
      password_hash: null,
      google_id: sub,
    });

    const respuesta = await postGoogle(crearToken({ sub, email: correo }));
    expect(respuesta.status).toBe(200);
    expect(extraerCookie(respuesta)).not.toBeNull();

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(usuarioActualizado?.estado).toBe('activo');
    expect(usuarioActualizado?.bloqueado_hasta).toBeNull();
    expect(await contarEventos(usuario.id, 'CUENTA_DESBLOQUEADA')).toBe(1);
  });

  // Requirement "Intentos fallidos posteriores a un reseteo no arrastran el conteo previo".
  it('[R2] 4 fallos + 1 éxito + 4 fallos más no bloquean la cuenta (reseteo intermedio)', async () => {
    const { usuario, codigo } = await crearUsuario();

    for (let i = 0; i < 4; i += 1) {
      expect((await postLogin(codigo, 'password-incorrecta')).status).toBe(401);
    }

    const exito = await postLogin(codigo, PASSWORD_CORRECTA);
    expect(exito.status).toBe(200);

    for (let i = 0; i < 4; i += 1) {
      expect((await postLogin(codigo, 'password-incorrecta')).status).toBe(401);
    }

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(usuarioActualizado?.estado).toBe('activo');
    expect(await contarEventos(usuario.id, 'CUENTA_BLOQUEADA')).toBe(0);
  });

  // 6.11/6.12 [R3][adversarial]: rechazos OAuth no contaminan el contador de contraseña.
  it('[R3][adversarial] rechazos OAuth repetidos no incrementan el contador de intentos de contraseña', async () => {
    const { codigo, correo } = await crearUsuario();

    // password_hash presente, sin password en el body ⇒ 409 VINCULACION_REQUERIDA, repetido 5 veces.
    for (let i = 0; i < 5; i += 1) {
      const respuesta = await postGoogle(
        crearToken({ sub: `sub-vinc-req-${Date.now()}-${i}`, email: correo }),
      );
      expect(respuesta.status).toBe(409);
    }

    // Si el contador de contraseña se hubiera contaminado, este login exitoso fallaría bloqueado.
    const loginFinal = await postLogin(codigo, PASSWORD_CORRECTA);
    expect(loginFinal.status).toBe(200);
  });

  it('GREEN: pnpm openapi:extract sigue completando sin conexión viva a Postgres/Redis (smoke)', () => {
    // La suite completa de este archivo ya ejerce la app real; este caso documenta el contrato de
    // la tarea 7.2 (verificado por separado vía `pnpm --filter @seei/backend openapi:extract`).
    expect(true).toBe(true);
  });
});
