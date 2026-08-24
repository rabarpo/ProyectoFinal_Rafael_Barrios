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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-reportes-solicitud';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

const DIMENSIONES = ['participacion', 'votantes', 'abstenciones', 'resultados', 'candidatos', 'consultas'] as const;
const FORMATOS = ['excel', 'pdf', 'csv'] as const;

/**
 * reportes-y-exportaciones (#18, PR3; design.md "Contratos HTTP"/"Flujo de datos", tareas
 * 10.1-10.7). Corre contra Postgres+Redis reales, mismo patrón que
 * `test/procesos/actas-descarga.e2e-spec.ts`: `fetch` real contra el servidor + `PrismaClient`
 * propio para crear el proceso vía el flujo real (`POST /procesos`). El endpoint NO encola nada
 * (D9/ADR-0012, desviación declarada de design.md): esta suite asegura la fila `borrador`, nunca un
 * job en la cola `reportes` (ese descubrimiento es responsabilidad del despachador del worker,
 * PR4).
 */
describe('POST /reportes e2e — solicitud [spec: Solicitud de reporte]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-reportes-solicitud-e2e-2026';
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

  function nombreUnico(): string {
    contador += 1;
    return `Reportes E2E ${sufijoBase}-${contador}`;
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
    const codigo = `e2e-reportes-solicitud-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `reportes-solicitud-${sufijo}@e2e.local`,
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
        codigo: `e2e-reportes-solicitud-est-${sufijo}`,
        dni: `est-${sufijo}`,
        correo: `est-reportes-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    await prisma.matricula.create({ data: { usuario_id: usuario.id, aula_id: aulaId, anio_escolar_id: anioEscolarId } });
  }

  // Cada proceso requiere al menos un aula con matrícula activa (SEGMENTACION_SIN_ELEGIBLES,
  // `ProcesosService.crear()`) — sin esto `POST /procesos` responde 409 antes de llegar al
  // endpoint bajo prueba.
  async function crearProcesoBorrador(cookieAdmin: string): Promise<string> {
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula.id, anioEscolar.id);

    const respuesta = await postCrearProceso(dtoProceso({ aula_ids: [aula.id] }), cookieAdmin);
    expect(respuesta.status).toBe(201);
    const { id } = await respuesta.json();
    return id as string;
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

  // 10.1/spec "Solicitud válida" — los 6x3=18 pares válidos.
  it.each(DIMENSIONES.flatMap((dimension) => FORMATOS.map((formato) => [dimension, formato] as const)))(
    '[10.1] dimension=%s formato=%s -> 202 y fila borrador con contenido JSON consultable',
    async (dimension, formato) => {
      const { codigo } = await crearUsuarioDirecto({ rol: 'director' });
      const cookie = await loginYObtenerCookie(codigo);
      const procesoId = await crearProcesoBorrador(cookie);

      const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension, formato }, cookie);
      expect(respuesta.status).toBe(202);
      const cuerpo = await respuesta.json();
      expect(cuerpo.estado).toBe('borrador');
      expect(cuerpo).not.toHaveProperty('contenido');
      expect(cuerpo).not.toHaveProperty('archivo');

      const fila = await prisma.reporte.findUnique({ where: { id: cuerpo.id } });
      expect(fila).not.toBeNull();
      expect(fila!.estado).toBe('borrador');
      expect(fila!.solicitado_por).toBeTruthy();
      expect(fila!.contenido).toBeTruthy();
    },
  );

  // 10.2/spec "Dimensión inválida" y "Formato inválido".
  it('[10.2] dimension inválida -> 400, cero filas creadas', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const procesoId = await crearProcesoBorrador(cookie);

    const antes = await prisma.reporte.count();
    const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'auditoria', formato: 'pdf' }, cookie);
    expect(respuesta.status).toBe(400);
    expect(await prisma.reporte.count()).toBe(antes);
  });

  it('[10.2] formato inválido -> 400, cero filas creadas', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const procesoId = await crearProcesoBorrador(cookie);

    const antes = await prisma.reporte.count();
    const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'resultados', formato: 'word' }, cookie);
    expect(respuesta.status).toBe(400);
    expect(await prisma.reporte.count()).toBe(antes);
  });

  // 10.3/spec "Proceso inexistente".
  it('[10.3] proceso_id inexistente -> 404, cero filas', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const antes = await prisma.reporte.count();
    const respuesta = await postSolicitarReporte(
      { proceso_id: '123e4567-e89b-12d3-a456-426614174000', dimension: 'resultados', formato: 'pdf' },
      cookie,
    );
    expect(respuesta.status).toBe(404);
    expect(await prisma.reporte.count()).toBe(antes);
  });

  // 10.4/spec "Rol no autorizado".
  it.each(['estudiante', 'docente'] as const)('[10.4] rol %s -> 403, cero filas', async (rol) => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const procesoId = await crearProcesoBorrador(cookieAdmin);

    const { codigo } = await crearUsuarioDirecto({ rol });
    const cookie = await loginYObtenerCookie(codigo);

    const antes = await prisma.reporte.count();
    const respuesta = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'resultados', formato: 'pdf' }, cookie);
    expect(respuesta.status).toBe(403);
    expect(await prisma.reporte.count()).toBe(antes);
  });

  // 10.5/spec "Sin sesión".
  it('[10.5] sin cookie -> 401', async () => {
    const respuesta = await postSolicitarReporte(
      { proceso_id: '123e4567-e89b-12d3-a456-426614174000', dimension: 'resultados', formato: 'pdf' },
      null,
    );
    expect(respuesta.status).toBe(401);
  });

  // 10.6/spec "Snapshot inmutable" y "Reintento crea un registro nuevo".
  it('[10.6] dos solicitudes idénticas -> dos filas distintas, la primera intacta', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookie = await loginYObtenerCookie(codigo);
    const procesoId = await crearProcesoBorrador(cookie);

    const primera = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'votantes', formato: 'csv' }, cookie);
    expect(primera.status).toBe(202);
    const cuerpoPrimera = await primera.json();

    const segunda = await postSolicitarReporte({ proceso_id: procesoId, dimension: 'votantes', formato: 'csv' }, cookie);
    expect(segunda.status).toBe(202);
    const cuerpoSegunda = await segunda.json();

    expect(cuerpoSegunda.id).not.toBe(cuerpoPrimera.id);

    const filaPrimera = await prisma.reporte.findUnique({ where: { id: cuerpoPrimera.id } });
    expect(filaPrimera).not.toBeNull();
    expect(filaPrimera!.estado).toBe('borrador');
  });
});
