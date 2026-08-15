import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { Client as PgClient } from 'pg';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-outbox-atomicidad';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * outbox-correo-comprobante-autenticado (#15, PR1; design.md "Estrategia de pruebas", tareas
 * 4.1-4.4). Prueba de CIERRE del ADR-0018: `Voto` y `JobCorreo` nacen en la misma transacción —
 * commit conjunto, rollback conjunto. Mismo patrón que `test/votos/votos-emitir.e2e-spec.ts`
 * (fetch real + `PrismaClient` propio para asertar filas). La restricción
 * `ALTER TABLE "JobCorreo" ADD CONSTRAINT tmp_falla CHECK (false) NOT VALID` es el disparador
 * determinista de fallo DESPUÉS del punto de extensión `[#15]`, sin hooks en el código de
 * producción.
 */
describe('POST /votos e2e — atomicidad Voto+JobCorreo (cierre del ADR-0018) [D2-D4]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-outbox-atomicidad-e2e-2026';
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

  async function postVotos(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/votos`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Outbox Atomicidad E2E ${sufijoBase}-${contador}`;
  }

  async function crearUsuarioDirecto() {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-outbox-atom-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `outbox-atom-${sufijo}@e2e.local`,
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

  async function crearVotante(aulaId: string, anioEscolarId: string) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-outbox-atom-est-${sufijo}`;
    const estudiante = await prisma.usuario.create({
      data: {
        codigo,
        dni: `est-${sufijo}`,
        correo: `est-outbox-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    await prisma.matricula.create({ data: { usuario_id: estudiante.id, aula_id: aulaId, anio_escolar_id: anioEscolarId } });
    const cookie = await loginYObtenerCookie(codigo);
    return { estudiante, codigo, cookie };
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

  async function crearProcesoAbiertoConVotante(cookieAdmin: string, anioEscolarId: string) {
    const { aula } = await crearArbolConAula(anioEscolarId);
    const votante = await crearVotante(aula.id, anioEscolarId);

    const respuestaCrear = await postCrear(dtoProceso({ aula_ids: [aula.id] }), cookieAdmin);
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoId } = await respuestaCrear.json();

    const respuestaAbrir = await postAbrir(procesoId, cookieAdmin);
    expect(respuestaAbrir.status).toBe(200);

    const lista = await prisma.lista.create({
      data: { proceso_id: procesoId, nombre: nombreUnico(), numero: 1, estado: 'activo' },
    });

    return { procesoId, votante, lista, aulaId: aula.id };
  }

  async function derechoDe(procesoId: string, usuarioId: string) {
    return prisma.derechoVoto.findFirstOrThrow({ where: { proceso_id: procesoId, usuario_id: usuarioId, en_calidad_de: 'estudiante' } });
  }

  function claveIdempotencia(): string {
    contador += 1;
    return `clave-outbox-${sufijoBase}-${contador}`;
  }

  const CLAVES_PROHIBIDAS_ELECCION = ['lista', 'opcion', 'candidato', 'blanco'];

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

  // 4.1: commit conjunto -- POST /votos crea exactamente 1 Voto y 1 JobCorreo con
  // voto_id=voto.id, estado='pendiente', intentos=0, y cuerpo sin subcadenas de la elección.
  it('[4.1] commit conjunto: crea exactamente 1 Voto y 1 JobCorreo asociado por voto_id, pendiente, sin la elección', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    const respuesta = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );

    expect(respuesta.status).toBe(201);
    const voto = await prisma.voto.findFirstOrThrow({ where: { derecho_voto_id: derecho.id } });

    const jobs = await prisma.jobCorreo.findMany({ where: { voto_id: voto.id } });
    expect(jobs).toHaveLength(1);
    const job = jobs[0];
    expect(job.estado).toBe('pendiente');
    expect(job.intentos).toBe(0);
    expect(job.proceso_id).toBe(procesoId);
    expect(job.codigo_comprobante).toBe(voto.codigo_comprobante);
    expect(job.usuario_id).toBe(votante.estudiante.id);

    const cuerpoMinusculas = job.cuerpo.toLowerCase();
    for (const prohibida of CLAVES_PROHIBIDAS_ELECCION) {
      expect(cuerpoMinusculas).not.toContain(prohibida);
    }
    expect(job.cuerpo).not.toContain('eleccion_resumen');
  });

  // 4.2: rollback conjunto -- una restricción CHECK(false) NOT VALID sobre JobCorreo, aplicada
  // ANTES del POST, hace fallar el insert del marcador [#15] -- 5xx, 0 Voto, 0 JobCorreo.
  it('[4.2] rollback conjunto: un fallo posterior al marcador [#15] revierte Voto y JobCorreo juntos', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    // `seei_app` (DATABASE_URL, rol de runtime) no tiene privilegios de DDL -- el ALTER TABLE debe
    // correr con el rol propietario (MIGRATION_DATABASE_URL/seei_migrator), igual que las
    // migraciones reales. `postVotos()` sigue usando la app real, que se conecta con `seei_app`.
    const migrador = new PgClient({ connectionString: process.env.MIGRATION_DATABASE_URL });
    await migrador.connect();
    await migrador.query(`ALTER TABLE "JobCorreo" ADD CONSTRAINT tmp_falla CHECK (false) NOT VALID`);

    try {
      const respuesta = await postVotos(
        { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
        votante.cookie,
      );

      expect(respuesta.status).toBeGreaterThanOrEqual(500);

      const votos = await prisma.voto.findMany({ where: { derecho_voto_id: derecho.id } });
      expect(votos).toHaveLength(0);
      const jobs = await prisma.jobCorreo.count({ where: { proceso_id: procesoId } });
      expect(jobs).toBe(0);
    } finally {
      await migrador.query(`ALTER TABLE "JobCorreo" DROP CONSTRAINT tmp_falla`);
      await migrador.end();
    }
  });

  // 4.3: idempotencia de #14 preservada -- reintento con la misma clave_idempotencia responde 200
  // y sigue habiendo exactamente 1 JobCorreo (sin insert duplicado).
  it('[4.3] idempotencia preservada: reintento con la misma clave responde 200, sigue habiendo 1 JobCorreo', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);
    const clave = claveIdempotencia();

    const primera = await postVotos({ derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: clave }, votante.cookie);
    expect(primera.status).toBe(201);

    const segunda = await postVotos({ derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: clave }, votante.cookie);
    expect(segunda.status).toBe(200);

    const voto = await prisma.voto.findFirstOrThrow({ where: { derecho_voto_id: derecho.id } });
    const jobs = await prisma.jobCorreo.count({ where: { voto_id: voto.id } });
    expect(jobs).toBe(1);
  });
});
