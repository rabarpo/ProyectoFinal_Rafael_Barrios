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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-padron';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-procesos-electorales, PR5 (design.md "Contratos HTTP"/D2/D2b/D3, tareas 13.3-13.7,
 * 14.2). Corre contra Postgres+Redis reales, mismo criterio que `test/academico/aulas.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR4 de este change): `docker ps` no tiene daemon
 * Docker disponible en este entorno, así que esta suite NO pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada. Cobertura equivalente en verde en
 * `src/procesos/padron.service.spec.ts` (Prisma mockeado).
 */
describe('POST /procesos/padron e2e — padrón en vivo sin materialización [D2/D2b/D3/D4]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-padron-e2e-2026';
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

  async function postPadron(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/padron`, {
      method: 'POST',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Padron E2E ${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-padron-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `padron-${sufijo}@e2e.local`,
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

  async function matricularEstudiante(aulaId: string, anioEscolarId: string, conApoderado = false) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const estudiante = await prisma.usuario.create({
      data: {
        codigo: `e2e-padron-est-${sufijo}`,
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
    if (conApoderado) {
      await prisma.apoderado.create({
        data: { nombres: `Apoderado de ${estudiante.nombres}`, dni: `apo-${sufijo}`, usuario_id: estudiante.id },
      });
    }
    return estudiante;
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

  // 14.2: 401 sin cookie.
  it('[14.2] sin cookie responde 401', async () => {
    const respuesta = await postPadron({ publico_objetivo: 'estudiantes', alcance: 'institucion' }, null);
    expect(respuesta.status).toBe(401);
  });

  // 14.2: 403 para docente/estudiante.
  it.each(['docente', 'estudiante'] as const)('[14.2] rol %s responde 403', async (rol) => {
    const { codigo } = await crearUsuarioDirecto({ rol });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postPadron({ publico_objetivo: 'estudiantes', alcance: 'institucion' }, cookie);
    expect(respuesta.status).toBe(403);
  });

  // 14.2: 200 para administrador/director/comite.
  it.each(['administrador', 'director', 'comite'] as const)('[14.2] rol %s responde 200', async (rol) => {
    const { codigo } = await crearUsuarioDirecto({ rol });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    await crearArbolConAula(anioEscolar.id);

    const respuesta = await postPadron({ publico_objetivo: 'estudiantes', alcance: 'institucion' }, cookie);
    expect(respuesta.status).toBe(200);
  });

  // 13.3: sin AnioEscolar activo -> 409 SIN_ANIO_ESCOLAR_ACTIVO.
  it('[13.3] sin AnioEscolar activo responde 409 SIN_ANIO_ESCOLAR_ACTIVO', async () => {
    await prisma.anioEscolar.updateMany({ data: { activo: false } });
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postPadron({ publico_objetivo: 'estudiantes', alcance: 'institucion' }, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'SIN_ANIO_ESCOLAR_ACTIVO' });
  });

  // 13.4: exclusión de aulas sin matrícula activa del cálculo.
  it('[13.4] aula sin matrícula activa queda en aulas_excluidas', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);

    const respuesta = await postPadron({ publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aula.id] }, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo.aulas_excluidas).toEqual([aula.id]);
    expect(cuerpo.aulas).toEqual([]);
  });

  // 13.5: estudiante con dos matrículas activas -> aviso MATRICULA_DUPLICADA.
  it('[13.5][adversarial] estudiante con dos matrículas activas produce aviso MATRICULA_DUPLICADA', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula: aula1 } = await crearArbolConAula(anioEscolar.id);
    const { aula: aula2 } = await crearArbolConAula(anioEscolar.id);

    const estudiante = await matricularEstudiante(aula1.id, anioEscolar.id);
    await prisma.matricula.create({
      data: { usuario_id: estudiante.id, aula_id: aula2.id, anio_escolar_id: anioEscolar.id },
    });

    const respuesta = await postPadron(
      { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aula1.id, aula2.id] },
      cookie,
    );
    const cuerpo = await respuesta.json();
    expect(cuerpo.estudiantes).toBeGreaterThan(cuerpo.cuentas_distintas);
    expect(cuerpo.aviso).toBe('MATRICULA_DUPLICADA');
  });

  // 13.6: aula_ids de otro año escolar -> 409 REFERENCIA_INEXISTENTE, nunca contadas.
  it('[13.6][adversarial] aula_id de otro año escolar responde 409 REFERENCIA_INEXISTENTE', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioActivo = await crearAnioEscolarActivo();
    const anioOtro = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
    const { aula: aulaOtroAnio } = await crearArbolConAula(anioOtro.id);
    await crearArbolConAula(anioActivo.id);

    const respuesta = await postPadron(
      { publico_objetivo: 'estudiantes', alcance: 'aulas', aula_ids: [aulaOtroAnio.id] },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Aula' });
  });

  // 13.7: POST /procesos/padron no crea ninguna fila de DerechoVoto.
  it('[13.7][adversarial] no crea ninguna fila de DerechoVoto', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula.id, anioEscolar.id, true);

    const antes = await prisma.derechoVoto.count();
    const respuesta = await postPadron({ publico_objetivo: 'comunidad', alcance: 'aulas', aula_ids: [aula.id] }, cookie);
    expect(respuesta.status).toBe(200);
    const despues = await prisma.derechoVoto.count();
    expect(despues).toBe(antes);
  });

  // 13.2: doble derecho de comunidad.
  it('[13.2][spec: doble derecho] publico_objetivo=comunidad suma estudiante + apoderado', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolarActivo();
    const { aula } = await crearArbolConAula(anioEscolar.id);
    await matricularEstudiante(aula.id, anioEscolar.id, true);

    const respuesta = await postPadron({ publico_objetivo: 'comunidad', alcance: 'aulas', aula_ids: [aula.id] }, cookie);
    const cuerpo = await respuesta.json();
    expect(cuerpo.derechos_totales).toBe(2);
  });
});
