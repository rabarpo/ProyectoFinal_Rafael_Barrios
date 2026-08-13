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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-procesos-listar-editar-eliminar';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-procesos-electorales, PR7 (design.md "Contratos HTTP"/D3/D5/D6, tareas
 * 19.2-19.4/20.2-20.6/21.1-21.4). Corre contra Postgres+Redis reales, mismo criterio que
 * `test/procesos/procesos-crear.e2e-spec.ts` (PR6).
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR6 de este change): `docker ps` no tiene daemon
 * Docker disponible en este entorno, así que esta suite NO pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada. Cobertura equivalente en verde en
 * `src/procesos/procesos.service.spec.ts` (Prisma mockeado, 19.2-19.4/20.2-20.6/21.1-21.3).
 */
describe('GET/PATCH/DELETE /procesos e2e — listado, edición y eliminación [D3/D5/D6]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-procesos-listar-e2e-2026';
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

  async function postCrear(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getListar(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos${query}`, { headers: headersCon(cookie) });
  }

  async function getDetalle(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}`, { headers: headersCon(cookie) });
  }

  async function patchEditar(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}`, { method: 'PATCH', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function deleteEliminar(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}`, { method: 'DELETE', headers: headersCon(cookie) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Procesos Listar/Editar/Eliminar E2E ${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-procesos-list-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `procesos-list-${sufijo}@e2e.local`,
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

  async function crearAnioEscolarActivo() {
    return prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: true } });
  }

  async function crearArbolConAula(anioEscolarId: string) {
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const grado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });
    const seccion = await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolarId },
    });
    const aula = await prisma.aula.create({
      data: { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolarId },
    });
    return { nivel, grado, seccion, aula };
  }

  async function matricularEstudiante(aulaId: string, anioEscolarId: string) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const estudiante = await prisma.usuario.create({
      data: {
        codigo: `e2e-procesos-list-est-${sufijo}`,
        dni: `est-${sufijo}`,
        correo: `est-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
      },
    });
    await prisma.matricula.create({ data: { usuario_id: estudiante.id, aula_id: aulaId, anio_escolar_id: anioEscolarId } });
    return estudiante;
  }

  function dtoBase(overrides: Record<string, unknown> = {}) {
    return {
      nombre: nombreUnico(),
      tipo: 'representante_aula',
      fecha_apertura_prevista: '2026-09-01T09:00:00.000Z',
      fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
      publico_objetivo: 'estudiantes',
      alcance: 'aulas',
      ...overrides,
    };
  }

  async function crearProcesoBorrador(cookie: string, anioEscolarId: string): Promise<{ id: string; aulaId: string }> {
    const { aula } = await crearArbolConAula(anioEscolarId);
    await matricularEstudiante(aula.id, anioEscolarId);
    const respuesta = await postCrear(dtoBase({ aula_ids: [aula.id] }), cookie);
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    return { id: cuerpo.id, aulaId: aula.id };
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

  // Índice único parcial `WHERE activo = true` en AnioEscolar (prisma/schema.prisma, comentario
  // sobre el modelo): sin esto, el segundo test de este archivo que llame
  // crearAnioEscolarActivo() rompe la constraint contra el AnioEscolar que dejó el test anterior.
  afterEach(async () => {
    await prisma.anioEscolar.updateMany({ data: { activo: false } });
  });

  // 19.2: GET /procesos?estado=borrador filtra correctamente.
  it('[19.2] GET /procesos?estado=borrador incluye únicamente procesos en borrador', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const respuesta = await getListar('?estado=borrador', cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.some((p: { id: string; estado: string }) => p.id === id && p.estado === 'borrador')).toBe(true);
  });

  // 19.3: valor de filtro desconocido -> 400 CAMPO_INVALIDO.
  it('[19.3] GET /procesos?estado=no-existe responde 400 CAMPO_INVALIDO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await getListar('?estado=no-existe', cookie);
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'CAMPO_INVALIDO' });
  });

  // 19.4: GET /procesos/:id incluye publico_objetivo, snapshot y ProcesoAula[].
  it('[19.4] GET /procesos/:id incluye publico_objetivo, snapshot y aulas', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, aulaId } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const respuesta = await getDetalle(id, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.publico_objetivo).toBe('estudiantes');
    expect(cuerpo.alcance).toBe('aulas');
    expect(cuerpo.aulas).toEqual([aulaId]);
  });

  // 20.2: PATCH regenera ProcesoAula[] según la nueva segmentación.
  it('[20.2] PATCH regenera ProcesoAula[] al cambiar la segmentación', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);
    const { aula: aulaNueva } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aulaNueva.id, anioEscolar.id);

    const respuesta = await patchEditar(
      id,
      { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aulaNueva.id] },
      cookie,
    );
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.aulas).toEqual([aulaNueva.id]);

    const procesoAulas = await prisma.procesoAula.findMany({ where: { proceso_id: id } });
    expect(procesoAulas.map((pa) => pa.aula_id)).toEqual([aulaNueva.id]);
  });

  // 20.3: PATCH con tipo/estado en el body no los cambia.
  it('[20.3] PATCH con tipo/estado en el body no los modifica', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, aulaId } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const respuesta = await patchEditar(
      id,
      { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aulaId], tipo: 'municipio', estado: 'abierto' },
      cookie,
    );
    expect(respuesta.status).toBe(200);

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
    expect(proceso.tipo).toBe('representante_aula');
    expect(proceso.estado).toBe('borrador');
  });

  // 20.4: PATCH sobre estado != borrador -> 409 PROCESO_NO_EDITABLE, sin cambios.
  it('[20.4] PATCH sobre estado != borrador responde 409 PROCESO_NO_EDITABLE, sin cambios', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);
    await prisma.procesoElectoral.update({ where: { id }, data: { estado: 'abierto' } });

    const respuesta = await patchEditar(id, { publico_objetivo: 'estudiantes', alcance: 'institucion' }, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'PROCESO_NO_EDITABLE' });

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
    expect(proceso.alcance).toBe('aulas');
  });

  // 20.5: reedición repetida sin límite de reintentos.
  it('[20.5] tres PATCH sucesivos del mismo borrador se procesan todos', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, aulaId } = await crearProcesoBorrador(cookie, anioEscolar.id);

    for (let intento = 0; intento < 3; intento += 1) {
      const respuesta = await patchEditar(
        id,
        { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aulaId], nombre: `Editado ${intento}` },
        cookie,
      );
      expect(respuesta.status).toBe(200);
    }

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
    expect(proceso.nombre).toBe('Editado 2');
  });

  // 20.6: exactamente una fila PROCESO_EDITADO por PATCH.
  it('[20.6] cada PATCH exitoso crea exactamente una fila PROCESO_EDITADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, aulaId } = await crearProcesoBorrador(cookie, anioEscolar.id);

    await patchEditar(id, { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aulaId] }, cookie);

    const eventos = await prisma.eventoAuditoria.findMany({ where: { event_type: 'PROCESO_EDITADO', entity_id: id } });
    expect(eventos).toHaveLength(1);
  });

  // 21.1: DELETE elimina el proceso y sus ProcesoAula en cascada.
  it('[21.1] DELETE elimina el proceso y cascada sus ProcesoAula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const respuesta = await deleteEliminar(id, cookie);
    expect(respuesta.status).toBe(204);

    expect(await prisma.procesoElectoral.findUnique({ where: { id } })).toBeNull();
    expect(await prisma.procesoAula.findMany({ where: { proceso_id: id } })).toHaveLength(0);
  });

  // 21.2: DELETE sobre estado != borrador -> 409 PROCESO_NO_EDITABLE, la fila permanece.
  it('[21.2] DELETE sobre estado != borrador responde 409 PROCESO_NO_EDITABLE, la fila permanece', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);
    await prisma.procesoElectoral.update({ where: { id }, data: { estado: 'cerrado' } });

    const respuesta = await deleteEliminar(id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'PROCESO_NO_EDITABLE' });
    expect(await prisma.procesoElectoral.findUnique({ where: { id } })).not.toBeNull();
  });

  // 21.3: exactamente una fila PROCESO_ELIMINADO por DELETE.
  it('[21.3] DELETE exitoso crea exactamente una fila PROCESO_ELIMINADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);

    await deleteEliminar(id, cookie);

    const eventos = await prisma.eventoAuditoria.findMany({ where: { event_type: 'PROCESO_ELIMINADO', entity_id: id } });
    expect(eventos).toHaveLength(1);
  });

  // 21.4: rol no autorizado rechazado en PATCH/DELETE sin ejecutar el handler.
  it('[21.4] rol docente responde 403 en PATCH y en DELETE, sin ejecutar el handler', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, aulaId } = await crearProcesoBorrador(cookieAdmin, anioEscolar.id);

    const { codigo } = await crearUsuarioDirecto({ rol: 'docente' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuestaPatch = await patchEditar(id, { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aulaId] }, cookie);
    expect(respuestaPatch.status).toBe(403);

    const respuestaDelete = await deleteEliminar(id, cookie);
    expect(respuestaDelete.status).toBe(403);

    expect(await prisma.procesoElectoral.findUnique({ where: { id } })).not.toBeNull();
  });

  it('[21.4] sin cookie responde 401 en PATCH y en DELETE', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, aulaId } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const respuestaPatch = await patchEditar(id, { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aulaId] }, null);
    expect(respuestaPatch.status).toBe(401);

    const respuestaDelete = await deleteEliminar(id, null);
    expect(respuestaDelete.status).toBe(401);
  });
});
