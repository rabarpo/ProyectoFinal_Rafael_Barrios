import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';
import { createPgClient } from '../schema/helpers/pg-client';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-procesos-cerrar';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * cierre-escrutinio-actas (#17, PR3; design.md D4/D6-D9/D14, tareas 12.1-13.3). Corre contra
 * Postgres+Redis reales, mismo patrón que `test/procesos/procesos-abrir.e2e-spec.ts` y
 * `test/resultados/resultados.e2e-spec.ts`: `fetch` real contra el servidor + `PrismaClient`
 * propio para preparar filas vía los flujos reales.
 */
describe('POST /procesos/:id/cerrar e2e — cierre, escrutinio, actas [D4/D6-D9/D14]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-procesos-cerrar-e2e-2026';
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

  async function postAbrir(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}/abrir`, {
      method: 'POST',
      headers: headersCon(cookie),
      body: JSON.stringify({ confirmar: true }),
    });
  }

  async function postCerrar(id: string, cookie: string | null, body: unknown = dtoCierre()): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}/cerrar`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function postVotos(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/votos`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Cerrar E2E ${sufijoBase}-${contador}`;
  }

  function dtoCierre(overrides: Record<string, unknown> = {}) {
    return { confirmar: true, firmantes: [{ nombre: 'Ana Presidenta', cargo: 'Presidenta del comité' }], ...overrides };
  }

  function claveIdempotencia(): string {
    contador += 1;
    return `clave-cerrar-${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-procesos-cerrar-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `procesos-cerrar-${sufijo}@e2e.local`,
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
    return { aula };
  }

  async function crearVotante(aulaId: string, anioEscolarId: string, rol: RolUsuario = 'estudiante') {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-procesos-cerrar-est-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `est-${sufijo}`,
        correo: `est-cerrar-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol,
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    await prisma.matricula.create({ data: { usuario_id: usuario.id, aula_id: aulaId, anio_escolar_id: anioEscolarId } });
    const cookie = await loginYObtenerCookie(codigo);
    return { usuario, codigo, cookie };
  }

  function dtoProceso(overrides: Record<string, unknown> = {}) {
    return {
      nombre: nombreUnico(),
      tipo: 'municipio',
      fecha_apertura_prevista: '2026-09-01T09:00:00.000Z',
      fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
      publico_objetivo: 'estudiantes',
      alcance: 'aulas',
      ...overrides,
    };
  }

  async function matricularBase(aulaId: string, anioEscolarId: string) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const estudiante = await prisma.usuario.create({
      data: {
        codigo: `e2e-procesos-cerrar-base-${sufijo}`,
        dni: `base-${sufijo}`,
        correo: `base-cerrar-${sufijo}@e2e.local`,
        nombres: `Estudiante Base E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
      },
    });
    await prisma.matricula.create({ data: { usuario_id: estudiante.id, aula_id: aulaId, anio_escolar_id: anioEscolarId } });
  }

  async function crearProcesoAbierto(cookieAdmin: string, anioEscolarId: string, overrides: Record<string, unknown> = {}) {
    const { aula } = await crearArbolConAula(anioEscolarId);
    // SEGMENTACION_SIN_ELEGIBLES exige al menos un elegible en el lote — matricula un estudiante
    // base ANTES de crear el proceso (idioma de procesos-abrir.e2e-spec.ts).
    await matricularBase(aula.id, anioEscolarId);
    const respuestaCrear = await postCrear(dtoProceso({ aula_ids: [aula.id], ...overrides }), cookieAdmin);
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoId } = await respuestaCrear.json();

    const respuestaAbrir = await postAbrir(procesoId, cookieAdmin);
    expect(respuestaAbrir.status).toBe(200);

    return { procesoId, aulaId: aula.id };
  }

  // A diferencia de `crearProcesoAbierto()` (que sólo matricula un elegible base para satisfacer
  // `SEGMENTACION_SIN_ELEGIBLES`), este helper matricula al VOTANTE de la prueba ANTES de crear y
  // abrir el proceso (idioma de `resultados.e2e-spec.ts`, `crearProcesoAbiertoConVotante()`):
  // `abrir()` materializa `DerechoVoto` sólo para quienes ya estaban matriculados en ese momento.
  async function crearProcesoAbiertoConVotante(
    cookieAdmin: string,
    anioEscolarId: string,
    overrides: Record<string, unknown> = {},
  ) {
    const { aula } = await crearArbolConAula(anioEscolarId);
    const votante = await crearVotante(aula.id, anioEscolarId);

    const respuestaCrear = await postCrear(dtoProceso({ aula_ids: [aula.id], ...overrides }), cookieAdmin);
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoId } = await respuestaCrear.json();

    const respuestaAbrir = await postAbrir(procesoId, cookieAdmin);
    expect(respuestaAbrir.status).toBe(200);

    return { procesoId, votante, aulaId: aula.id };
  }

  async function derechoDe(procesoId: string, usuarioId: string) {
    return prisma.derechoVoto.findFirstOrThrow({ where: { proceso_id: procesoId, usuario_id: usuarioId, en_calidad_de: 'estudiante' } });
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

  afterEach(async () => {
    await prisma.anioEscolar.updateMany({ data: { activo: false } });
  });

  // 12.1/spec "Cierre exitoso de un proceso abierto" + "Creación atómica de las 4 actas".
  it('[12.1] abierto -> 200, estado=cerrado, cierre_real sellado, 4 Acta en borrador con contenido JSON', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoAbierto(cookie, anioEscolar.id);

    const respuesta = await postCerrar(procesoId, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.estado).toBe('cerrado');
    expect(cuerpo.cierre_real).not.toBeNull();
    expect(cuerpo.actas_creadas).toBe(4);

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: procesoId } });
    expect(proceso.estado).toBe('cerrado');
    expect(proceso.cierre_real).not.toBeNull();

    const actas = await prisma.acta.findMany({ where: { proceso_id: procesoId } });
    expect(actas).toHaveLength(4);
    expect(actas.every((a) => a.estado === 'borrador')).toBe(true);
    expect(actas.map((a) => a.tipo).sort()).toEqual(['apertura', 'cierre', 'escrutinio', 'oficial']);
    for (const acta of actas) {
      expect(acta.contenido).toMatchObject({ version: 1, tipo: acta.tipo });
    }
  });

  // 12.2/spec "Doble cierre es idempotente".
  it('[12.2] segunda llamada responde 200 idéntico, siguen existiendo 4 actas', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoAbierto(cookie, anioEscolar.id);

    const primera = await postCerrar(procesoId, cookie);
    expect(primera.status).toBe(200);
    const cuerpoPrimera = await primera.json();

    const eventosAntes = await prisma.eventoAuditoria.count({ where: { event_type: 'PROCESO_CERRADO', entity_id: procesoId } });
    expect(eventosAntes).toBe(1);

    const segunda = await postCerrar(procesoId, cookie);
    expect(segunda.status).toBe(200);
    const cuerpoSegunda = await segunda.json();
    expect(cuerpoSegunda).toEqual(cuerpoPrimera);

    const actas = await prisma.acta.count({ where: { proceso_id: procesoId } });
    expect(actas).toBe(4);

    const eventosDespues = await prisma.eventoAuditoria.count({ where: { event_type: 'PROCESO_CERRADO', entity_id: procesoId } });
    expect(eventosDespues).toBe(1);
  });

  // 12.3/spec "Cierre de un proceso en borrador" + 404 + rol estudiante 403.
  it('[12.3] proceso en borrador -> 409 PROCESO_NO_CERRABLE', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularBase(aula.id, anioEscolar.id);
    const respuestaCrear = await postCrear(dtoProceso({ aula_ids: [aula.id] }), cookie);
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoIdBorrador } = await respuestaCrear.json();

    const respuesta = await postCerrar(procesoIdBorrador, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'PROCESO_NO_CERRABLE', estado: 'borrador' });
  });

  it('[12.3] UUID inexistente -> 404', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postCerrar('123e4567-e89b-12d3-a456-426614174000', cookie);
    expect(respuesta.status).toBe(404);
  });

  it('[12.3] rol estudiante -> 403, el proceso no cambia', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoAbierto(cookieAdmin, anioEscolar.id);

    const { codigo } = await crearUsuarioDirecto({ rol: 'estudiante' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postCerrar(procesoId, cookie);
    expect(respuesta.status).toBe(403);

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: procesoId } });
    expect(proceso.estado).toBe('abierto');
  });

  // 12.4/spec "Proceso con cero votos emitidos".
  it('[12.4] proceso sin ningún Voto -> 200, abstención total, 0%, sin error', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, aulaId } = await crearProcesoAbierto(cookie, anioEscolar.id);
    await crearVotante(aulaId, anioEscolar.id); // padrón > 0, pero nadie vota

    const respuesta = await postCerrar(procesoId, cookie);
    expect(respuesta.status).toBe(200);

    const actaCierre = await prisma.acta.findFirstOrThrow({ where: { proceso_id: procesoId, tipo: 'cierre' } });
    const contenido = actaCierre.contenido as { participacion: { votos_emitidos: number; porcentaje_participacion: number } };
    expect(contenido.participacion.votos_emitidos).toBe(0);
    expect(contenido.participacion.porcentaje_participacion).toBe(0);

    const actaEscrutinio = await prisma.acta.findFirstOrThrow({ where: { proceso_id: procesoId, tipo: 'escrutinio' } });
    const contenidoEscrutinio = actaEscrutinio.contenido as { escrutinio: { sin_votos: boolean; empate: { empate: boolean } } };
    expect(contenidoEscrutinio.escrutinio.sin_votos).toBe(true);
    expect(contenidoEscrutinio.escrutinio.empate.empate).toBe(false);
  });

  // 12.5/spec "Candidato/lista dado de baja en el desglose".
  it('[12.5] lista dada de baja aparece con estado:baja y baja_en en el acta de escrutinio', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookie, anioEscolar.id);

    const lista = await prisma.lista.create({ data: { proceso_id: procesoId, nombre: nombreUnico(), numero: 1, estado: 'activo' } });

    // La lista debe estar ACTIVA al momento del voto (votos.service.ts rechaza votar por una
    // opción en 'baja'); la baja ocurre DESPUÉS, antes del cierre — escenario real: el comité da de
    // baja una lista durante la jornada, y el escrutinio de cierre debe seguir mostrándola.
    const derecho = await derechoDe(procesoId, votante.usuario.id);
    const respuestaVoto = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(respuestaVoto.status).toBe(201);

    const bajaEn = new Date();
    await prisma.lista.update({ where: { id: lista.id }, data: { estado: 'baja', baja_en: bajaEn } });

    const respuesta = await postCerrar(procesoId, cookie);
    expect(respuesta.status).toBe(200);

    const actaEscrutinio = await prisma.acta.findFirstOrThrow({ where: { proceso_id: procesoId, tipo: 'escrutinio' } });
    const contenido = actaEscrutinio.contenido as {
      escrutinio: { desglose: { id: string; estado: string; baja_en: string | null; votos: number }[] };
    };
    const fila = contenido.escrutinio.desglose.find((f) => f.id === lista.id);
    expect(fila).toMatchObject({ estado: 'baja', votos: 1 });
    expect(fila?.baja_en).not.toBeNull();
  });

  // spec "Escrutinio con resultados ocultos".
  it('[12.6] proceso con ocultar_resultados=true -> acta de escrutinio con desglose completo, sin ocultarlo', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookie, anioEscolar.id, { ocultar_resultados: true });

    const lista = await prisma.lista.create({ data: { proceso_id: procesoId, nombre: nombreUnico(), numero: 1, estado: 'activo' } });
    const derecho = await derechoDe(procesoId, votante.usuario.id);
    const respuestaVoto = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(respuestaVoto.status).toBe(201);

    const respuesta = await postCerrar(procesoId, cookie);
    expect(respuesta.status).toBe(200);

    const actaEscrutinio = await prisma.acta.findFirstOrThrow({ where: { proceso_id: procesoId, tipo: 'escrutinio' } });
    const contenido = actaEscrutinio.contenido as { escrutinio: { desglose: { id: string; votos: number }[] } };
    expect(contenido.escrutinio.desglose).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: lista.id, votos: 1 })]),
    );
  });

  // 12.7 — reproducibilidad de TECH-DESIGN.md.
  it('[12.7] SELECT count(*) FROM Voto coincide con contenido->cuadre del acta de escrutinio', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookie, anioEscolar.id);

    const lista = await prisma.lista.create({ data: { proceso_id: procesoId, nombre: nombreUnico(), numero: 1, estado: 'activo' } });
    const derecho = await derechoDe(procesoId, votante.usuario.id);
    const respuestaVoto = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(respuestaVoto.status).toBe(201);

    await postCerrar(procesoId, cookie);

    const votosDb = await prisma.voto.count({ where: { proceso_id: procesoId } });
    const actaEscrutinio = await prisma.acta.findFirstOrThrow({ where: { proceso_id: procesoId, tipo: 'escrutinio' } });
    const contenido = actaEscrutinio.contenido as {
      escrutinio: { cuadre: { votos_por_opcion: number; blancos: number; nulos: number } };
    };
    const totalActa =
      contenido.escrutinio.cuadre.votos_por_opcion + contenido.escrutinio.cuadre.blancos + contenido.escrutinio.cuadre.nulos;
    expect(totalActa).toBe(votosDb);
  });

  // Phase 13 (D4, núcleo del change): carrera real con Promise.all.
  it('[13.1] dos POST /cerrar concurrentes: exactamente 4 Acta, un solo PROCESO_CERRADO, ningún 5xx', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoAbierto(cookie, anioEscolar.id);

    const [r1, r2] = await Promise.all([postCerrar(procesoId, cookie), postCerrar(procesoId, cookie)]);

    expect([r1.status, r2.status].every((s) => s === 200)).toBe(true);
    expect([r1.status, r2.status].some((s) => s >= 500)).toBe(false);

    const actas = await prisma.acta.count({ where: { proceso_id: procesoId } });
    expect(actas).toBe(4);

    const eventos = await prisma.eventoAuditoria.count({ where: { event_type: 'PROCESO_CERRADO', entity_id: procesoId } });
    expect(eventos).toBe(1);

    const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: procesoId } });
    expect(proceso.estado).toBe('cerrado');
  });

  // Phase 13 — arnés determinista que ejercita el catch de P2034 (D4).
  it('[13.2] UPDATE crudo sin commit + POST /cerrar bloqueado + commit crudo -> el endpoint responde 200 no-op', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoAbierto(cookie, anioEscolar.id);

    const pgClient = await createPgClient();
    try {
      await pgClient.query('BEGIN');
      await pgClient.query(
        `UPDATE "ProcesoElectoral" SET estado = 'cerrado', cierre_real = clock_timestamp() WHERE id = $1`,
        [procesoId],
      );

      const promesaEndpoint = postCerrar(procesoId, cookie);
      // Deja que el fetch llegue a bloquearse en el lock de fila antes de comprometer el crudo.
      await new Promise((resolve) => setTimeout(resolve, 300));
      await pgClient.query('COMMIT');

      const respuesta = await promesaEndpoint;
      expect(respuesta.status).toBe(200);
      const cuerpo = await respuesta.json();
      expect(cuerpo.estado).toBe('cerrado');

      const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: procesoId } });
      expect(proceso.estado).toBe('cerrado');
    } finally {
      await pgClient.end();
    }
  });
});
