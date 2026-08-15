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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-comprobante-autenticado';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * outbox-correo-comprobante-autenticado (#15, PR3; design.md D11, "Estrategia de pruebas", tareas
 * 11.1-11.4). Corre contra Postgres+Redis reales, mismo patrón que
 * `test/votos/outbox-atomicidad.e2e-spec.ts` (PR1): `fetch` real contra el servidor +
 * `PrismaClient` propio para materializar el voto vía el flujo `POST /procesos` +
 * `POST /procesos/:id/abrir` + `POST /votos` (#13/#14), nunca insertado a mano.
 */
describe('GET /votos/comprobante/:votoId e2e — acceso autenticado, ownership, no-oráculo [D11]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-comprobante-auth-e2e-2026';
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

  async function getComprobante(votoId: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/votos/comprobante/${votoId}`, { headers: headersCon(cookie) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Comprobante Auth E2E ${sufijoBase}-${contador}`;
  }

  async function crearUsuarioDirecto() {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-comprobante-auth-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `comprobante-auth-${sufijo}@e2e.local`,
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
    const codigo = `e2e-comprobante-auth-est-${sufijo}`;
    const estudiante = await prisma.usuario.create({
      data: {
        codigo,
        dni: `est-${sufijo}`,
        correo: `est-comprobante-auth-${sufijo}@e2e.local`,
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

    return { procesoId, votante, aulaId: aula.id };
  }

  async function derechoDe(procesoId: string, usuarioId: string) {
    return prisma.derechoVoto.findFirstOrThrow({ where: { proceso_id: procesoId, usuario_id: usuarioId, en_calidad_de: 'estudiante' } });
  }

  function claveIdempotencia(): string {
    contador += 1;
    return `clave-comprobante-auth-${sufijoBase}-${contador}`;
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

  // 11.1: voto propio -> 200 con eleccion_resumen correcto (incluido "Voto en blanco")
  it('[11.1] voto propio responde 200 con el comprobante completo, eleccion_resumen incluido', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    const respuestaVoto = await postVotos(
      { derecho_voto_id: derecho.id, blanco: true, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(respuestaVoto.status).toBe(201);
    const voto = await prisma.voto.findFirstOrThrow({ where: { derecho_voto_id: derecho.id } });

    const respuesta = await getComprobante(voto.id, votante.cookie);

    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toEqual({
      codigo_comprobante: voto.codigo_comprobante,
      hora_servidor: voto.hora_servidor.toISOString(),
      proceso: { id: procesoId, nombre: expect.any(String) },
      en_calidad_de: 'estudiante',
      eleccion_resumen: 'Voto en blanco',
    });
  });

  // 11.2: voto de otro usuario -> 403 idéntico al de un votoId inexistente (sin oráculo)
  it('[11.2] voto de otro usuario responde 403, idéntico al de un votoId inexistente', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    const respuestaVoto = await postVotos(
      { derecho_voto_id: derecho.id, blanco: true, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(respuestaVoto.status).toBe(201);
    const voto = await prisma.voto.findFirstOrThrow({ where: { derecho_voto_id: derecho.id } });

    const { aula } = await crearArbolConAula(anioEscolar.id);
    const otroVotante = await crearVotante(aula.id, anioEscolar.id);

    const respuestaAjeno = await getComprobante(voto.id, otroVotante.cookie);
    const respuestaInexistente = await getComprobante('123e4567-e89b-12d3-a456-426614174000', otroVotante.cookie);

    expect(respuestaAjeno.status).toBe(403);
    expect(respuestaInexistente.status).toBe(403);
    expect(await respuestaAjeno.json()).toEqual(await respuestaInexistente.json());
  });

  // 11.3: sin cookie -> 401, sin exponer datos del comprobante
  it('[11.3] sin cookie responde 401, sin exponer datos del comprobante', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    const respuestaVoto = await postVotos(
      { derecho_voto_id: derecho.id, blanco: true, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(respuestaVoto.status).toBe(201);
    const voto = await prisma.voto.findFirstOrThrow({ where: { derecho_voto_id: derecho.id } });

    const respuesta = await getComprobante(voto.id, null);

    expect(respuesta.status).toBe(401);
    const cuerpo = await respuesta.json().catch(() => null);
    expect(cuerpo).not.toEqual(expect.objectContaining({ eleccion_resumen: expect.anything() }));
  });

  // 11.4: votoId no-UUID -> 400
  it('[11.4] votoId no-UUID responde 400', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const respuesta = await getComprobante('no-es-un-uuid', votante.cookie);

    expect(respuesta.status).toBe(400);
  });
});
