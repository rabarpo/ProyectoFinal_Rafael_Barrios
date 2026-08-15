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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-resultados';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * resultados-en-vivo (#16, PR1; design.md "Estrategia de pruebas"/"Contratos HTTP", tareas
 * 5.1-5.11). Corre contra Postgres+Redis reales, mismo patrón que
 * `test/votos/comprobante-autenticado.e2e-spec.ts`: `fetch` real contra el servidor + `PrismaClient`
 * propio para preparar filas vía los flujos reales (`POST /procesos`, `POST /procesos/:id/abrir`,
 * `POST /votos`), nunca insertadas a mano cuando existe un endpoint real que las produce.
 */
describe('GET /procesos/:id/resultados e2e — contrato [spec completa]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-resultados-e2e-2026';
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
    return `Resultados E2E ${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-resultados-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `resultados-${sufijo}@e2e.local`,
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
    const codigo = `e2e-resultados-est-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `est-${sufijo}`,
        correo: `est-resultados-${sufijo}@e2e.local`,
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

    return { procesoId, votante, aulaId: aula.id, anioEscolarId };
  }

  async function derechoDe(procesoId: string, usuarioId: string) {
    return prisma.derechoVoto.findFirstOrThrow({ where: { proceso_id: procesoId, usuario_id: usuarioId, en_calidad_de: 'estudiante' } });
  }

  function claveIdempotencia(): string {
    contador += 1;
    return `clave-resultados-${sufijoBase}-${contador}`;
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

  // 5.1
  it('[5.1] sin cookie de sesión responde 401', async () => {
    const respuesta = await getResultados('123e4567-e89b-12d3-a456-426614174000', null);
    expect(respuesta.status).toBe(401);
  });

  // 5.2, 5.3 — threat: IDOR/enumeración
  it('[5.2/5.3] sin DerechoVoto y proceso inexistente responden 403 con el mismo cuerpo', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const { aula: aulaAjena } = await crearArbolConAula(anioEscolar.id);
    const ajeno = await crearVotante(aulaAjena.id, anioEscolar.id);

    const respuestaSinDerecho = await getResultados(procesoId, ajeno.cookie);
    const respuestaInexistente = await getResultados('123e4567-e89b-12d3-a456-426614174000', ajeno.cookie);

    expect(respuestaSinDerecho.status).toBe(403);
    expect(respuestaInexistente.status).toBe(403);
    expect(await respuestaSinDerecho.json()).toEqual(await respuestaInexistente.json());
  });

  // 5.4 — D3
  it('[5.4] proceso en borrador responde 403, mismo cuerpo que sin DerechoVoto', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    const votante = await crearVotante(aula.id, anioEscolar.id);

    const respuestaCrear = await postCrear(dtoProceso({ aula_ids: [aula.id] }), cookieAdmin);
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoIdBorrador } = await respuestaCrear.json();

    const respuestaBorrador = await getResultados(procesoIdBorrador, votante.cookie);
    const respuestaInexistente = await getResultados('123e4567-e89b-12d3-a456-426614174000', votante.cookie);

    expect(respuestaBorrador.status).toBe(403);
    expect(await respuestaBorrador.json()).toEqual(await respuestaInexistente.json());
  });

  // 5.5
  it('[5.5] :id no-UUID responde 400', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);

    const respuesta = await getResultados('no-es-un-uuid', cookieAdmin);
    expect(respuesta.status).toBe(400);
  });

  // 5.6 — spec: Desglose completo cuando ocultar_resultados = false
  it('[5.6] proceso visible responde 200 con desglose completo', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id, {
      ocultar_resultados: false,
    });
    await prisma.procesoElectoral.update({ where: { id: procesoId }, data: { ocultar_resultados: false } });
    const lista = await prisma.lista.create({ data: { proceso_id: procesoId, nombre: nombreUnico(), numero: 1, estado: 'activo' } });
    const derecho = await derechoDe(procesoId, votante.usuario.id);

    const respuestaVoto = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(respuestaVoto.status).toBe(201);

    const respuesta = await getResultados(procesoId, votante.cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();

    expect(cuerpo.estado_visibilidad).toBe('visible');
    expect(cuerpo.votos_emitidos).toBe(1);
    expect(cuerpo.dimension).toBe('lista');
    expect(cuerpo.desglose).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: lista.id, votos: 1, estado: 'activo' })]),
    );
  });

  // 5.7 — spec: Payload mínimo cuando ocultar_resultados = true
  it('[5.7] proceso oculto responde 200 con exactamente los 5 campos del modo oculto', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    await prisma.procesoElectoral.update({ where: { id: procesoId }, data: { ocultar_resultados: true } });

    const respuesta = await getResultados(procesoId, votante.cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();

    expect(Object.keys(cuerpo).sort()).toEqual(
      ['estado_visibilidad', 'hora_servidor', 'padron_total', 'resultados_ocultos_por_configuracion', 'votos_emitidos'].sort(),
    );
    expect(cuerpo.estado_visibilidad).toBe('oculto');
  });

  // 5.8 — spec: Comité consulta proceso oculto
  it('[5.8] comité y estudiante reciben cuerpos idénticos en modo oculto', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, aulaId } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    await prisma.procesoElectoral.update({ where: { id: procesoId }, data: { ocultar_resultados: true } });

    const comite = await crearVotante(aulaId, anioEscolar.id, 'comite');
    const derechoComite = await prisma.derechoVoto.create({
      data: { proceso_id: procesoId, usuario_id: comite.usuario.id, en_calidad_de: 'comite', aula_snapshot: aulaId },
    });
    expect(derechoComite).toBeDefined();

    const respuestaEstudiante = await getResultados(procesoId, votante.cookie);
    const respuestaComite = await getResultados(procesoId, comite.cookie);

    expect(await respuestaEstudiante.json()).toEqual(await respuestaComite.json());
  });

  // 5.9 — spec: Proceso cerrado con derecho de voto vigente
  it('[5.9] proceso cerrado calcula igual que abierto', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    await prisma.procesoElectoral.update({ where: { id: procesoId }, data: { ocultar_resultados: true } });
    const derecho = await derechoDe(procesoId, votante.usuario.id);
    const respuestaVoto = await postVotos({ derecho_voto_id: derecho.id, blanco: true, clave_idempotencia: claveIdempotencia() }, votante.cookie);
    expect(respuestaVoto.status).toBe(201);

    const respuestaAbierto = await getResultados(procesoId, votante.cookie);
    await redis.del(`resultados:${procesoId}`);

    await prisma.procesoElectoral.update({ where: { id: procesoId }, data: { estado: 'cerrado', cierre_real: new Date() } });
    const respuestaCerrado = await getResultados(procesoId, votante.cookie);

    expect(respuestaCerrado.status).toBe(200);
    const cuerpoAbierto = await respuestaAbierto.json();
    const cuerpoCerrado = await respuestaCerrado.json();
    expect(cuerpoCerrado.votos_emitidos).toBe(cuerpoAbierto.votos_emitidos);
    expect(cuerpoCerrado.padron_total).toBe(cuerpoAbierto.padron_total);
  });

  // 5.10 — spec: Cambio de aula posterior a la apertura no afecta el cálculo
  it('[5.10] padron_total no cambia tras mover una matrícula de aula después de la apertura', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto();
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, aulaId } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const respuestaAntes = await getResultados(procesoId, votante.cookie);
    const padronAntes = (await respuestaAntes.json()).padron_total;

    const { aula: otraAula } = await crearArbolConAula(anioEscolar.id);
    expect(otraAula.id).not.toBe(aulaId);
    await prisma.matricula.updateMany({ where: { usuario_id: votante.usuario.id }, data: { aula_id: otraAula.id } });
    await redis.del(`resultados:${procesoId}`);

    const respuestaDespues = await getResultados(procesoId, votante.cookie);
    const padronDespues = (await respuestaDespues.json()).padron_total;

    expect(padronDespues).toBe(padronAntes);
  });
});
