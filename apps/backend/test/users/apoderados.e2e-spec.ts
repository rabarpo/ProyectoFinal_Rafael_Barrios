import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-apoderados';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-usuarios-apoderados, PR3 (design.md "Contratos HTTP", tareas 11.1-11.7). Corre
 * contra Postgres+Redis reales, mismo criterio que `test/users/users.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1/PR2, ver tasks.md 6.4/7.1): `docker ps` falla en
 * este entorno (sin daemon Docker), así que esta suite no pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada (`pnpm typecheck` en verde) contra el contrato real de
 * `ApoderadosController`/`ApoderadosService`, lista para CI o un entorno con
 * `docker-compose.test.yml` levantado. La cobertura equivalente de orquestación/lógica de negocio
 * (guarda `rol==='estudiante'`, borrado físico, auditoría) ya está en verde como unit tests en
 * `src/users/apoderados.service.spec.ts`.
 */
describe('Apoderados e2e — CRUD anidado bajo Usuario estudiante [R9][R11]', () => {
  const prisma = new PrismaClient();

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-apoderados-e2e-2026';
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

  async function postApoderado(usuarioId: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/usuarios/${usuarioId}/apoderados`, {
      method: 'POST',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  async function getApoderados(usuarioId: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/usuarios/${usuarioId}/apoderados`, { headers: headersCon(cookie) });
  }

  async function patchApoderado(
    usuarioId: string,
    apoderadoId: string,
    body: unknown,
    cookie: string | null,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/usuarios/${usuarioId}/apoderados/${apoderadoId}`, {
      method: 'PATCH',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  async function deleteApoderado(
    usuarioId: string,
    apoderadoId: string,
    cookie: string | null,
  ): Promise<Response> {
    return fetch(`${baseUrl}/api/usuarios/${usuarioId}/apoderados/${apoderadoId}`, {
      method: 'DELETE',
      headers: headersCon(cookie),
    });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contadorUsuarios += 1;
    const sufijo = `${sufijoBase}-${contadorUsuarios}`;
    const codigo = `e2e-apod-${sufijo}`;
    const correo = `apod-${sufijo}@e2e.local`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `apod-${sufijo}`,
        correo,
        nombres: `Usuario Apoderados E2E ${sufijo}`,
        rol: overrides.rol ?? 'estudiante',
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

  // 11.1 [R11]: alta sobre un Usuario estudiante -> 201, exactamente una fila APODERADO_CREADO.
  it('[R11] POST crea un Apoderado sobre un Usuario estudiante y audita APODERADO_CREADO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const respuesta = await postApoderado(
      estudiante.id,
      { nombres: 'Madre de Familia', dni: 'apo-dni-1' },
      cookieAdmin,
    );
    expect(respuesta.status).toBe(201);
    const cuerpo = (await respuesta.json()) as { id: string };
    expect(await contarEventos(cuerpo.id, 'APODERADO_CREADO')).toBe(1);
  });

  // 11.2 [R11]: un estudiante puede tener varios apoderados.
  it('[R11] un estudiante puede tener varios apoderados registrados', async () => {
    const { codigo: codigoDirector } = await crearUsuarioDirecto({ rol: 'director' });
    const cookieDirector = await loginYObtenerCookie(codigoDirector);
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const primero = await postApoderado(estudiante.id, { nombres: 'Padre', dni: 'apo-dni-a' }, cookieDirector);
    expect(primero.status).toBe(201);
    const segundo = await postApoderado(estudiante.id, { nombres: 'Madre', dni: 'apo-dni-b' }, cookieDirector);
    expect(segundo.status).toBe(201);

    const listado = await getApoderados(estudiante.id, cookieDirector);
    const cuerpo = (await listado.json()) as Array<{ id: string }>;
    expect(cuerpo).toHaveLength(2);
  });

  // 11.3 [R11][adversarial]: rol != estudiante -> 409 sin escritura.
  it('[R11][adversarial] rechaza cualquier operación cuando el Usuario no es estudiante, sin escritura', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario: docente } = await crearUsuarioDirecto({ rol: 'docente' });

    const respuesta = await postApoderado(docente.id, { nombres: 'X', dni: 'x' }, cookieAdmin);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'USUARIO_NO_ES_ESTUDIANTE' });

    const filas = await prisma.apoderado.findMany({ where: { usuario_id: docente.id } });
    expect(filas).toHaveLength(0);
  });

  // 11.4 [R11]: GET lista los apoderados; arreglo vacío es válido.
  it('[R11] GET lista los apoderados del estudiante (vacío es válido)', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const respuesta = await getApoderados(estudiante.id, cookieAdmin);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual([]);
  });

  // 11.5 [R11]: PATCH actualiza datos básicos, 1 fila APODERADO_ACTUALIZADO.
  it('[R11] PATCH actualiza datos básicos y audita exactamente una fila APODERADO_ACTUALIZADO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const creado = await postApoderado(estudiante.id, { nombres: 'Original', dni: 'apo-dni-c' }, cookieAdmin);
    const { id: apoderadoId } = (await creado.json()) as { id: string };

    const respuesta = await patchApoderado(
      estudiante.id,
      apoderadoId,
      { nombres: 'Actualizado' },
      cookieAdmin,
    );
    expect(respuesta.status).toBe(200);
    expect(await contarEventos(apoderadoId, 'APODERADO_ACTUALIZADO')).toBe(1);
  });

  // 11.6 [R11]: DELETE elimina físicamente, 1 fila APODERADO_ELIMINADO.
  it('[R11] DELETE elimina físicamente la fila y audita exactamente una fila APODERADO_ELIMINADO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const creado = await postApoderado(estudiante.id, { nombres: 'Eliminable', dni: 'apo-dni-d' }, cookieAdmin);
    const { id: apoderadoId } = (await creado.json()) as { id: string };

    const respuesta = await deleteApoderado(estudiante.id, apoderadoId, cookieAdmin);
    expect(respuesta.status).toBe(204);

    const fila = await prisma.apoderado.findUnique({ where: { id: apoderadoId } });
    expect(fila).toBeNull();
    expect(await contarEventos(apoderadoId, 'APODERADO_ELIMINADO')).toBe(1);
  });

  // 11.7 [R9]: rol comite rechazado en las cuatro rutas de apoderados, sin ejecutar el handler.
  it('[R9] rol comite recibe 403 en las cuatro rutas de apoderados', async () => {
    const { codigo: codigoComite } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    expect((await postApoderado(estudiante.id, { nombres: 'X', dni: 'x' }, cookieComite)).status).toBe(403);
    expect((await getApoderados(estudiante.id, cookieComite)).status).toBe(403);
    expect(
      (await patchApoderado(estudiante.id, '00000000-0000-0000-0000-000000000000', { nombres: 'x' }, cookieComite))
        .status,
    ).toBe(403);
    expect(
      (await deleteApoderado(estudiante.id, '00000000-0000-0000-0000-000000000000', cookieComite)).status,
    ).toBe(403);
  });
});
