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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-inactivo';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

interface StubPayload {
  sub: string;
  email: string;
  email_verified?: boolean;
  hd?: string;
  aud?: string;
}

/**
 * administracion-usuarios-apoderados, PR3 (design.md D7, tareas 12.1-12.7, spec "Rechazo de
 * inicio de sesión para Usuario en estado = inactivo"). Corre contra Postgres+Redis reales, mismo
 * criterio que `test/auth/auth-bloqueo.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1/PR2): en este entorno de ejecución `docker ps`
 * falla (sin daemon Docker), así que esta suite no pudo correrse hasta GREEN en esta sesión.
 * Queda escrita y type-checkeada (`pnpm typecheck` en verde), lista para CI o un entorno con
 * `docker-compose.test.yml` levantado. La cobertura de orquestación equivalente (guarda
 * `estado==='inactivo'` junto a `bloqueoVigente()`, anti-oráculo, no incremento del contador) ya
 * está en verde como unit tests en `src/auth/auth.service.spec.ts`.
 */
describe('Auth e2e — rechazo de login para Usuario inactivo [R8][D7]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-inactivo-e2e-2026';
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

  async function postGoogle(idToken: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
  }

  interface UsuarioOverrides {
    estado?: 'activo' | 'inactivo' | 'bloqueado';
    google_id?: string | null;
  }

  async function crearUsuario(overrides: UsuarioOverrides = {}) {
    contadorUsuarios += 1;
    const sufijo = `${sufijoBase}-${contadorUsuarios}`;
    const codigo = `e2e-inactivo-${sufijo}`;
    const correo = `inactivo-${sufijo}@e2e.local`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `ina-${sufijo}`,
        correo,
        nombres: `Inactivo E2E ${sufijo}`,
        rol: 'comite',
        estado: overrides.estado ?? 'inactivo',
        password_hash: passwordHash,
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

  // 12.1 RED [R8]: login con contraseña válida sobre Usuario inactivo -> 401 sin distinguir causa.
  it('[R8] login con contraseña válida sobre Usuario inactivo responde 401 sin crear sesión', async () => {
    const { codigo } = await crearUsuario({ estado: 'inactivo' });

    const respuesta = await postLogin(codigo, PASSWORD_CORRECTA);
    expect(respuesta.status).toBe(401);
    expect(extraerCookie(respuesta)).toBeNull();
  });

  // 12.1/spec: el evento de auditoría registra motivo='usuario_inactivo', sin exponerlo en la respuesta.
  it('[R8] el evento LOGIN_FALLIDO registra motivo=usuario_inactivo', async () => {
    const { usuario, codigo } = await crearUsuario({ estado: 'inactivo' });

    await postLogin(codigo, PASSWORD_CORRECTA);

    expect(await contarEventos(usuario.id, 'LOGIN_FALLIDO')).toBe(1);
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { entity_id: usuario.id, event_type: 'LOGIN_FALLIDO' },
    });
    expect(evento?.payload).toMatchObject({ motivo: 'usuario_inactivo' });
  });

  // 12.4/spec "no contabiliza": el rechazo por inactividad no incrementa el contador de bloqueo.
  it('[R8] el rechazo por inactividad no incrementa el contador de bloqueo por fuerza bruta', async () => {
    const { usuario, codigo } = await crearUsuario({ estado: 'inactivo' });

    for (let i = 0; i < 5; i += 1) {
      const respuesta = await postLogin(codigo, PASSWORD_CORRECTA);
      expect(respuesta.status).toBe(401);
    }

    // El contador vive en Redis (`login:intentos:{userId}`); si nunca se incrementó, la clave no
    // existe (a diferencia del contador señuelo, que sí existiría bajo otra clave hasheada).
    expect(await redis.get(`login:intentos:${usuario.id}`)).toBeNull();

    // La cuenta sigue inactiva: el rechazo repetido no la transiciona a `bloqueado` por fuerza bruta.
    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(usuarioActualizado?.estado).toBe('inactivo');
  });

  // 12.5 RED [R8]: login por Google OAuth sobre Usuario inactivo -> 401, sin sesión.
  it('[R8] login por Google OAuth sobre Usuario inactivo responde 401 sin crear sesión', async () => {
    const sub = `sub-inactivo-${Date.now()}`;
    const { correo } = await crearUsuario({ estado: 'inactivo', google_id: sub });

    const respuesta = await postGoogle(crearToken({ sub, email: correo }));
    expect(respuesta.status).toBe(401);
    expect(extraerCookie(respuesta)).toBeNull();
  });

  // Contraste: un Usuario activo con las mismas credenciales sí puede iniciar sesión.
  it('[control] un Usuario activo con las mismas credenciales sí inicia sesión', async () => {
    const { codigo } = await crearUsuario({ estado: 'activo' });

    const respuesta = await postLogin(codigo, PASSWORD_CORRECTA);
    expect(respuesta.status).toBe(200);
    expect(extraerCookie(respuesta)).not.toBeNull();
  });
});
