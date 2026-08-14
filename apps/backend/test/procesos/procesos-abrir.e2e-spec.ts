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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-procesos-abrir';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * apertura-proceso-congelamiento-padron (#13, PR4; design.md D3-D5/D6-D8/D11-D12, tareas
 * 12.1-14.2). Corre contra Postgres+Redis reales, mismo criterio que
 * `test/procesos/procesos-crear.e2e-spec.ts` (PR6 de `#11`) y
 * `test/procesos/procesos-listar-editar-eliminar.e2e-spec.ts` (PR7 de `#11`). El patrón de carrera
 * real (Phase 13) espeja `test/academico/anios-escolares.e2e-spec.ts:489`
 * (`Promise.all` + `fetch` contra el servidor real con el pool de conexiones de Prisma real).
 */
describe('POST /procesos/:id/abrir e2e — idempotencia, 409, carrera real y regresión [D3-D5/D6-D8/D11/D12]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-procesos-abrir-e2e-2026';
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

  async function postAbrir(id: string, cookie: string | null, body: unknown = { confirmar: true }): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}/abrir`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function patchEditar(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}`, { method: 'PATCH', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function deleteEliminar(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}`, { method: 'DELETE', headers: headersCon(cookie) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Procesos Abrir E2E ${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-procesos-abrir-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `procesos-abrir-${sufijo}@e2e.local`,
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

  interface MatriculaOverrides {
    conApoderado?: boolean;
  }

  async function matricularEstudiante(aulaId: string, anioEscolarId: string, overrides: MatriculaOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const estudiante = await prisma.usuario.create({
      data: {
        codigo: `e2e-procesos-abrir-est-${sufijo}`,
        dni: `est-${sufijo}`,
        correo: `est-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
      },
    });
    await prisma.matricula.create({ data: { usuario_id: estudiante.id, aula_id: aulaId, anio_escolar_id: anioEscolarId } });
    if (overrides.conApoderado) {
      await prisma.apoderado.create({
        data: { nombres: `Apoderado E2E ${sufijo}`, dni: `apo-${sufijo}`, usuario_id: estudiante.id },
      });
    }
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

  async function crearProcesoBorrador(
    cookie: string,
    anioEscolarId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; aulaId: string }> {
    const { aula } = await crearArbolConAula(anioEscolarId);
    await matricularEstudiante(aula.id, anioEscolarId, { conApoderado: overrides.publico_objetivo === 'comunidad' });
    const respuesta = await postCrear(dtoBase({ aula_ids: [aula.id], ...overrides }), cookie);
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

  // Índice único parcial `WHERE activo = true` en AnioEscolar: sin esto, el siguiente test que
  // llame crearAnioEscolarActivo() rompe la constraint contra el AnioEscolar que dejó el anterior.
  afterEach(async () => {
    await prisma.anioEscolar.updateMany({ data: { activo: false } });
  });

  // 12.2: apertura exitosa desde borrador -> 200, estado='abierto', apertura_real cae entre el
  // clock_timestamp() previo y posterior de la propia base, nunca comparado contra Date.now() de
  // Node.
  it('[12.2] apertura exitosa desde borrador sella apertura_real con el reloj de Postgres', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const [{ antes }] = await prisma.$queryRaw<{ antes: Date }[]>`SELECT clock_timestamp() AS antes`;

    const respuesta = await postAbrir(id, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.estado).toBe('abierto');

    const [{ despues }] = await prisma.$queryRaw<{ despues: Date }[]>`SELECT clock_timestamp() AS despues`;

    const aperturaReal = new Date(cuerpo.apertura_real).getTime();
    expect(aperturaReal).toBeGreaterThanOrEqual(antes.getTime());
    expect(aperturaReal).toBeLessThanOrEqual(despues.getTime());

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
    expect(proceso.estado).toBe('abierto');
    expect(proceso.apertura_real).not.toBeNull();
  });

  // 12.3: reintento sobre proceso ya abierto -> 200 idempotente, mismo cuerpo, sin filas
  // DerechoVoto adicionales, sin segunda fila PROCESO_ABIERTO.
  it('[12.3] reintento sobre proceso ya abierto es idempotente: mismo cuerpo, sin filas ni auditoría adicionales', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const primera = await postAbrir(id, cookie);
    expect(primera.status).toBe(200);
    const cuerpoPrimera = await primera.json();

    const derechosAntes = await prisma.derechoVoto.count({ where: { proceso_id: id } });
    const eventosAntes = await prisma.eventoAuditoria.count({ where: { event_type: 'PROCESO_ABIERTO', entity_id: id } });
    expect(eventosAntes).toBe(1);

    const segunda = await postAbrir(id, cookie);
    expect(segunda.status).toBe(200);
    const cuerpoSegunda = await segunda.json();
    expect(cuerpoSegunda).toEqual(cuerpoPrimera);

    const derechosDespues = await prisma.derechoVoto.count({ where: { proceso_id: id } });
    expect(derechosDespues).toBe(derechosAntes);

    const eventosDespues = await prisma.eventoAuditoria.count({ where: { event_type: 'PROCESO_ABIERTO', entity_id: id } });
    expect(eventosDespues).toBe(1);
  });

  // 12.4: abrir sobre cerrado/acta_emitida -> 409 PROCESO_NO_ABRIBLE { estado }, proceso sin
  // cambio.
  it.each(['cerrado', 'acta_emitida'] as const)(
    '[12.4] abrir sobre estado=%s responde 409 PROCESO_NO_ABRIBLE, el proceso no cambia',
    async (estado) => {
      const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
      const cookie = await loginYObtenerCookie(codigo);
      const anioEscolar = await crearAnioEscolarActivo();
      const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);
      await prisma.procesoElectoral.update({ where: { id }, data: { estado } });

      const respuesta = await postAbrir(id, cookie);
      expect(respuesta.status).toBe(409);
      expect(await respuesta.json()).toMatchObject({ codigo: 'PROCESO_NO_ABRIBLE', estado });

      const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
      expect(proceso.estado).toBe(estado);
      expect(await prisma.derechoVoto.count({ where: { proceso_id: id } })).toBe(0);
    },
  );

  // 12.5: conteo exacto de DerechoVoto por tipo de proceso (estudiantes/padres/comunidad), doble
  // fila verificada en comunidad.
  it('[12.5] publico_objetivo=estudiantes materializa solo filas en_calidad_de=estudiante', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula.id, anioEscolar.id, { conApoderado: true });
    const respuestaCrear = await postCrear(dtoBase({ aula_ids: [aula.id], publico_objetivo: 'estudiantes' }), cookie);
    expect(respuestaCrear.status).toBe(201);
    const { id } = await respuestaCrear.json();

    const respuesta = await postAbrir(id, cookie);
    expect(respuesta.status).toBe(200);

    const filas = await prisma.derechoVoto.findMany({ where: { proceso_id: id } });
    expect(filas).toHaveLength(1);
    expect(filas[0].en_calidad_de).toBe('estudiante');
  });

  it('[12.5] publico_objetivo=padres materializa solo filas en_calidad_de=padre', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula.id, anioEscolar.id, { conApoderado: true });
    const respuestaCrear = await postCrear(dtoBase({ aula_ids: [aula.id], publico_objetivo: 'padres' }), cookie);
    expect(respuestaCrear.status).toBe(201);
    const { id } = await respuestaCrear.json();

    const respuesta = await postAbrir(id, cookie);
    expect(respuesta.status).toBe(200);

    const filas = await prisma.derechoVoto.findMany({ where: { proceso_id: id } });
    expect(filas).toHaveLength(1);
    expect(filas[0].en_calidad_de).toBe('padre');
  });

  it('[12.5] publico_objetivo=comunidad materializa doble derecho (estudiante+padre) para la misma cuenta', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    const estudiante = await matricularEstudiante(aula.id, anioEscolar.id, { conApoderado: true });
    const respuestaCrear = await postCrear(dtoBase({ aula_ids: [aula.id], publico_objetivo: 'comunidad' }), cookie);
    expect(respuestaCrear.status).toBe(201);
    const { id } = await respuestaCrear.json();

    const respuesta = await postAbrir(id, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.derechos_totales).toBe(2);
    expect(cuerpo.derechos_estudiante).toBe(1);
    expect(cuerpo.derechos_padre).toBe(1);

    const filas = await prisma.derechoVoto.findMany({ where: { proceso_id: id, usuario_id: estudiante.id } });
    expect(filas.map((f) => f.en_calidad_de).sort()).toEqual(['estudiante', 'padre']);
  });

  // 12.6: 401 sin cookie; 403 con estudiante/docente.
  it('[12.6] sin cookie responde 401, el proceso no cambia', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const respuesta = await postAbrir(id, null);
    expect(respuesta.status).toBe(401);

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
    expect(proceso.estado).toBe('borrador');
  });

  it.each(['docente', 'estudiante'] as const)('[12.6] rol %s responde 403, el proceso no cambia', async (rol) => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookieAdmin, anioEscolar.id);

    const { codigo } = await crearUsuarioDirecto({ rol });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postAbrir(id, cookie);
    expect(respuesta.status).toBe(403);

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
    expect(proceso.estado).toBe('borrador');
  });

  // 12.7: payload de inyección en :id -> 400, cero filas afectadas [threat matrix: SQL crudo
  // parametrizado].
  it('[12.7][adversarial] :id no-UUID responde 400, cero filas afectadas', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    await crearAnioEscolarActivo();

    const antesProcesos = await prisma.procesoElectoral.count();

    const respuesta = await postAbrir("1; DROP TABLE \"ProcesoElectoral\"; --", cookie);
    expect(respuesta.status).toBe(400);

    expect(await prisma.procesoElectoral.count()).toBe(antesProcesos);
  });

  // Phase 13 (D4, núcleo del change): carrera real con Promise.all sobre el mismo proceso.
  it('[13.1] dos POST /abrir concurrentes sobre el mismo proceso: ambas 200, nunca 500, exactamente un conjunto de DerechoVoto', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const [r1, r2] = await Promise.all([postAbrir(id, cookie), postAbrir(id, cookie)]);

    expect([r1.status, r2.status].every((s) => s === 200)).toBe(true);
    expect([r1.status, r2.status].some((s) => s === 500)).toBe(false);

    const cuerpo1 = await r1.json();
    const cuerpo2 = await r2.json();
    // D5/D10: el 200 idempotente y el 200 real describen el estado VIGENTE — ambas respuestas
    // deben coincidir en los conteos finales, sin bandera "ya_estaba_abierto".
    expect(cuerpo1.derechos_totales).toBe(cuerpo2.derechos_totales);
    expect(cuerpo1.derechos_totales).toBeGreaterThan(0);

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
    expect(proceso.estado).toBe('abierto');

    const totalDerechos = await prisma.derechoVoto.count({ where: { proceso_id: id } });
    expect(totalDerechos).toBe(cuerpo1.derechos_totales);

    // D1/D8: red de seguridad final — cero duplicados por (proceso_id, usuario_id, en_calidad_de).
    const filas = await prisma.derechoVoto.findMany({ where: { proceso_id: id } });
    const claves = filas.map((f) => `${f.proceso_id}:${f.usuario_id}:${f.en_calidad_de}`);
    expect(new Set(claves).size).toBe(claves.length);

    const eventos = await prisma.eventoAuditoria.count({ where: { event_type: 'PROCESO_ABIERTO', entity_id: id } });
    expect(eventos).toBe(1);
  });

  // Phase 14 (D12): regresión de editar()/eliminar() tras apertura real.
  it('[14.1] PATCH sobre proceso ya abierto responde 409 PROCESO_NO_EDITABLE, ocultar_resultados y aulas sin cambio', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, aulaId } = await crearProcesoBorrador(cookie, anioEscolar.id, { ocultar_resultados: true });

    const respuestaAbrir = await postAbrir(id, cookie);
    expect(respuestaAbrir.status).toBe(200);

    const { aula: aulaNueva } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aulaNueva.id, anioEscolar.id);

    const respuesta = await patchEditar(
      id,
      { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aulaNueva.id], ocultar_resultados: false },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'PROCESO_NO_EDITABLE', estado: 'abierto' });

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
    expect(proceso.ocultar_resultados).toBe(true);
    const procesoAulas = await prisma.procesoAula.findMany({ where: { proceso_id: id } });
    expect(procesoAulas.map((pa) => pa.aula_id)).toEqual([aulaId]);
  });

  it('[14.1] DELETE sobre proceso ya abierto responde 409 PROCESO_NO_EDITABLE, la fila permanece', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id);

    const respuestaAbrir = await postAbrir(id, cookie);
    expect(respuestaAbrir.status).toBe(200);

    const respuesta = await deleteEliminar(id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'PROCESO_NO_EDITABLE', estado: 'abierto' });

    const proceso = await prisma.procesoElectoral.findUnique({ where: { id } });
    expect(proceso).not.toBeNull();
    expect(proceso?.estado).toBe('abierto');
  });
});
