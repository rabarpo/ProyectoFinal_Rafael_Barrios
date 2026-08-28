import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-notificaciones';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * notificaciones (backlog #19), PR6 (design.md D9/D10, tareas 16.1-16.4). Corre contra
 * Postgres+Redis reales, mismo patrón que `test/reportes/reportes-solicitud.e2e-spec.ts`. Las
 * filas `Notificacion` se insertan directamente vía `PrismaClient` (el emisor de PR3/PR4 ya tiene
 * su propia suite; acá solo se prueba el contrato HTTP de lectura/marcado).
 */
describe('NotificacionesController e2e — bandeja interna [spec: Listado scoped]', () => {
  const prisma = new PrismaClient();

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-notificaciones-e2e-2026';
  let passwordHash: string;
  let sufijoBase: number;
  let contador = 0;

  function extraerCookie(respuesta: Response): string | null {
    const setCookie = respuesta.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? `${COOKIE_NAME}=${match[1]}` : null;
  }

  async function postLogin(codigo: string, password: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, password }),
    });
  }

  function headersCon(cookie: string | null): Record<string, string> {
    return { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) };
  }

  async function getNotificaciones(qs: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/notificaciones${qs}`, { headers: headersCon(cookie) });
  }

  async function patchLeido(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/notificaciones/${id}/leido`, { method: 'PATCH', headers: headersCon(cookie) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `notif-e2e-${sufijoBase}-${contador}`;
  }

  async function crearUsuarioDirecto() {
    const sufijo = nombreUnico();
    const codigo = `e2e-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `${sufijo}@e2e.local`,
        nombres: `Usuario E2E ${sufijo}`,
        rol: 'administrador',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    return { usuario, codigo };
  }

  async function loginYObtenerCookie(codigo: string): Promise<string> {
    const respuesta = await postLogin(codigo, PASSWORD_CORRECTA);
    expect(respuesta.status).toBe(200);
    return extraerCookie(respuesta) as string;
  }

  async function crearNotificacion(usuarioId: string, overrides: Record<string, unknown> = {}) {
    return prisma.notificacion.create({
      data: {
        usuario_id: usuarioId,
        evento: 'inicio_votacion',
        titulo: 'Título',
        cuerpo: 'Cuerpo',
        tipo: 'interna',
        ...overrides,
      },
    });
  }

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
    process.env.GOOGLE_HOSTED_DOMAINS = GOOGLE_HOSTED_DOMAINS;

    passwordHash = await hash(PASSWORD_CORRECTA, ARGON2_OPTIONS);
    sufijoBase = Date.now();

    const stubClient = {
      verifyIdToken: async () => {
        throw new Error('no usado en esta suite');
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
    await prisma.$disconnect();
  });

  // 16.1: usuario A solo ve las suyas, paginadas, nunca las de B.
  it('[16.1] listar() solo devuelve las notificaciones propias, nunca las de otro usuario', async () => {
    const { usuario: usuarioA, codigo: codigoA } = await crearUsuarioDirecto();
    const { usuario: usuarioB } = await crearUsuarioDirecto();
    await crearNotificacion(usuarioA.id);
    await crearNotificacion(usuarioB.id);

    const cookie = await loginYObtenerCookie(codigoA);
    const respuesta = await getNotificaciones('', cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.datos).toHaveLength(1);
    expect(cuerpo.datos[0].id).not.toBe(undefined);
    expect(cuerpo.total).toBe(1);
  });

  // 16.2: solo_no_leidas=true filtra correctamente.
  it('[16.2] solo_no_leidas=true excluye las ya leídas', async () => {
    const { usuario, codigo } = await crearUsuarioDirecto();
    await crearNotificacion(usuario.id, { leido_en: new Date() });
    const pendiente = await crearNotificacion(usuario.id);

    const cookie = await loginYObtenerCookie(codigo);
    const respuesta = await getNotificaciones('?solo_no_leidas=true', cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.datos).toHaveLength(1);
    expect(cuerpo.datos[0].id).toBe(pendiente.id);
  });

  // 16.3: PATCH propio -> 200 con leido_en poblado; PATCH de ajena -> 403 sin cuerpo; UUID
  // inexistente -> el MISMO 403 byte a byte.
  it('[16.3] marcarLeido() propio devuelve 200 con leido_en poblado', async () => {
    const { usuario, codigo } = await crearUsuarioDirecto();
    const notificacion = await crearNotificacion(usuario.id);

    const cookie = await loginYObtenerCookie(codigo);
    const respuesta = await patchLeido(notificacion.id, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.leido_en).not.toBeNull();
  });

  it('[16.3] marcarLeido() ajena e inexistente responden el mismo 403 sin cuerpo discriminante', async () => {
    const { usuario: propietario } = await crearUsuarioDirecto();
    const { codigo: codigoAjeno } = await crearUsuarioDirecto();
    const notificacionAjena = await crearNotificacion(propietario.id);

    const cookie = await loginYObtenerCookie(codigoAjeno);

    const respuestaAjena = await patchLeido(notificacionAjena.id, cookie);
    expect(respuestaAjena.status).toBe(403);
    const cuerpoAjena = await respuestaAjena.text();

    const respuestaInexistente = await patchLeido('123e4567-e89b-12d3-a456-426614174000', cookie);
    expect(respuestaInexistente.status).toBe(403);
    const cuerpoInexistente = await respuestaInexistente.text();

    expect(cuerpoAjena).toBe(cuerpoInexistente);
  });

  // 16.4: sin cookie -> 401.
  it('[16.4] sin cookie -> 401 tanto en GET como en PATCH', async () => {
    const respuestaGet = await getNotificaciones('', null);
    expect(respuestaGet.status).toBe(401);

    const respuestaPatch = await patchLeido('123e4567-e89b-12d3-a456-426614174000', null);
    expect(respuestaPatch.status).toBe(401);
  });
});
