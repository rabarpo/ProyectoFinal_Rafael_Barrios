import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';
import { esSensible, podar, type ModeloReporte } from '../../src/reportes/modelo-reporte';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-reportes-gate';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * reportes-y-exportaciones (#18, PR4; design.md D7, "el núcleo del change", tareas 18.1-18.6).
 * Corre contra Postgres+Redis reales. Las tres capas del gate:
 *  - Capa 1 (solicitud, D7.1): se ejerce con `POST /reportes` real — ya cubierto por
 *    `ReportesService` (PR3), pero repetido aquí a nivel HTTP para los tres roles autorizados
 *    (18.1-18.3).
 *  - Capa 2 (generación, D7.2): el worker no corre en este proceso; se simula su efecto con las
 *    MISMAS funciones puras que usa el processor (`esSensible`/`podar` de
 *    `../../src/reportes/modelo-reporte.ts`, idénticas en forma a
 *    `apps/worker/src/reportes/modelo-reporte.ts`), aplicadas sobre `ocultar_resultados` releído
 *    del proceso — nunca el congelado en la solicitud (18.4). Cobertura completa de la releída EN
 *    el worker vive en `apps/worker/src/processors/reportes.processor.spec.ts` (14.2).
 *  - Capa 3 (descarga, D7.3): `ReportesService.archivo()` real, sin simular nada (18.5).
 */
describe('Gate ocultar_resultados en reportes — capas 1/2/3 [D7, riesgo central del change]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-reportes-gate-e2e-2026';
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

  async function postSolicitarReporte(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/reportes`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getArchivo(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/reportes/${id}/archivo`, { headers: headersCon(cookie) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Reportes Gate E2E ${sufijoBase}-${contador}`;
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
    const codigo = `e2e-reportes-gate-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `reportes-gate-${sufijo}@e2e.local`,
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

  // `AnioEscolar.activo` es único cuando true: algunos tests de esta suite crean DOS procesos (con
  // DOS árboles académicos propios) dentro del mismo `it`, así que hay que desactivar el año
  // anterior antes de activar el siguiente — de lo contrario el segundo `create` choca con `23505`.
  async function crearAnioEscolarActivo() {
    await prisma.anioEscolar.updateMany({ data: { activo: false } });
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
        codigo: `e2e-reportes-gate-est-${sufijo}`,
        dni: `est-${sufijo}`,
        correo: `est-reportes-gate-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    await prisma.matricula.create({ data: { usuario_id: usuario.id, aula_id: aulaId, anio_escolar_id: anioEscolarId } });
  }

  async function crearProceso(cookieAdmin: string, ocultarResultados: boolean): Promise<string> {
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula.id, anioEscolar.id);

    const respuesta = await postCrearProceso(dtoProceso({ aula_ids: [aula.id] }), cookieAdmin);
    expect(respuesta.status).toBe(201);
    const { id } = await respuesta.json();
    await prisma.procesoElectoral.update({ where: { id }, data: { ocultar_resultados: ocultarResultados } });
    return id as string;
  }

  /**
   * Simula la capa 2 del gate (D7.2) tal como lo haría `procesarReporte()` del worker: relee
   * `ocultar_resultados` VIGENTE (nunca el congelado en la solicitud), aplica `podar()` y
   * persiste `gate_aplicado` — mismas funciones puras que usa
   * `apps/worker/src/reportes/modelo-reporte.ts` (D4, duplicación declarada por `rootDir`).
   */
  async function simularGeneracionWorker(reporteId: string): Promise<void> {
    const fila = await prisma.reporte.findUniqueOrThrow({
      where: { id: reporteId },
      include: { proceso: { select: { ocultar_resultados: true } } },
    });
    const gate = esSensible(fila.dimension) && fila.proceso.ocultar_resultados;
    const modelo = podar(fila.contenido as unknown as ModeloReporte, gate);
    await prisma.reporte.update({
      where: { id: reporteId },
      data: {
        estado: 'emitida',
        gate_aplicado: gate,
        archivo: Buffer.from(JSON.stringify(modelo)),
        archivo_mime: 'application/json',
        archivo_nombre: `reporte-${reporteId}.json`,
        emitido_en: new Date(),
      },
    });
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

  // [18.1] ocultar_resultados=true, resultados/participacion -> contenido SIN sección sensible,
  // para los tres roles autorizados.
  it.each(['administrador', 'director', 'comite'] as const)(
    '[18.1] rol %s, ocultar_resultados=true, dimension=resultados -> sin sección sensible',
    async (rol) => {
      const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
      const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
      const procesoId = await crearProceso(cookieAdmin, true);
      const { codigo } = await crearUsuarioDirecto({ rol });
      const cookie = await loginYObtenerCookie(codigo);

      const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'resultados', formato: 'pdf' }, cookie);
      expect(respuesta.status).toBe(202);
      const { id } = await respuesta.json();

      const fila = await prisma.reporte.findUniqueOrThrow({ where: { id } });
      const modelo = fila.contenido as unknown as ModeloReporte;
      expect(modelo.secciones.every((s) => !s.sensible)).toBe(true);
    },
  );

  it('[18.1] ocultar_resultados=true, dimension=participacion -> sin desglose, solo agregados', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const procesoId = await crearProceso(cookieAdmin, true);
    const { codigo } = await crearUsuarioDirecto({ rol: 'director' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'participacion', formato: 'excel' }, cookie);
    expect(respuesta.status).toBe(202);
    const { id } = await respuesta.json();

    const fila = await prisma.reporte.findUniqueOrThrow({ where: { id } });
    const modelo = fila.contenido as unknown as ModeloReporte;
    expect(modelo.secciones.every((s) => !s.sensible)).toBe(true);
    expect(modelo.secciones.some((s) => s.clave === 'resumen')).toBe(true);
  });

  // [18.2] ocultar_resultados=false -> con desglose completo (control negativo).
  it('[18.2] ocultar_resultados=false, dimension=resultados -> con desglose completo', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const procesoId = await crearProceso(cookieAdmin, false);

    const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'resultados', formato: 'pdf' }, cookieAdmin);
    expect(respuesta.status).toBe(202);
    const { id } = await respuesta.json();

    const fila = await prisma.reporte.findUniqueOrThrow({ where: { id } });
    const modelo = fila.contenido as unknown as ModeloReporte;
    expect(modelo.secciones.some((s) => s.sensible)).toBe(true);
    expect(modelo.secciones.some((s) => s.clave === 'desglose')).toBe(true);
  });

  // [18.3] candidatos/consultas/votantes/abstenciones -> catálogo/lista completos en ambos modos.
  it.each(['candidatos', 'consultas', 'votantes', 'abstenciones'] as const)(
    '[18.3] dimension=%s ignora el gate en ambos modos de ocultar_resultados',
    async (dimension) => {
      const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
      const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
      const procesoOculto = await crearProceso(cookieAdmin, true);
      const procesoVisible = await crearProceso(cookieAdmin, false);

      const rOculto = await postSolicitarReporte({ proceso_id: procesoOculto, dimension, formato: 'csv' }, cookieAdmin);
      const rVisible = await postSolicitarReporte({ proceso_id: procesoVisible, dimension, formato: 'csv' }, cookieAdmin);
      expect(rOculto.status).toBe(202);
      expect(rVisible.status).toBe(202);

      const { id: idOculto } = await rOculto.json();
      const { id: idVisible } = await rVisible.json();
      const filaOculto = await prisma.reporte.findUniqueOrThrow({ where: { id: idOculto } });
      const filaVisible = await prisma.reporte.findUniqueOrThrow({ where: { id: idVisible } });

      // esSensible(dimension) es false para estas 4 dimensiones: nunca hay sección sensible.
      expect((filaOculto.contenido as unknown as ModeloReporte).secciones.every((s) => !s.sensible)).toBe(true);
      expect((filaVisible.contenido as unknown as ModeloReporte).secciones.every((s) => !s.sensible)).toBe(true);
    },
  );

  // [18.4] viraje false -> true entre la solicitud y la generación -> el archivo emitido queda
  // podado y gate_aplicado=true (capa 2, releída en el processor).
  it('[18.4] viraje false->true entre solicitud y generación -> archivo podado, gate_aplicado=true', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const procesoId = await crearProceso(cookieAdmin, false);

    const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'resultados', formato: 'pdf' }, cookieAdmin);
    expect(respuesta.status).toBe(202);
    const { id } = await respuesta.json();

    const filaAntes = await prisma.reporte.findUniqueOrThrow({ where: { id } });
    expect((filaAntes.contenido as unknown as ModeloReporte).secciones.some((s) => s.sensible)).toBe(true);

    // Viraje: la política cambia DESPUÉS de la solicitud, ANTES de la generación.
    await prisma.procesoElectoral.update({ where: { id: procesoId }, data: { ocultar_resultados: true } });

    await simularGeneracionWorker(id);

    const filaDespues = await prisma.reporte.findUniqueOrThrow({ where: { id } });
    expect(filaDespues.estado).toBe('emitida');
    expect(filaDespues.gate_aplicado).toBe(true);
    const modeloArchivo = JSON.parse(filaDespues.archivo!.toString('utf-8')) as ModeloReporte;
    expect(modeloArchivo.secciones.every((s) => !s.sensible)).toBe(true);
  });

  // [18.5] descarga de un archivo emitido con gate_aplicado=false DESPUÉS del viraje a
  // ocultar_resultados=true -> 409 REPORTE_NO_DISPONIBLE (capa 3, D7.3).
  it('[18.5] archivo con gate_aplicado=false tras viraje a ocultar_resultados=true -> 409 REPORTE_NO_DISPONIBLE', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const procesoId = await crearProceso(cookieAdmin, false);

    const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'resultados', formato: 'pdf' }, cookieAdmin);
    expect(respuesta.status).toBe(202);
    const { id } = await respuesta.json();

    // Simula un worker que YA emitió el archivo SIN podar, mientras la política todavía era
    // visible (gate_aplicado=false es la salida correcta y esperada en ese instante).
    await prisma.reporte.update({
      where: { id },
      data: {
        estado: 'emitida',
        gate_aplicado: false,
        archivo: Buffer.from('%PDF-1.4 con desglose'),
        archivo_mime: 'application/pdf',
        archivo_nombre: 'reporte.pdf',
        emitido_en: new Date(),
      },
    });

    // El viraje ocurre DESPUÉS de emitido.
    await prisma.procesoElectoral.update({ where: { id: procesoId }, data: { ocultar_resultados: true } });

    const descarga = await getArchivo(id, cookieAdmin);
    expect(descarga.status).toBe(409);
    const cuerpo = await descarga.json();
    expect(cuerpo.codigo).toBe('REPORTE_NO_DISPONIBLE');
  });

  // [18.6] control: un archivo YA podado (gate_aplicado=true) sigue siendo servible aunque la
  // política siga oculta — sólo gate_aplicado=false es lo que bloquea.
  it('[18.6] archivo con gate_aplicado=true bajo ocultar_resultados=true -> 200, descarga permitida', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const procesoId = await crearProceso(cookieAdmin, true);

    const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'resultados', formato: 'pdf' }, cookieAdmin);
    const { id } = await respuesta.json();

    await simularGeneracionWorker(id);

    const descarga = await getArchivo(id, cookieAdmin);
    expect(descarga.status).toBe(200);
  });
});
