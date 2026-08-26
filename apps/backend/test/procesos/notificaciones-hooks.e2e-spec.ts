import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario } from '@prisma/client';
import Redis from 'ioredis';
import { Client as PgClient } from 'pg';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-notificaciones-hooks';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * notificaciones (#19, PR4; design.md D5, tareas 10.1-11.1). Corre contra Postgres+Redis reales,
 * mismo patrón que `test/procesos/procesos-abrir.e2e-spec.ts`/`procesos-cerrar.e2e-spec.ts` y el
 * disparador determinista de fallo de `test/votos/outbox-atomicidad.e2e-spec.ts` (CHECK(false) NOT
 * VALID sobre `JobCorreo`, aplicado con `MIGRATION_DATABASE_URL` porque `seei_app` no tiene DDL).
 * Ejercita los DOS hooks de `procesos.service.ts` (`abrir()`/`cerrar()`) llamando a
 * `emitirNotificaciones(tx, …)` (PR3) tras `auditoria.log(...)` y antes del `return`, solo en la
 * rama de transición real — nunca en el no-op idempotente.
 */
describe('Hooks de notificaciones en abrir()/cerrar() e2e [D5]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-notificaciones-hooks-e2e-2026';
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

  async function postCerrar(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}/cerrar`, {
      method: 'POST',
      headers: headersCon(cookie),
      body: JSON.stringify({ confirmar: true, firmantes: [{ nombre: 'Ana Presidenta', cargo: 'Presidenta del comité' }] }),
    });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Notificaciones Hooks E2E ${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-notif-hooks-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `notif-hooks-${sufijo}@e2e.local`,
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

  interface MatriculaOverrides {
    conApoderado?: boolean;
  }

  async function matricularEstudiante(aulaId: string, anioEscolarId: string, overrides: MatriculaOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const estudiante = await prisma.usuario.create({
      data: {
        codigo: `e2e-notif-hooks-est-${sufijo}`,
        dni: `est-${sufijo}`,
        correo: `est-notif-hooks-${sufijo}@e2e.local`,
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

  function dtoProceso(overrides: Record<string, unknown> = {}) {
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
    numeroElegibles = 1,
  ): Promise<{ id: string; aulaId: string; elegibles: string[] }> {
    const { aula } = await crearArbolConAula(anioEscolarId);
    const elegibles: string[] = [];
    for (let i = 0; i < numeroElegibles; i += 1) {
      const estudiante = await matricularEstudiante(aula.id, anioEscolarId, {
        conApoderado: overrides.publico_objetivo === 'comunidad',
      });
      elegibles.push(estudiante.id);
    }
    const respuesta = await postCrear(dtoProceso({ aula_ids: [aula.id], ...overrides }), cookie);
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    return { id: cuerpo.id, aulaId: aula.id, elegibles };
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

  // 10.1: apertura con N habilitados ⇒ N Notificacion(evento='inicio_votacion') + N
  // JobCorreo(origen='notificacion', estado='pendiente').
  it('[10.1] apertura con N habilitados crea N Notificacion(inicio_votacion) + N JobCorreo(origen=notificacion)', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, elegibles } = await crearProcesoBorrador(cookie, anioEscolar.id, {}, 3);

    const respuesta = await postAbrir(id, cookie);
    expect(respuesta.status).toBe(200);

    const notificaciones = await prisma.notificacion.findMany({ where: { proceso_id: id, evento: 'inicio_votacion' } });
    expect(notificaciones).toHaveLength(elegibles.length);
    expect(notificaciones.map((n) => n.usuario_id).sort()).toEqual([...elegibles].sort());
    for (const notificacion of notificaciones) {
      expect(notificacion.tipo).toBe('interna');
      expect(notificacion.job_correo_id).not.toBeNull();
    }

    const jobIds = notificaciones.map((n) => n.job_correo_id) as string[];
    const jobs = await prisma.jobCorreo.findMany({ where: { id: { in: jobIds } } });
    expect(jobs).toHaveLength(elegibles.length);
    for (const job of jobs) {
      expect(job.origen).toBe('notificacion');
      expect(job.estado).toBe('pendiente');
    }

    const eventos = await prisma.eventoAuditoria.count({ where: { event_type: 'NOTIFICACIONES_EMITIDAS', entity_id: id } });
    expect(eventos).toBe(1);
  });

  // 10.2: apertura que falla (CHECK(false) NOT VALID sobre JobCorreo, disparado dentro de la misma
  // transacción por emitirNotificaciones()) ⇒ cero DerechoVoto, cero Notificacion, cero JobCorreo —
  // rollback conjunto de TODA la transacción de abrir(), mismo criterio de
  // `outbox-atomicidad.e2e-spec.ts`.
  it('[10.2] apertura que falla revierte DerechoVoto, Notificacion y JobCorreo juntos', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id } = await crearProcesoBorrador(cookie, anioEscolar.id, {}, 2);

    // JobCorreo de origen notificacion no lleva proceso_id (D4: sólo Notificacion lo tiene) — se
    // mide por DELTA contra el conteo global tomado justo antes del POST, no por un total absoluto
    // (la suite entera comparte la misma base y otros tests ya insertaron filas propias).
    const jobsNotificacionAntes = await prisma.jobCorreo.count({ where: { origen: 'notificacion' } });

    const migrador = new PgClient({ connectionString: process.env.MIGRATION_DATABASE_URL });
    await migrador.connect();
    await migrador.query(`ALTER TABLE "JobCorreo" ADD CONSTRAINT tmp_falla_notif CHECK (false) NOT VALID`);

    try {
      const respuesta = await postAbrir(id, cookie);
      expect(respuesta.status).toBeGreaterThanOrEqual(500);

      const proceso = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id } });
      expect(proceso.estado).toBe('borrador');
      expect(await prisma.derechoVoto.count({ where: { proceso_id: id } })).toBe(0);
      expect(await prisma.notificacion.count({ where: { proceso_id: id } })).toBe(0);
      expect(await prisma.jobCorreo.count({ where: { origen: 'notificacion' } })).toBe(jobsNotificacionAntes);
      expect(await prisma.eventoAuditoria.count({ where: { event_type: 'PROCESO_ABIERTO', entity_id: id } })).toBe(0);
      expect(await prisma.eventoAuditoria.count({ where: { event_type: 'NOTIFICACIONES_EMITIDAS', entity_id: id } })).toBe(0);
    } finally {
      await migrador.query(`ALTER TABLE "JobCorreo" DROP CONSTRAINT tmp_falla_notif`);
      await migrador.end();
    }
  });

  // 10.3: segunda apertura (no-op idempotente, D5) ⇒ siguen N Notificacion/JobCorreo, sin duplicar
  // — el hook NUNCA corre en la rama de no-op.
  it('[10.3] reintento de apertura sobre proceso ya abierto no duplica Notificacion ni JobCorreo', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, elegibles } = await crearProcesoBorrador(cookie, anioEscolar.id, {}, 2);

    const primera = await postAbrir(id, cookie);
    expect(primera.status).toBe(200);

    const notificacionesAntes = await prisma.notificacion.count({ where: { proceso_id: id, evento: 'inicio_votacion' } });
    expect(notificacionesAntes).toBe(elegibles.length);
    const jobsAntes = await prisma.jobCorreo.count({ where: { origen: 'notificacion' } });

    const segunda = await postAbrir(id, cookie);
    expect(segunda.status).toBe(200);

    const notificacionesDespues = await prisma.notificacion.count({ where: { proceso_id: id, evento: 'inicio_votacion' } });
    expect(notificacionesDespues).toBe(notificacionesAntes);
    const jobsDespues = await prisma.jobCorreo.count({ where: { origen: 'notificacion' } });
    expect(jobsDespues).toBe(jobsAntes);

    const eventos = await prisma.eventoAuditoria.count({ where: { event_type: 'NOTIFICACIONES_EMITIDAS', entity_id: id } });
    expect(eventos).toBe(1);
  });

  // 10.4: alcance comunidad (2 DerechoVoto por la misma cuenta: estudiante+padre, D5/C4) ⇒ UNA
  // notificación, no dos — el SELECT DISTINCT usuario_id evita el correo/aviso duplicado.
  it('[10.4] alcance comunidad crea una sola Notificacion por cuenta con doble DerechoVoto', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, elegibles } = await crearProcesoBorrador(cookie, anioEscolar.id, { publico_objetivo: 'comunidad' }, 1);

    const respuesta = await postAbrir(id, cookie);
    expect(respuesta.status).toBe(200);

    const derechos = await prisma.derechoVoto.findMany({ where: { proceso_id: id, usuario_id: elegibles[0] } });
    expect(derechos).toHaveLength(2);
    expect(derechos.map((d) => d.en_calidad_de).sort()).toEqual(['estudiante', 'padre']);

    const notificaciones = await prisma.notificacion.findMany({ where: { proceso_id: id, evento: 'inicio_votacion' } });
    expect(notificaciones).toHaveLength(1);
    expect(notificaciones[0].usuario_id).toBe(elegibles[0]);
  });

  // 10.5: cierre ⇒ N Notificacion(evento='resultados'); doble cierre (no-op idempotente) ⇒ siguen
  // N, sin duplicar.
  it('[10.5] cierre crea N Notificacion(resultados); doble cierre no duplica', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { id, elegibles } = await crearProcesoBorrador(cookie, anioEscolar.id, {}, 2);

    const respuestaAbrir = await postAbrir(id, cookie);
    expect(respuestaAbrir.status).toBe(200);

    const primera = await postCerrar(id, cookie);
    expect(primera.status).toBe(200);

    const notificacionesResultados = await prisma.notificacion.findMany({ where: { proceso_id: id, evento: 'resultados' } });
    expect(notificacionesResultados).toHaveLength(elegibles.length);

    const segunda = await postCerrar(id, cookie);
    expect(segunda.status).toBe(200);

    const notificacionesDespues = await prisma.notificacion.count({ where: { proceso_id: id, evento: 'resultados' } });
    expect(notificacionesDespues).toBe(elegibles.length);

    const eventos = await prisma.eventoAuditoria.count({ where: { event_type: 'NOTIFICACIONES_EMITIDAS', entity_id: id } });
    // Uno agregado por abrir() (inicio_votacion) y uno agregado por cerrar() (resultados) — el
    // segundo cerrar() no-op no vuelve a auditar (D5, mismo criterio que PROCESO_CERRADO).
    expect(eventos).toBe(2);
  });
});
