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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-actas-descarga';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * cierre-escrutinio-actas (#17, PR4; design.md D13, tareas 16.2-16.5). Corre contra Postgres+Redis
 * reales, mismo patrón que `test/procesos/procesos-cerrar.e2e-spec.ts`: `fetch` real contra el
 * servidor + `PrismaClient` propio para preparar filas vía los flujos reales (crear -> abrir ->
 * cerrar), con una escritura directa de `pdf`/`estado='emitida'` para el caso de descarga exitosa
 * (el worker de PR5 aún no existe en este PR).
 */
describe('GET /procesos/:id/actas(/:tipo/pdf) e2e — lectura y descarga [D13]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-actas-descarga-e2e-2026';
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

  async function getActas(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}/actas`, { headers: headersCon(cookie) });
  }

  async function getActaPdf(id: string, tipo: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}/actas/${tipo}/pdf`, { headers: headersCon(cookie) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Actas E2E ${sufijoBase}-${contador}`;
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

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-actas-descarga-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `actas-descarga-${sufijo}@e2e.local`,
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
    const codigo = `e2e-actas-descarga-est-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `est-${sufijo}`,
        correo: `est-actas-${sufijo}@e2e.local`,
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

  async function crearProcesoCerrado(cookieAdmin: string, anioEscolarId: string) {
    const { aula } = await crearArbolConAula(anioEscolarId);
    const votante = await crearVotante(aula.id, anioEscolarId);

    const respuestaCrear = await postCrear(dtoProceso({ aula_ids: [aula.id] }), cookieAdmin);
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoId } = await respuestaCrear.json();

    const respuestaAbrir = await postAbrir(procesoId, cookieAdmin);
    expect(respuestaAbrir.status).toBe(200);

    const respuestaCerrar = await postCerrar(procesoId, cookieAdmin);
    expect(respuestaCerrar.status).toBe(200);

    return { procesoId, votante, aulaId: aula.id };
  }

  async function marcarActaEmitida(procesoId: string, tipo: string): Promise<Buffer> {
    const pdf = Buffer.from(`%PDF-1.4 acta ${tipo} de prueba e2e ${procesoId}`);
    await prisma.acta.update({
      where: { proceso_id_tipo: { proceso_id: procesoId, tipo: tipo as never } },
      data: { estado: 'emitida', pdf, pdf_mime: 'application/pdf' },
    });
    return pdf;
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

  // 16.2/threat "Fuga del gate ocultar_resultados por la puerta lateral del acta".
  it('[16.2] rol estudiante -> 403 en listado, incluso con DerechoVoto en el proceso', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoCerrado(cookieAdmin, anioEscolar.id);

    const derecho = await prisma.derechoVoto.count({ where: { proceso_id: procesoId, usuario_id: votante.usuario.id } });
    expect(derecho).toBeGreaterThan(0);

    const respuesta = await getActas(procesoId, votante.cookie);
    expect(respuesta.status).toBe(403);
  });

  it('[16.2] rol estudiante -> 403 en descarga, incluso con DerechoVoto en el proceso', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoCerrado(cookieAdmin, anioEscolar.id);

    const respuesta = await getActaPdf(procesoId, 'escrutinio', votante.cookie);
    expect(respuesta.status).toBe(403);
  });

  // 16.6 (listado feliz), verifica que nunca viajan bytes ni contenido.
  it('[16.6] rol comite -> 200, listado de 4 actas sin pdf ni contenido', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { codigo: codigoComite } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoCerrado(cookieAdmin, anioEscolar.id);

    const respuesta = await getActas(procesoId, cookieComite);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toHaveLength(4);
    expect(cuerpo.map((a: { tipo: string }) => a.tipo).sort()).toEqual(['apertura', 'cierre', 'escrutinio', 'oficial']);
    for (const acta of cuerpo) {
      expect(acta.estado).toBe('borrador');
      expect(acta.pdf_disponible).toBe(false);
      expect(acta).not.toHaveProperty('pdf');
      expect(acta).not.toHaveProperty('contenido');
    }
  });

  it('[16.5] proceso inexistente -> 404 en listado', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await getActas('123e4567-e89b-12d3-a456-426614174000', cookie);
    expect(respuesta.status).toBe(404);
  });

  // 16.3/spec "Descarga antes de emitir".
  it('[16.3] acta en borrador -> 409 ACTA_NO_EMITIDA', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoCerrado(cookieAdmin, anioEscolar.id);

    const respuesta = await getActaPdf(procesoId, 'escrutinio', cookieAdmin);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ACTA_NO_EMITIDA', estado: 'borrador' });
  });

  // 16.4/spec "Descarga de acta emitida".
  it('[16.4] acta emitida con pdf -> 200 application/pdf, cabeceras defensivas, cuerpo %PDF-', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { codigo: codigoComite } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoCerrado(cookieAdmin, anioEscolar.id);

    const pdfEsperado = await marcarActaEmitida(procesoId, 'escrutinio');

    const respuesta = await getActaPdf(procesoId, 'escrutinio', cookieComite);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('application/pdf');
    expect(respuesta.headers.get('content-disposition')).toContain('attachment');
    expect(respuesta.headers.get('x-content-type-options')).toBe('nosniff');
    const cuerpo = Buffer.from(await respuesta.arrayBuffer());
    expect(cuerpo.subarray(0, 5).toString('utf-8')).toBe('%PDF-');
    expect(cuerpo.equals(pdfEsperado)).toBe(true);
  });

  // 16.5/spec ":tipo fuera del enum -> 400; proceso inexistente -> 404".
  it('[16.5] :tipo fuera del enum -> 400', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId } = await crearProcesoCerrado(cookieAdmin, anioEscolar.id);

    const respuesta = await getActaPdf(procesoId, 'resultados', cookieAdmin);
    expect(respuesta.status).toBe(400);
  });

  it('[16.5] proceso inexistente -> 404 en descarga', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await getActaPdf('123e4567-e89b-12d3-a456-426614174000', 'escrutinio', cookie);
    expect(respuesta.status).toBe(404);
  });
});
