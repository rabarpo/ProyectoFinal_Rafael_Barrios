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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-reportes-descarga';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D7.3/D8, tareas 19.1-19.5). Corre contra
 * Postgres+Redis reales, mismo patrón que `test/procesos/actas-descarga.e2e-spec.ts`: `fetch` real
 * contra el servidor + `PrismaClient` propio, con una escritura directa de `archivo`/`estado` para
 * simular el resultado del worker (PR4 no ejerce BullMQ end-to-end desde el backend, el worker
 * queda cubierto por sus propias suites: `apps/worker/test/reportes/reportes-transicion.e2e-spec.ts`
 * y `src/processors/reportes.processor.spec.ts`).
 */
describe('GET /reportes/:id/archivo e2e — descarga [spec: Generación por worker y transición]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-reportes-descarga-e2e-2026';
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

  async function postCrearProceso(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getReporte(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/reportes/${id}`, { headers: headersCon(cookie) });
  }

  async function getArchivo(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/reportes/${id}/archivo`, { headers: headersCon(cookie) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Reportes Descarga E2E ${sufijoBase}-${contador}`;
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
    const codigo = `e2e-reportes-descarga-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `reportes-descarga-${sufijo}@e2e.local`,
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

  async function matricularEstudiante(aulaId: string, anioEscolarId: string) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo: `e2e-reportes-descarga-est-${sufijo}`,
        dni: `est-${sufijo}`,
        correo: `est-reportes-descarga-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    await prisma.matricula.create({ data: { usuario_id: usuario.id, aula_id: aulaId, anio_escolar_id: anioEscolarId } });
  }

  async function crearProcesoBorrador(cookieAdmin: string): Promise<string> {
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula.id, anioEscolar.id);

    const respuesta = await postCrearProceso(dtoProceso({ aula_ids: [aula.id] }), cookieAdmin);
    expect(respuesta.status).toBe(201);
    const { id } = await respuesta.json();
    return id as string;
  }

  async function crearReporteEnEstado(
    procesoId: string,
    solicitadoPor: string,
    estado: 'borrador' | 'emitida' | 'fallido',
    overrides: { formato?: 'excel' | 'pdf' | 'csv'; archivo?: Buffer; archivo_mime?: string; gate_aplicado?: boolean } = {},
  ): Promise<string> {
    const formato = overrides.formato ?? 'csv';
    const reporte = await prisma.reporte.create({
      data: {
        proceso_id: procesoId,
        dimension: 'candidatos',
        formato,
        estado,
        solicitado_por: solicitadoPor,
        contenido: { version: 1, secciones: [] },
        archivo: overrides.archivo ?? null,
        archivo_mime: overrides.archivo_mime ?? null,
        archivo_nombre: overrides.archivo ? `reporte.${formato}` : null,
        gate_aplicado: overrides.gate_aplicado ?? null,
        emitido_en: estado === 'emitida' ? new Date() : null,
      },
    });
    return reporte.id;
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

  // [19.1] borrador y fallido -> 409 REPORTE_NO_EMITIDO {estado}.
  it.each(['borrador', 'fallido'] as const)('[19.1] reporte %s -> 409 REPORTE_NO_EMITIDO', async (estado) => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { usuario } = await crearUsuarioDirecto({ rol: 'director' });
    const procesoId = await crearProcesoBorrador(cookie);
    const reporteId = await crearReporteEnEstado(procesoId, usuario.id, estado);

    const respuesta = await getArchivo(reporteId, cookie);
    expect(respuesta.status).toBe(409);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toMatchObject({ codigo: 'REPORTE_NO_EMITIDO', estado });
  });

  // [19.2] emitida con bytes -> 200 con Content-Type del formato, attachment, nosniff.
  it('[19.2] reporte emitida con bytes -> 200, Content-Type del formato, attachment, nosniff', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { usuario } = await crearUsuarioDirecto({ rol: 'director' });
    const procesoId = await crearProcesoBorrador(cookie);
    const pdf = Buffer.from('%PDF-1.4 reporte de prueba');
    const reporteId = await crearReporteEnEstado(procesoId, usuario.id, 'emitida', {
      formato: 'pdf',
      archivo: pdf,
      archivo_mime: 'application/pdf',
      gate_aplicado: false,
    });

    const respuesta = await getArchivo(reporteId, cookie);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('application/pdf');
    expect(respuesta.headers.get('content-disposition')).toContain('attachment');
    expect(respuesta.headers.get('x-content-type-options')).toBe('nosniff');
    const cuerpo = Buffer.from(await respuesta.arrayBuffer());
    expect(cuerpo.equals(pdf)).toBe(true);
  });

  // [19.3] el cuerpo del CSV empieza con BOM UTF-8 y el del PDF con %PDF-.
  it('[19.3] CSV emitido empieza con BOM UTF-8', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { usuario } = await crearUsuarioDirecto({ rol: 'director' });
    const procesoId = await crearProcesoBorrador(cookie);
    const csv = Buffer.from('﻿nombre,codigo\r\nAna,A1\r\n', 'utf-8');
    const reporteId = await crearReporteEnEstado(procesoId, usuario.id, 'emitida', {
      formato: 'csv',
      archivo: csv,
      archivo_mime: 'text/csv; charset=utf-8',
      gate_aplicado: false,
    });

    const respuesta = await getArchivo(reporteId, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = Buffer.from(await respuesta.arrayBuffer());
    expect(cuerpo.toString('utf-8').charCodeAt(0)).toBe(0xfeff);
  });

  it('[19.3] PDF emitido empieza con %PDF-', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { usuario } = await crearUsuarioDirecto({ rol: 'director' });
    const procesoId = await crearProcesoBorrador(cookie);
    const pdf = Buffer.from('%PDF-1.4 reporte de prueba');
    const reporteId = await crearReporteEnEstado(procesoId, usuario.id, 'emitida', {
      formato: 'pdf',
      archivo: pdf,
      archivo_mime: 'application/pdf',
      gate_aplicado: false,
    });

    const respuesta = await getArchivo(reporteId, cookie);
    const cuerpo = Buffer.from(await respuesta.arrayBuffer());
    expect(cuerpo.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  // [19.4] GET /reportes/:id nunca trae contenido ni archivo.
  it('[19.4] GET /reportes/:id nunca expone contenido ni archivo', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { usuario } = await crearUsuarioDirecto({ rol: 'director' });
    const procesoId = await crearProcesoBorrador(cookie);
    const reporteId = await crearReporteEnEstado(procesoId, usuario.id, 'emitida', {
      formato: 'csv',
      archivo: Buffer.from('x'),
      archivo_mime: 'text/csv',
      gate_aplicado: false,
    });

    const respuesta = await getReporte(reporteId, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo).not.toHaveProperty('contenido');
    expect(cuerpo).not.toHaveProperty('archivo');
    expect(cuerpo.archivo_disponible).toBe(true);
  });
});
