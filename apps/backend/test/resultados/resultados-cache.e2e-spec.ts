import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';
import { serializar } from '../../src/procesos/resultados-cache';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-resultados-cache';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * resultados-en-vivo (#16, PR1; design.md "Verificación del requisito 7", tareas 6.1-6.6). Cliente
 * `ioredis` PROPIO de la prueba (no el `REDIS_CLIENT` de la app) para inspeccionar/mutar la clave
 * de caché directamente. Nota de diseño: toda comparación byte a byte usa una LECTURA DE CEBADO
 * previa (descartada) para no correr contra la ventana de estampida (D7); el vencimiento del TTL
 * se simula con `DEL resultados:{proceso_id}`, NUNCA con `sleep(8s)` en CI.
 */
describe('GET /procesos/:id/resultados e2e — requisito 7: consistencia de caché [D7]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-resultados-cache-e2e-2026';
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

  async function getResultados(procesoId: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${procesoId}/resultados`, { headers: headersCon(cookie) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Resultados Cache E2E ${sufijoBase}-${contador}`;
  }

  async function crearUsuarioDirecto() {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-resultados-cache-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `resultados-cache-${sufijo}@e2e.local`,
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
    const codigo = `e2e-resultados-cache-est-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `est-${sufijo}`,
        correo: `est-resultados-cache-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol: 'estudiante',
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
    return `clave-resultados-cache-${sufijoBase}-${contador}`;
  }

  function claveResultados(procesoId: string): string {
    return `resultados:${procesoId}`;
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

  // 6.1 — cebado + N lecturas ⇒ cuerpos byte a byte idénticos
  it('[6.1] cebado + N lecturas del mismo proceso devuelven cuerpos byte a byte idénticos', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    // Cebado: descartado, sólo llena la caché y evita la ventana de estampida.
    await getResultados(procesoId, votante.cookie);

    const textos: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const respuesta = await getResultados(procesoId, votante.cookie);
      expect(respuesta.status).toBe(200);
      textos.push(await respuesta.text());
    }

    expect(new Set(textos).size).toBe(1);
  });

  // 6.2
  it('[6.2] el TTL de la clave de caché está en (0, 8] tras un miss', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    await redis.del(claveResultados(procesoId));
    const respuesta = await getResultados(procesoId, votante.cookie);
    expect(respuesta.status).toBe(200);

    const ttl = await redis.ttl(claveResultados(procesoId));
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(8);
  });

  // 6.3 — vencimiento simulado con DEL, sin sleep
  it('[6.3] tras DEL (equivalente al vencimiento), la siguiente lectura ya refleja el voto nuevo', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    // Cebado: llena la caché con 0 votos emitidos.
    const respuestaCebado = await getResultados(procesoId, votante.cookie);
    expect((await respuestaCebado.json()).votos_emitidos).toBe(0);

    const derecho = await derechoDe(procesoId, votante.usuario.id);
    const respuestaVoto = await postVotos({ derecho_voto_id: derecho.id, blanco: true, clave_idempotencia: claveIdempotencia() }, votante.cookie);
    expect(respuestaVoto.status).toBe(201);

    await redis.del(claveResultados(procesoId));

    const respuestaFinal = await getResultados(procesoId, votante.cookie);
    expect((await respuestaFinal.json()).votos_emitidos).toBe(1);
  });

  // 6.4 — spec: Lecturas de procesos distintos nunca se mezclan; threat: contaminación cruzada
  it('[6.4] procesos A y B en sucesión inmediata nunca mezclan sus datos', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId: procesoA, votante: votanteA } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const { procesoId: procesoB, votante: votanteB } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const derechoA = await derechoDe(procesoA, votanteA.usuario.id);
    const respuestaVotoA = await postVotos({ derecho_voto_id: derechoA.id, blanco: true, clave_idempotencia: claveIdempotencia() }, votanteA.cookie);
    expect(respuestaVotoA.status).toBe(201);

    const [respuestaA, respuestaB] = await Promise.all([
      getResultados(procesoA, votanteA.cookie),
      getResultados(procesoB, votanteB.cookie),
    ]);
    const cuerpoA = await respuestaA.json();
    const cuerpoB = await respuestaB.json();

    expect(cuerpoA.votos_emitidos).toBe(1);
    expect(cuerpoB.votos_emitidos).toBe(0);
  });

  // 6.5 — verifica la autocomprobación de D7 contra Redis real
  it('[6.5] un envoltorio ajeno inyectado en la clave de A se trata como miss y recalcula', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId: procesoA, votante: votanteA } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const { procesoId: procesoB } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const envoltorioAjeno = serializar(procesoB, {
      estado_visibilidad: 'oculto',
      resultados_ocultos_por_configuracion: true,
      votos_emitidos: 999,
      padron_total: 999,
      hora_servidor: new Date().toISOString(),
    });
    await redis.set(claveResultados(procesoA), envoltorioAjeno, 'EX', 8);

    const respuesta = await getResultados(procesoA, votanteA.cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();

    expect(cuerpo.votos_emitidos).not.toBe(999);
    expect(cuerpo.padron_total).not.toBe(999);
  });
});
