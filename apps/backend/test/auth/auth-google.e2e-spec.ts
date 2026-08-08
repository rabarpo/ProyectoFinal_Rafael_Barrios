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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

interface StubPayload {
  sub: string;
  email: string;
  email_verified?: boolean;
  hd?: string;
  aud?: string;
}

/**
 * google-oauth-y-recuperacion, PR2 (design.md D2/D3/D7, tareas 8.4-8.5). E2E de los 8 estados de
 * D3 vía `Test.createTestingModule` + `overrideProvider(GOOGLE_OAUTH_CLIENT)` con un stub que
 * decodifica el "token" como el propio JSON del payload — sin red real a Google ni firma que
 * verificar (esa política ya está cubierta por `google-oauth.service.spec.ts`, aquí el foco es el
 * flujo end-to-end sobre Postgres+Redis reales).
 */
describe('Auth e2e — Google OAuth login [R2][R3][R4][R5][R6a][D2][D3][D7]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-oauth-e2e-2026';
  let passwordHash: string;

  let usuarioBloqueadoId: string;
  let usuarioBloqueadoCorreo: string;
  let usuarioTofuId: string;
  let usuarioTofuCorreo: string;
  let usuarioConPasswordId: string;
  let usuarioConPasswordCorreo: string;
  let usuarioYaVinculadoId: string;
  let usuarioYaVinculadoCorreo: string;
  const SUB_YA_VINCULADO = 'sub-ya-vinculado';
  let usuarioOtroSubId: string;
  let usuarioOtroSubCorreo: string;
  const SUB_OTRO_USUARIO = 'sub-de-otro-usuario';

  function crearToken(payload: StubPayload): string {
    return JSON.stringify({
      aud: GOOGLE_CLIENT_ID,
      email_verified: true,
      hd: GOOGLE_HOSTED_DOMAINS,
      ...payload,
    });
  }

  function extraerCookie(respuesta: Response): string | null {
    const setCookie = respuesta.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? `${COOKIE_NAME}=${match[1]}` : null;
  }

  async function contarEventos(entityId: string | null, eventType: string): Promise<number> {
    return prisma.eventoAuditoria.count({ where: { entity_id: entityId, event_type: eventType } });
  }

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
    process.env.GOOGLE_HOSTED_DOMAINS = GOOGLE_HOSTED_DOMAINS;

    passwordHash = await hash(PASSWORD_CORRECTA, ARGON2_OPTIONS);
    const sufijo = Date.now();

    usuarioBloqueadoCorreo = `bloqueado-oauth-${sufijo}@e2e.local`;
    const usuarioBloqueado = await prisma.usuario.create({
      data: {
        codigo: `oauth-bloqueado-${sufijo}`,
        dni: `oauth-blo-${sufijo}`,
        correo: usuarioBloqueadoCorreo,
        nombres: 'Bloqueado OAuth E2E',
        rol: 'comite',
        estado: 'bloqueado',
        password_hash: null,
      },
    });
    usuarioBloqueadoId = usuarioBloqueado.id;

    usuarioTofuCorreo = `tofu-${sufijo}@e2e.local`;
    const usuarioTofu = await prisma.usuario.create({
      data: {
        codigo: `oauth-tofu-${sufijo}`,
        dni: `oauth-tofu-${sufijo}`,
        correo: usuarioTofuCorreo,
        nombres: 'TOFU OAuth E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: null,
      },
    });
    usuarioTofuId = usuarioTofu.id;

    usuarioConPasswordCorreo = `conpassword-${sufijo}@e2e.local`;
    const usuarioConPassword = await prisma.usuario.create({
      data: {
        codigo: `oauth-conpwd-${sufijo}`,
        dni: `oauth-conpwd-${sufijo}`,
        correo: usuarioConPasswordCorreo,
        nombres: 'ConPassword OAuth E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    usuarioConPasswordId = usuarioConPassword.id;

    usuarioYaVinculadoCorreo = `yavinculado-${sufijo}@e2e.local`;
    const usuarioYaVinculado = await prisma.usuario.create({
      data: {
        codigo: `oauth-yavinc-${sufijo}`,
        dni: `oauth-yavinc-${sufijo}`,
        correo: usuarioYaVinculadoCorreo,
        nombres: 'YaVinculado OAuth E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: passwordHash,
        google_id: SUB_YA_VINCULADO,
      },
    });
    usuarioYaVinculadoId = usuarioYaVinculado.id;

    usuarioOtroSubCorreo = `otrosub-${sufijo}@e2e.local`;
    const usuarioOtroSub = await prisma.usuario.create({
      data: {
        codigo: `oauth-otrosub-${sufijo}`,
        dni: `oauth-otrosub-${sufijo}`,
        correo: usuarioOtroSubCorreo,
        nombres: 'OtroSub OAuth E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: null,
      },
    });
    usuarioOtroSubId = usuarioOtroSub.id;

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

  async function postGoogle(idToken: string, password?: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, ...(password !== undefined ? { password } : {}) }),
    });
  }

  // D3#1 [R3]
  it('[D3#1] correo no registrado rechaza sin crear Usuario, audita LOGIN_OAUTH_FALLIDO', async () => {
    const respuesta = await postGoogle(crearToken({ sub: 'sub-nunca-visto', email: `no-existe-${Date.now()}@colegio.edu.ar` }));

    expect(respuesta.status).toBe(401);
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });

  // D3#2
  it('[D3#2] estado bloqueado rechaza y audita usuario_bloqueado', async () => {
    const antes = await contarEventos(usuarioBloqueadoId, 'LOGIN_OAUTH_FALLIDO');

    const respuesta = await postGoogle(
      crearToken({ sub: 'sub-cualquiera-bloqueado', email: usuarioBloqueadoCorreo }),
    );

    expect(respuesta.status).toBe(401);
    expect(await contarEventos(usuarioBloqueadoId, 'LOGIN_OAUTH_FALLIDO')).toBe(antes + 1);
  });

  // D3#4 TOFU [R4]
  it('[D3#4][R4] TOFU: primer login OAuth vincula google_id y crea sesión sin exigir password', async () => {
    const sub = `sub-tofu-${Date.now()}`;
    const respuesta = await postGoogle(crearToken({ sub, email: usuarioTofuCorreo }));

    expect(respuesta.status).toBe(200);
    const cookieHeader = extraerCookie(respuesta);
    expect(cookieHeader).not.toBeNull();
    const sessionId = (cookieHeader as string).split('=')[1];
    const raw = await redis.get(`session:${sessionId}`);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).userId).toBe(usuarioTofuId);

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuarioTofuId } });
    expect(usuarioActualizado?.google_id).toBe(sub);
    expect(await contarEventos(usuarioTofuId, 'LOGIN_OAUTH_EXITOSO')).toBeGreaterThanOrEqual(1);
  });

  // D3#3 [R4][R5]: reusa el sub vinculado en el test anterior — login directo, sin password.
  it('[D3#3][R4][R5] google_id ya vinculado con el mismo sub hace login directo sin password', async () => {
    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuarioTofuId } });
    const subVinculado = usuarioActualizado?.google_id as string;

    const respuesta = await postGoogle(crearToken({ sub: subVinculado, email: usuarioTofuCorreo }));

    expect(respuesta.status).toBe(200);
    expect(extraerCookie(respuesta)).not.toBeNull();
  });

  // D3#5 [R4]: password_hash presente, sin password en el body.
  it('[D3#5][R4] password_hash presente sin password en el body responde 409 VINCULACION_REQUERIDA', async () => {
    const respuesta = await postGoogle(
      crearToken({ sub: `sub-conpwd-sinvinc-${Date.now()}`, email: usuarioConPasswordCorreo }),
    );

    expect(respuesta.status).toBe(409);
    const cuerpo = (await respuesta.json()) as { codigo: string };
    expect(cuerpo.codigo).toBe('VINCULACION_REQUERIDA');
    expect(respuesta.headers.get('set-cookie')).toBeNull();

    const usuarioSinCambios = await prisma.usuario.findUnique({ where: { id: usuarioConPasswordId } });
    expect(usuarioSinCambios?.google_id).toBeNull();
  });

  // D3#7: misma precondición que #5, password incorrecta.
  it('[D3#7] password incorrecta rechaza sin vincular', async () => {
    const respuesta = await postGoogle(
      crearToken({ sub: `sub-conpwd-incorrecta-${Date.now()}`, email: usuarioConPasswordCorreo }),
      'password-incorrecta',
    );

    expect(respuesta.status).toBe(401);
    const usuarioSinCambios = await prisma.usuario.findUnique({ where: { id: usuarioConPasswordId } });
    expect(usuarioSinCambios?.google_id).toBeNull();
  });

  // D3#6 [R4]: misma precondición, password correcta ⇒ vincula + sesión.
  it('[D3#6][R4] password correcta vincula google_id y crea sesión', async () => {
    const sub = `sub-conpwd-correcta-${Date.now()}`;
    const respuesta = await postGoogle(
      crearToken({ sub, email: usuarioConPasswordCorreo }),
      PASSWORD_CORRECTA,
    );

    expect(respuesta.status).toBe(200);
    expect(extraerCookie(respuesta)).not.toBeNull();

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuarioConPasswordId } });
    expect(usuarioActualizado?.google_id).toBe(sub);
  });

  // D3#8 [adversarial]: sub ya vinculado a OTRO Usuario — rechazo explícito, nunca 500.
  it('[D3#8][adversarial] sub ya vinculado a otro Usuario responde 401, nunca 500', async () => {
    const respuesta = await postGoogle(
      crearToken({ sub: SUB_YA_VINCULADO, email: usuarioOtroSubCorreo }),
    );

    expect(respuesta.status).toBe(401);
    const usuarioSinCambios = await prisma.usuario.findUnique({ where: { id: usuarioOtroSubId } });
    expect(usuarioSinCambios?.google_id).toBeNull();

    const otroUsuarioIntacto = await prisma.usuario.findUnique({ where: { id: usuarioYaVinculadoId } });
    expect(otroUsuarioIntacto?.google_id).toBe(SUB_YA_VINCULADO);
  });

  // Requerimiento spec.md "Verificación del ID token de Google": dominio no permitido rechaza.
  it('[R2][D2] token de dominio no permitido rechaza sin crear sesión', async () => {
    const respuesta = await postGoogle(
      crearToken({ sub: `sub-dominio-no-permitido-${Date.now()}`, email: 'x@otro-dominio.com', hd: 'otro-dominio.com' }),
    );

    expect(respuesta.status).toBe(401);
    expect(respuesta.headers.get('set-cookie')).toBeNull();
  });

  // 8.5 [adversarial]: ninguna respuesta ni fila de auditoría contiene el idToken crudo ni la
  // contraseña enviada.
  it('[adversarial] ninguna respuesta ni fila de EventoAuditoria contiene el idToken crudo ni la contraseña', async () => {
    const sub = `sub-no-leak-${Date.now()}`;
    const idToken = crearToken({ sub, email: usuarioConPasswordCorreo });

    const respuesta = await postGoogle(idToken, 'password-no-debe-aparecer-en-ningun-lado');
    const cuerpo = await respuesta.text();
    expect(cuerpo).not.toContain(idToken);
    expect(cuerpo).not.toContain('password-no-debe-aparecer-en-ningun-lado');

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { entity_id: { in: [usuarioConPasswordId, usuarioTofuId, usuarioBloqueadoId] } },
    });
    for (const evento of eventos) {
      const payloadTexto = JSON.stringify(evento.payload);
      expect(payloadTexto).not.toContain(idToken);
      expect(payloadTexto).not.toContain('password-no-debe-aparecer-en-ningun-lado');
      expect(payloadTexto).not.toContain(PASSWORD_CORRECTA);
    }
  });

  it('[R6a] whoami con la cookie de un login OAuth exitoso devuelve la sesión autenticada', async () => {
    const sub = `sub-whoami-${Date.now()}`;
    const login = await postGoogle(crearToken({ sub, email: usuarioOtroSubCorreo }));
    const cookieHeader = extraerCookie(login) as string;

    const respuesta = await fetch(`${baseUrl}/api/auth/whoami`, { headers: { Cookie: cookieHeader } });
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as { userId: string; rol: string };
    expect(cuerpo.userId).toBe(usuarioOtroSubId);
  });
});
