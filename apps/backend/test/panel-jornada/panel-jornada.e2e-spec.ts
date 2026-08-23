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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-panel-jornada';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * dashboard-panel-jornada (Backlog #20, PR1; design.md "Endpoints"/"Threat Matrix", tareas
 * 5.1-5.9). Corre contra Postgres+Redis reales, mismo patrón que
 * `test/resultados/resultados.e2e-spec.ts`: `fetch` real contra el servidor + `PrismaClient`
 * propio para preparar filas vía los flujos reales (`POST /procesos`, `POST /procesos/:id/abrir`,
 * `POST /votos`), nunca insertadas a mano cuando existe un endpoint real que las produce.
 */
describe('GET /panel-jornada/* e2e — contrato [spec completa]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-panel-jornada-e2e-2026';
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

  async function getInstitucion(cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/panel-jornada/institucion`, { headers: headersCon(cookie) });
  }

  async function getResumen(procesoId: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/panel-jornada/procesos/${procesoId}/resumen`, { headers: headersCon(cookie) });
  }

  async function getVotosPorHora(procesoId: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/panel-jornada/procesos/${procesoId}/votos-por-hora`, { headers: headersCon(cookie) });
  }

  async function getAvanceAulas(procesoId: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/panel-jornada/procesos/${procesoId}/avance-aulas`, { headers: headersCon(cookie) });
  }

  async function getProyeccion(procesoId: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/panel-jornada/procesos/${procesoId}/proyeccion`, { headers: headersCon(cookie) });
  }

  const ENDPOINTS_SCOPED: Array<(id: string, cookie: string | null) => Promise<Response>> = [
    getResumen,
    getVotosPorHora,
    getAvanceAulas,
    getProyeccion,
  ];

  function nombreUnico(): string {
    contador += 1;
    return `Panel Jornada E2E ${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-panel-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `panel-${sufijo}@e2e.local`,
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
    const codigo = `e2e-panel-est-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `est-${sufijo}`,
        correo: `est-panel-${sufijo}@e2e.local`,
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

  async function crearProcesoAbiertoConVotante(cookieAdmin: string, anioEscolarId: string, overrides: Record<string, unknown> = {}) {
    const { aula } = await crearArbolConAula(anioEscolarId);
    const votante = await crearVotante(aula.id, anioEscolarId);

    const respuestaCrear = await postCrear(dtoProceso({ aula_ids: [aula.id], ...overrides }), cookieAdmin);
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoId } = await respuestaCrear.json();

    const respuestaAbrir = await postAbrir(procesoId, cookieAdmin);
    expect(respuestaAbrir.status).toBe(200);

    return { procesoId, votante, aulaId: aula.id, anioEscolarId };
  }

  async function derechoDe(procesoId: string, usuarioId: string) {
    return prisma.derechoVoto.findFirstOrThrow({ where: { proceso_id: procesoId, usuario_id: usuarioId, en_calidad_de: 'estudiante' } });
  }

  function claveIdempotencia(): string {
    contador += 1;
    return `clave-panel-${sufijoBase}-${contador}`;
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

  // 5.1 — spec: Docente intenta acceder
  it('[5.1] docente/estudiante reciben 403 en los 5 endpoints', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id, { ocultar_resultados: false });

    const { codigo: codigoDocente } = await crearUsuarioDirecto({ rol: 'docente' });
    const cookieDocente = await loginYObtenerCookie(codigoDocente);

    const respuestaInstitucion = await getInstitucion(cookieDocente);
    expect(respuestaInstitucion.status).toBe(403);

    for (const endpoint of ENDPOINTS_SCOPED) {
      const respuesta = await endpoint(procesoId, cookieDocente);
      expect(respuesta.status).toBe(403);
    }
  });

  // 5.2 — spec: Sin sesión válida
  it('[5.2] sin cookie de sesión responde 401 en los 5 endpoints', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const respuestaInstitucion = await getInstitucion(null);
    expect(respuestaInstitucion.status).toBe(401);

    for (const endpoint of ENDPOINTS_SCOPED) {
      const respuesta = await endpoint(procesoId, null);
      expect(respuesta.status).toBe(401);
    }
  });

  // 5.3 — spec: Comité consulta el panel
  it('[5.3] comité recibe 200 con datos scoped al proceso en los 5 endpoints', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, aulaId } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const comite = await crearVotante(aulaId, anioEscolar.id, 'comite');
    await prisma.derechoVoto.create({
      data: { proceso_id: procesoId, usuario_id: comite.usuario.id, en_calidad_de: 'comite', aula_snapshot: aulaId },
    });

    const respuestaInstitucion = await getInstitucion(comite.cookie);
    expect(respuestaInstitucion.status).toBe(200);

    for (const endpoint of ENDPOINTS_SCOPED) {
      const respuesta = await endpoint(procesoId, comite.cookie);
      expect(respuesta.status).toBe(200);
      const cuerpo = await respuesta.json();
      expect(cuerpo).toBeDefined();
    }
  });

  // 5.4 — threat: casos adversarios de ruta
  it('[5.4] :id no-UUID responde 400 en los endpoints scoped por proceso', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);

    for (const endpoint of ENDPOINTS_SCOPED) {
      const respuesta = await endpoint('no-es-un-uuid', cookieAdmin);
      expect(respuesta.status).toBe(400);
    }
  });

  // 5.5
  it('[5.5] proceso_id inexistente responde 404', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);

    const respuesta = await getResumen('123e4567-e89b-12d3-a456-426614174000', cookieAdmin);
    expect(respuesta.status).toBe(404);
  });

  // 5.6
  it('[5.6] proceso en borrador responde 409 ESTADO_INVALIDO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await crearVotante(aula.id, anioEscolar.id);

    const respuestaCrear = await postCrear(dtoProceso({ aula_ids: [aula.id] }), cookieAdmin);
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoIdBorrador } = await respuestaCrear.json();

    const respuesta = await getResumen(procesoIdBorrador, cookieAdmin);
    expect(respuesta.status).toBe(409);
    const cuerpo = await respuesta.json();
    expect(cuerpo.codigo).toBe('ESTADO_INVALIDO');
  });

  // 5.7 — D6, spec: Modo proyección sin desglose por candidato / Requirement autorización
  it('[5.7] proceso oculto: resumen sin desglose/blancos/dimension, para los 3 roles por igual', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, aulaId } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id, {
      ocultar_resultados: true,
    });
    const director = await crearVotante(aulaId, anioEscolar.id, 'director');
    const comite = await crearVotante(aulaId, anioEscolar.id, 'comite');
    await prisma.derechoVoto.createMany({
      data: [
        { proceso_id: procesoId, usuario_id: director.usuario.id, en_calidad_de: 'director', aula_snapshot: aulaId },
        { proceso_id: procesoId, usuario_id: comite.usuario.id, en_calidad_de: 'comite', aula_snapshot: aulaId },
      ],
    });

    const respuestaAdmin = await getResumen(procesoId, cookieAdmin);
    expect(respuestaAdmin.status).toBe(200);
    const cuerpoAdmin = await respuestaAdmin.json();

    expect(cuerpoAdmin.estado_visibilidad).toBe('oculto');
    expect(cuerpoAdmin.desglose).toBeUndefined();
    expect(cuerpoAdmin.blancos).toBeUndefined();
    expect(cuerpoAdmin.dimension).toBeUndefined();

    const respuestaDirector = await getResumen(procesoId, director.cookie);
    const respuestaComite = await getResumen(procesoId, comite.cookie);
    expect((await respuestaDirector.json()).estado_visibilidad).toBe('oculto');
    expect((await respuestaComite.json()).estado_visibilidad).toBe('oculto');
    expect(votante).toBeDefined();
  });

  // 5.8 — spec: Desglose completo cuando ocultar_resultados = false
  it('[5.8] proceso visible: resumen responde con desglose completo', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id, {
      ocultar_resultados: false,
    });
    const lista = await prisma.lista.create({ data: { proceso_id: procesoId, nombre: nombreUnico(), numero: 1, estado: 'activo' } });
    const derecho = await derechoDe(procesoId, votante.usuario.id);
    const respuestaVoto = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(respuestaVoto.status).toBe(201);

    const respuesta = await getResumen(procesoId, cookieAdmin);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();

    expect(cuerpo.estado_visibilidad).toBe('visible');
    expect(cuerpo.votos_emitidos).toBe(1);
    expect(cuerpo.dimension).toBe('lista');
    expect(cuerpo.desglose).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: lista.id, votos: 1, estado: 'activo' })]),
    );
  });

  // 5.9 — D8, threat: Fuga de desglose por la puerta de proyección
  it('[5.9] proyeccion nunca incluye desglose/blancos/dimension, con o sin ocultar_resultados', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId: procesoVisible } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id, {
      ocultar_resultados: false,
    });
    const { procesoId: procesoOculto } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id, {
      ocultar_resultados: true,
    });

    const respuestaVisible = await getProyeccion(procesoVisible, cookieAdmin);
    const respuestaOculto = await getProyeccion(procesoOculto, cookieAdmin);
    expect(respuestaVisible.status).toBe(200);
    expect(respuestaOculto.status).toBe(200);

    const cuerpoVisible = await respuestaVisible.json();
    const cuerpoOculto = await respuestaOculto.json();

    for (const cuerpo of [cuerpoVisible, cuerpoOculto]) {
      expect(cuerpo.desglose).toBeUndefined();
      expect(cuerpo.blancos).toBeUndefined();
      expect(cuerpo.dimension).toBeUndefined();
      expect(Object.keys(cuerpo).sort()).toEqual(['aulas', 'franjas', 'hora_servidor', 'padron_total', 'votos_emitidos'].sort());
    }
  });
});
