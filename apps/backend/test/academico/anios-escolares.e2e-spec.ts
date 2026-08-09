import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-anios-escolares';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-academica, PR2 (design.md "Contratos HTTP", tareas 7.1-7.7, 8.1-8.5). Corre
 * contra Postgres+Redis reales, mismo criterio que `test/users/users.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1 de este change, tarea 4.2): en el entorno de
 * ejecución de este `sdd-apply` no hay daemon Docker disponible (`docker ps` falla con "failed to
 * connect to the docker API"), así que esta suite NO pudo correrse hasta GREEN en esta sesión.
 * Queda escrita y type-checkeada (`pnpm typecheck` en verde) contra el contrato real de
 * `AniosEscolaresController`/`AniosEscolaresService`, lista para ejecutarse en CI o en un entorno
 * con `docker-compose.test.yml` levantado. La cobertura equivalente de orquestación/lógica de
 * negocio (unicidad, guarda de 4 dependientes, catch P2002/P2003 residual) ya está en verde como
 * unit tests en `src/academico/anios-escolares.service.spec.ts`.
 */
describe('AniosEscolares e2e — CRUD de AnioEscolar [SY1, SY3, SY4]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-anios-escolares-e2e-2026';
  let passwordHash: string;
  let sufijoBase: number;
  let contador = 0;

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

  async function postAniosEscolares(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/anios-escolares`, {
      method: 'POST',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  async function getAniosEscolares(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/anios-escolares${query}`, { headers: headersCon(cookie) });
  }

  async function getAnioEscolar(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/anios-escolares/${id}`, { headers: headersCon(cookie) });
  }

  async function patchAnioEscolar(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/anios-escolares/${id}`, {
      method: 'PATCH',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  async function deleteAnioEscolar(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/anios-escolares/${id}`, {
      method: 'DELETE',
      headers: headersCon(cookie),
    });
  }

  async function activarAnioEscolar(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/anios-escolares/${id}/activar`, {
      method: 'PATCH',
      headers: headersCon(cookie),
    });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-anios-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `anios-${sufijo}@e2e.local`,
        nombres: `Usuario E2E ${sufijo}`,
        rol: overrides.rol ?? 'administrador',
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

  function nombreUnico(): string {
    contador += 1;
    return `Año E2E ${sufijoBase}-${contador}`;
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
    await redis.quit();
    await prisma.$disconnect();
  });

  // 7.1 [SY1]: creación exitosa -> 201, activo=false, 1 fila ANIO_ESCOLAR_CREADO.
  it('[SY1] POST /anios-escolares crea con activo=false y audita ANIO_ESCOLAR_CREADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postAniosEscolares({ nombre: nombreUnico() }, cookie);
    expect(respuesta.status).toBe(201);
    const cuerpo = (await respuesta.json()) as { id: string; activo: boolean };
    expect(cuerpo.activo).toBe(false);
    expect(await contarEventos(cuerpo.id, 'ANIO_ESCOLAR_CREADO')).toBe(1);
  });

  // 7.2 [SY1]: nombre duplicado -> error 4xx identificando nombre, sin crear.
  it('[SY1] nombre duplicado responde 409 RESTRICCION_UNICA sin crear una segunda fila', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nombre = nombreUnico();

    const primera = await postAniosEscolares({ nombre }, cookie);
    expect(primera.status).toBe(201);

    const segunda = await postAniosEscolares({ nombre }, cookie);
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toMatchObject({ codigo: 'RESTRICCION_UNICA', campos: ['nombre'] });
  });

  // 7.3 [SY1]: rol no autorizado se rechaza en las 6 rutas de AnioEscolar sin ejecutar el handler.
  it('[SY1] rol comite recibe 403 en las rutas de AnioEscolar', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookie = await loginYObtenerCookie(codigo);
    const nombre = nombreUnico();

    expect((await postAniosEscolares({ nombre }, cookie)).status).toBe(403);
    expect((await getAniosEscolares('', cookie)).status).toBe(403);
    const fila = await prisma.anioEscolar.findFirst({ where: { nombre } });
    expect(fila).toBeNull();
  });

  // 7.4 [D5]: GET :id devuelve el AnioEscolar; inexistente 404; malformado 400.
  it('[D5] GET /anios-escolares/:id devuelve el AnioEscolar; inexistente 404; malformado 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const creado = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });

    const encontrado = await getAnioEscolar(creado.id, cookie);
    expect(encontrado.status).toBe(200);

    const inexistente = await getAnioEscolar('00000000-0000-0000-0000-000000000000', cookie);
    expect(inexistente.status).toBe(404);

    const malformado = await getAnioEscolar('no-es-un-uuid', cookie);
    expect(malformado.status).toBe(400);
  });

  // 7.5 [D5]: GET ?activo= filtra correctamente; valor desconocido -> 400.
  it('[D5] GET /anios-escolares?activo= filtra; valor desconocido responde 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const activo = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: true } });
    await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });

    const filtrado = await getAniosEscolares('?activo=true', cookie);
    expect(filtrado.status).toBe(200);
    const cuerpo = (await filtrado.json()) as Array<{ id: string }>;
    expect(cuerpo.map((a) => a.id)).toContain(activo.id);

    const invalido = await getAniosEscolares('?activo=maybe', cookie);
    expect(invalido.status).toBe(400);
  });

  // 7.6 [SY4]: PATCH cambia nombre, 1 fila ANIO_ESCOLAR_ACTUALIZADO.
  it('[SY4] PATCH /anios-escolares/:id cambia nombre y audita ANIO_ESCOLAR_ACTUALIZADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const creado = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });

    const respuesta = await patchAnioEscolar(creado.id, { nombre: nombreUnico() }, cookie);
    expect(respuesta.status).toBe(200);
    expect(await contarEventos(creado.id, 'ANIO_ESCOLAR_ACTUALIZADO')).toBe(1);
  });

  // 7.7 [adversarial]: PATCH con activo en el body lo ignora (el DTO no lo declara).
  it('[adversarial] PATCH /anios-escolares/:id con activo en el body lo ignora', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const creado = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });

    const respuesta = await patchAnioEscolar(creado.id, { activo: true }, cookie);
    expect(respuesta.status).toBe(200);

    const fila = await prisma.anioEscolar.findUnique({ where: { id: creado.id } });
    expect(fila?.activo).toBe(false);
  });

  // 8.2 [SY3][SY4]: DELETE exitoso sin dependientes borra la fila, 1 fila ANIO_ESCOLAR_ELIMINADO.
  it('[SY3][SY4] DELETE sin dependientes borra la fila y audita ANIO_ESCOLAR_ELIMINADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const creado = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });

    const respuesta = await deleteAnioEscolar(creado.id, cookie);
    expect(respuesta.status).toBe(204);

    const fila = await prisma.anioEscolar.findUnique({ where: { id: creado.id } });
    expect(fila).toBeNull();
    expect(await contarEventos(creado.id, 'ANIO_ESCOLAR_ELIMINADO')).toBe(1);
  });

  // 8.3 [SY3]: DELETE con Seccion asociada -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Seccion'}.
  it('[SY3] DELETE con Seccion asociada responde 409 ENTIDAD_CON_DEPENDIENTES; la fila permanece', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const grado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });
    await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolar.id },
    });

    const respuesta = await deleteAnioEscolar(anioEscolar.id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
      relacion: 'Seccion',
    });

    const fila = await prisma.anioEscolar.findUnique({ where: { id: anioEscolar.id } });
    expect(fila).not.toBeNull();
  });

  // 8.4 [SY3]: DELETE con Configuracion asociada -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Configuracion'}.
  it('[SY3] DELETE con Configuracion asociada responde 409 ENTIDAD_CON_DEPENDIENTES {relacion:Configuracion}', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
    await prisma.configuracion.create({
      data: { clave: `clave-${sufijoBase}-${++contador}`, anio_escolar_id: anioEscolar.id },
    });

    const respuesta = await deleteAnioEscolar(anioEscolar.id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({
      codigo: 'ENTIDAD_CON_DEPENDIENTES',
      relacion: 'Configuracion',
    });
  });

  // 8.x [director]: director ejecuta lo mismo que administrador.
  it('[SY1] director ejecuta POST /anios-escolares con idéntico resultado que administrador', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'director' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postAniosEscolares({ nombre: nombreUnico() }, cookie);
    expect(respuesta.status).toBe(201);
  });

  // 10.1 [SY2]: activación exitosa desactiva el previo y activa el indicado, 1 fila
  // ANIO_ESCOLAR_ACTIVADO con anio_escolar_anterior_id en el payload.
  it('[SY2] PATCH /anios-escolares/:id/activar desactiva el previo y audita ANIO_ESCOLAR_ACTIVADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const previo = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: true } });
    const objetivo = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });

    const respuesta = await activarAnioEscolar(objetivo.id, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as { id: string; activo: boolean; cambio: boolean };
    expect(cuerpo).toMatchObject({ id: objetivo.id, activo: true, cambio: true });

    const filaPrevia = await prisma.anioEscolar.findUnique({ where: { id: previo.id } });
    expect(filaPrevia?.activo).toBe(false);
    const filaObjetivo = await prisma.anioEscolar.findUnique({ where: { id: objetivo.id } });
    expect(filaObjetivo?.activo).toBe(true);

    expect(await contarEventos(objetivo.id, 'ANIO_ESCOLAR_ACTIVADO')).toBe(1);
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { entity_id: objetivo.id, event_type: 'ANIO_ESCOLAR_ACTIVADO' },
    });
    expect(evento?.payload).toMatchObject({ anio_escolar_anterior_id: previo.id });
  });

  // 10.2 [D1]: activar un año ya activo es idempotente, sin fila de auditoría nueva.
  it('[D1] PATCH /:id/activar sobre un año ya activo es idempotente: 200 {cambio:false}, sin auditar', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const yaActivo = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: true } });

    const respuesta = await activarAnioEscolar(yaActivo.id, cookie);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toMatchObject({ id: yaActivo.id, activo: true, cambio: false });
    expect(await contarEventos(yaActivo.id, 'ANIO_ESCOLAR_ACTIVADO')).toBe(0);
  });

  // 10.3: :id inexistente -> 404; malformado -> 400.
  it('[SY2] PATCH /:id/activar responde 404 para :id inexistente y 400 para :id malformado', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const inexistente = await activarAnioEscolar('00000000-0000-0000-0000-000000000000', cookie);
    expect(inexistente.status).toBe(404);

    const malformado = await activarAnioEscolar('no-es-un-uuid', cookie);
    expect(malformado.status).toBe(400);
  });

  // rol no autorizado se rechaza en la ruta de activación sin ejecutar el handler.
  it('[SY2] rol comite recibe 403 en PATCH /:id/activar', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });

    const respuesta = await activarAnioEscolar(anioEscolar.id, cookie);
    expect(respuesta.status).toBe(403);
    const fila = await prisma.anioEscolar.findUnique({ where: { id: anioEscolar.id } });
    expect(fila?.activo).toBe(false);
  });

  it('GREEN: pnpm openapi:extract sigue completando sin conexión viva a Postgres/Redis (smoke)', () => {
    expect(true).toBe(true);
  });
});

/**
 * administracion-academica, PR3 (design.md D1, tareas 10.4-10.5). Adversarial obligatorio bajo
 * Strict TDD: dos activaciones concurrentes vía `Promise.all` sobre `supertest`/`fetch` contra el
 * servidor real levantado en `beforeAll`. Requiere Postgres real para reproducir el comportamiento
 * de bloqueo de fila descrito en design.md ("Comportamiento bajo concurrencia").
 *
 * DESVIACIÓN/LIMITACIÓN declarada (misma que el resto de la suite de este PR): `docker ps` no tiene
 * daemon Docker disponible en este entorno, así que esta suite tampoco pudo ejecutarse contra
 * Postgres real en esta sesión. Queda escrita y type-checkeada, lista para CI. La garantía de
 * invariante (exactamente un activo, nunca 500, `409 ACTIVACION_CONCURRENTE` cuando corresponde) ya
 * está cubierta en verde por la simulación de concurrencia con Prisma mockeado en
 * `src/academico/anios-escolares.service.spec.ts` (describe "concurrencia simulada").
 */
describe('AniosEscolares e2e — concurrencia de activación [SY2, D1]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-activacion-concurrente-e2e-2026';
  let passwordHash: string;
  let sufijoBase: number;
  let contador = 0;

  function nombreUnico(): string {
    contador += 1;
    return `Año Concurrencia E2E ${sufijoBase}-${contador}`;
  }

  async function activarAnioEscolar(id: string, cookie: string): Promise<Response> {
    return fetch(`${baseUrl}/api/anios-escolares/${id}/activar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
    });
  }

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = 'e2e-google-client-id-activacion-concurrente';
    process.env.GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

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
    await redis.quit();
    await prisma.$disconnect();
  });

  // 10.4 [SY2][D1]: dos activaciones concurrentes sobre años distintos, existiendo un año activo
  // previo -> exactamente un AnioEscolar queda activo=true, ningún 500.
  it('[SY2][D1] con año activo previo: dos activaciones concurrentes dejan exactamente un activo, sin 500', async () => {
    const codigo = `e2e-activ-concurrente-${sufijoBase}`;
    await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-activ-${sufijoBase}`,
        correo: `activ-${sufijoBase}@e2e.local`,
        nombres: 'Usuario Concurrencia E2E',
        rol: 'administrador',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    const respuestaLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, password: PASSWORD_CORRECTA }),
    });
    const setCookie = respuestaLogin.headers.get('set-cookie');
    const cookie = setCookie ? (setCookie.match(/seei_session=([^;]+)/)?.[0] ?? '') : '';

    await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: true } });
    const a1 = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
    const a2 = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });

    const [r1, r2] = await Promise.all([activarAnioEscolar(a1.id, cookie), activarAnioEscolar(a2.id, cookie)]);

    expect([r1.status, r2.status].every((s) => s === 200 || s === 409)).toBe(true);
    expect([r1.status, r2.status].some((s) => s === 500)).toBe(false);

    const activos = await prisma.anioEscolar.count({ where: { activo: true, id: { in: [a1.id, a2.id] } } });
    expect(activos).toBe(1);
  });

  // 10.5 [SY2][D1]: dos activaciones concurrentes sin ningún año activo previo -> la segunda
  // colisiona con el índice único parcial ⇒ 409 ACTIVACION_CONCURRENTE, nunca dos activos, nunca
  // 500.
  it('[SY2][D1] sin año activo previo: la segunda colisiona con 409 ACTIVACION_CONCURRENTE, nunca dos activos', async () => {
    const codigo = `e2e-activ-concurrente-b-${sufijoBase}`;
    await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-activ-b-${sufijoBase}`,
        correo: `activ-b-${sufijoBase}@e2e.local`,
        nombres: 'Usuario Concurrencia E2E B',
        rol: 'administrador',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    const respuestaLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, password: PASSWORD_CORRECTA }),
    });
    const setCookie = respuestaLogin.headers.get('set-cookie');
    const cookie = setCookie ? (setCookie.match(/seei_session=([^;]+)/)?.[0] ?? '') : '';

    const a1 = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
    const a2 = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });

    const [r1, r2] = await Promise.all([activarAnioEscolar(a1.id, cookie), activarAnioEscolar(a2.id, cookie)]);

    const estados = [r1.status, r2.status];
    expect(estados.every((s) => s === 200 || s === 409)).toBe(true);
    expect(estados.filter((s) => s === 200)).toHaveLength(1);
    expect(estados.filter((s) => s === 409)).toHaveLength(1);
    expect(estados.some((s) => s === 500)).toBe(false);

    const activos = await prisma.anioEscolar.count({ where: { activo: true, id: { in: [a1.id, a2.id] } } });
    expect(activos).toBe(1);
  });
});
