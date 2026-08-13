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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-procesos-crear';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-procesos-electorales, PR6 (design.md "Contratos HTTP"/D3/D6, tareas 17.1-17.7).
 * Corre contra Postgres+Redis reales, mismo criterio que `test/procesos/padron.e2e-spec.ts` (PR5).
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR5 de este change): `docker ps` no tiene daemon
 * Docker disponible en este entorno, así que esta suite NO pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada. Cobertura equivalente en verde en
 * `src/procesos/procesos.service.spec.ts` (Prisma mockeado, 17.1-17.5/17.7).
 */
describe('POST /procesos e2e — creación y lote de ProcesoAula [D3/D6]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-procesos-crear-e2e-2026';
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
    return fetch(`${baseUrl}/api/procesos`, {
      method: 'POST',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Procesos Crear E2E ${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-procesos-crear-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `procesos-crear-${sufijo}@e2e.local`,
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
        codigo: `e2e-procesos-crear-est-${sufijo}`,
        dni: `est-${sufijo}`,
        correo: `est-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
      },
    });
    await prisma.matricula.create({
      data: { usuario_id: estudiante.id, aula_id: aulaId, anio_escolar_id: anioEscolarId },
    });
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

  // 17.6: rol no autorizado se rechaza sin ejecutar el handler.
  it('[17.6] sin cookie responde 401', async () => {
    const respuesta = await postCrear(dtoBase({ alcance: 'institucion', tipo: 'municipio' }), null);
    expect(respuesta.status).toBe(401);
  });

  it.each(['docente', 'estudiante'] as const)('[17.6] rol %s responde 403', async (rol) => {
    const { codigo } = await crearUsuarioDirecto({ rol });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postCrear(dtoBase({ alcance: 'institucion', tipo: 'municipio' }), cookie);
    expect(respuesta.status).toBe(403);
    expect(await prisma.procesoElectoral.count()).toBe(0);
  });

  // 17.1: representante_aula crea 1 ProcesoElectoral + N ProcesoAula en una $transaction.
  it('[17.1] representante_aula crea 1 ProcesoElectoral + N ProcesoAula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula: aula1 } = await crearArbolConAula(anioEscolar.id);
    const { aula: aula2 } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula1.id, anioEscolar.id);
    await matricularEstudiante(aula2.id, anioEscolar.id);

    const respuesta = await postCrear(dtoBase({ aula_ids: [aula1.id, aula2.id] }), cookie);
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo.aulas.sort()).toEqual([aula1.id, aula2.id].sort());

    const procesoAulas = await prisma.procesoAula.findMany({ where: { proceso_id: cuerpo.id } });
    expect(procesoAulas).toHaveLength(2);
  });

  // 17.2: aula sin matrícula activa queda excluida del lote, resto se crea.
  it('[17.2] aula sin matrícula activa queda excluida, el resto se crea', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula: conMatricula } = await crearArbolConAula(anioEscolar.id);
    const { aula: sinMatricula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(conMatricula.id, anioEscolar.id);

    const respuesta = await postCrear(dtoBase({ aula_ids: [conMatricula.id, sinMatricula.id] }), cookie);
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo.aulas).toEqual([conMatricula.id]);
    expect(cuerpo.aulas_excluidas).toEqual([sinMatricula.id]);
  });

  // 17.3: aula sin Candidato crea ProcesoAula igual, sin error de validación.
  it('[17.3] aula elegible sin ningún Candidato crea ProcesoAula sin error', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula.id, anioEscolar.id);

    const respuesta = await postCrear(dtoBase({ aula_ids: [aula.id] }), cookie);
    expect(respuesta.status).toBe(201);
  });

  // 17.4: representante_aula + alcance=institucion -> 409 SEGMENTACION_INVALIDA.
  it('[17.4] representante_aula + institucion responde 409 SEGMENTACION_INVALIDA', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    await crearAnioEscolarActivo();
    const antesProcesos = await prisma.procesoElectoral.count();

    const respuesta = await postCrear(dtoBase({ alcance: 'institucion' }), cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'SEGMENTACION_INVALIDA' });
    expect(await prisma.procesoElectoral.count()).toBe(antesProcesos);
  });

  // 17.5: exactamente una fila PROCESO_CREADO por creación, incluido el lote.
  it('[17.5] crea exactamente una fila PROCESO_CREADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula: aula1 } = await crearArbolConAula(anioEscolar.id);
    const { aula: aula2 } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula1.id, anioEscolar.id);
    await matricularEstudiante(aula2.id, anioEscolar.id);

    const respuesta = await postCrear(dtoBase({ aula_ids: [aula1.id, aula2.id] }), cookie);
    const cuerpo = await respuesta.json();

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { event_type: 'PROCESO_CREADO', entity_id: cuerpo.id },
    });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].payload).toMatchObject({ aulas: 2 });
  });

  // 17.7: rollback forzado a mitad del lote -> sin proceso, sin ProcesoAula, sin evento de auditoría.
  it('[17.7][adversarial] aula_ids duplicado fuerza P2002 en el lote -> rollback total', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula.id, anioEscolar.id);

    const antesProcesos = await prisma.procesoElectoral.count();
    const antesAulas = await prisma.procesoAula.count();
    const antesEventos = await prisma.eventoAuditoria.count({ where: { event_type: 'PROCESO_CREADO' } });

    // `alcance=aulas` no deduplica `aula_ids` (D3, resolverAulas): el mismo id dos veces produce
    // dos filas `{ proceso_id, aula_id }` idénticas en `procesoAula.createMany`, que Postgres
    // rechaza por `@@unique([proceso_id, aula_id])` — el fallo real, sin mocks, a mitad del lote.
    const respuesta = await postCrear(dtoBase({ aula_ids: [aula.id, aula.id] }), cookie);
    expect(respuesta.status).toBeGreaterThanOrEqual(400);

    expect(await prisma.procesoElectoral.count()).toBe(antesProcesos);
    expect(await prisma.procesoAula.count()).toBe(antesAulas);
    expect(
      await prisma.eventoAuditoria.count({ where: { event_type: 'PROCESO_CREADO' } }),
    ).toBe(antesEventos);
  });
});
