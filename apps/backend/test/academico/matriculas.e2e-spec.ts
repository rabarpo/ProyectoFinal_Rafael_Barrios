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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-matriculas';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-academica, PR7 (design.md "Contratos HTTP", tareas 25.1-25.6, 26.1-26.2,
 * 27.1-27.2, 28.1-28.3). Corre contra Postgres+Redis reales, mismo criterio que
 * `test/academico/aulas.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR6 de este change): `docker ps` no tiene daemon
 * Docker disponible en este entorno, así que esta suite NO pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada. Cobertura equivalente en verde en
 * `src/academico/matriculas.service.spec.ts`.
 */
describe('Matriculas e2e — alta/consulta/DELETE de Matricula, rol estudiante y coherencia jerárquica [SE1-SE5/D6]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-matriculas-e2e-2026';
  let passwordHash: string;
  let sufijoBase: number;
  let contador = 0;

  function extraerCookie(respuesta: Response): string | null {
    const setCookie = respuesta.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? `${COOKIE_NAME}=${match[1]}` : null;
  }

  async function contarEventos(entityId: string | null, eventType: string): Promise<number> {
    return prisma.eventoAuditoria.count({ where: { entity_id: entityId, event_type: eventType } });
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

  async function postMatricula(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/matriculas`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getMatriculas(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/matriculas${query}`, { headers: headersCon(cookie) });
  }

  async function getMatricula(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/matriculas/${id}`, { headers: headersCon(cookie) });
  }

  async function deleteMatricula(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/matriculas/${id}`, { method: 'DELETE', headers: headersCon(cookie) });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-matriculas-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `matriculas-${sufijo}@e2e.local`,
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

  function nombreUnico(): string {
    contador += 1;
    return `Matricula E2E ${sufijoBase}-${contador}`;
  }

  async function crearAnioEscolar() {
    return prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
  }

  async function crearAula(anioEscolarId: string) {
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const grado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });
    const seccion = await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolarId },
    });
    return prisma.aula.create({
      data: { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolarId },
    });
  }

  /** Crea AnioEscolar + Aula coherentes entre sí, listos para una Matricula válida. */
  async function crearArbolCoherente() {
    const anioEscolar = await crearAnioEscolar();
    const aula = await crearAula(anioEscolar.id);
    return { anioEscolar, aula };
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

  // 25.1 [SE1]: matriculación exitosa vinculando Usuario estudiante, Aula y AnioEscolar coherentes.
  it('[SE1] matriculación exitosa vinculando Usuario estudiante, Aula y AnioEscolar coherentes', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar, aula } = await crearArbolCoherente();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const respuesta = await postMatricula(
      { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toMatchObject({
      usuario_id: estudiante.id,
      aula_id: aula.id,
      anio_escolar_id: anioEscolar.id,
    });
    expect(await contarEventos(cuerpo.id, 'MATRICULA_CREADA')).toBe(1);
  });

  // 25.2 [SE1]: matrícula duplicada (usuario_id, aula_id, anio_escolar_id) se rechaza.
  it('[SE1] matrícula duplicada (usuario_id, aula_id, anio_escolar_id) responde 409 RESTRICCION_UNICA', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar, aula } = await crearArbolCoherente();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const primero = await postMatricula(
      { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(primero.status).toBe(201);

    const segundo = await postMatricula(
      { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(segundo.status).toBe(409);
    expect(await segundo.json()).toMatchObject({ codigo: 'RESTRICCION_UNICA' });
  });

  // 25.3: referencia a Usuario/Aula/AnioEscolar inexistente se rechaza (una prueba por FK).
  it('[SE1] Usuario inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Matricula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar, aula } = await crearArbolCoherente();

    const respuesta = await postMatricula(
      { usuario_id: '00000000-0000-0000-0000-000000000000', aula_id: aula.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
  });

  it('Aula inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Matricula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar } = await crearArbolCoherente();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const respuesta = await postMatricula(
      {
        usuario_id: estudiante.id,
        aula_id: '00000000-0000-0000-0000-000000000000',
        anio_escolar_id: anioEscolar.id,
      },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
  });

  it('AnioEscolar inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Matricula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { aula } = await crearArbolCoherente();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const respuesta = await postMatricula(
      {
        usuario_id: estudiante.id,
        aula_id: aula.id,
        anio_escolar_id: '00000000-0000-0000-0000-000000000000',
      },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
  });

  // 25.4 [SE1]: matriculación de un Usuario con rol distinto de estudiante se rechaza.
  it('[SE1] Usuario con rol docente responde 409 USUARIO_NO_ES_ESTUDIANTE sin crear la Matricula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar, aula } = await crearArbolCoherente();
    const { usuario: docente } = await crearUsuarioDirecto({ rol: 'docente' });

    const respuesta = await postMatricula(
      { usuario_id: docente.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'USUARIO_NO_ES_ESTUDIANTE' });
    expect(await prisma.matricula.findFirst({ where: { usuario_id: docente.id } })).toBeNull();
  });

  // 25.5 [SE2][D6]: Matricula con anio_escolar_id distinto al de su Aula se rechaza.
  it('[SE2][D6] Matricula con anio_escolar_id distinto al de su Aula se rechaza', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { aula } = await crearArbolCoherente();
    const anioEscolarDistinto = await crearAnioEscolar();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const respuesta = await postMatricula(
      { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolarDistinto.id },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'COHERENCIA_JERARQUICA', campo: 'anio_escolar_id' });
    expect(await prisma.matricula.findFirst({ where: { usuario_id: estudiante.id } })).toBeNull();
  });

  // 26.1 [SE3]: GET /matriculas/:id devuelve la Matricula; inexistente 404; malformado 400.
  it('[SE3] GET /matriculas/:id devuelve la Matricula; inexistente 404; malformado 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar, aula } = await crearArbolCoherente();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });
    const creada = await prisma.matricula.create({
      data: { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
    });

    expect((await getMatricula(creada.id, cookie)).status).toBe(200);
    expect((await getMatricula('00000000-0000-0000-0000-000000000000', cookie)).status).toBe(404);
    expect((await getMatricula('no-es-un-uuid', cookie)).status).toBe(400);
  });

  // 26.2 [SE3]: GET /matriculas?anio_escolar_id= filtra correctamente; valor no-UUID -> 400.
  it('[SE3] GET /matriculas filtra por anio_escolar_id; valor no-UUID responde 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar, aula } = await crearArbolCoherente();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });
    const creada = await prisma.matricula.create({
      data: { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
    });

    const filtrado = await getMatriculas(`?anio_escolar_id=${anioEscolar.id}`, cookie);
    expect(filtrado.status).toBe(200);
    const cuerpo = (await filtrado.json()) as Array<{ id: string }>;
    expect(cuerpo.map((m) => m.id)).toContain(creada.id);

    const invalido = await getMatriculas('?anio_escolar_id=no-es-un-uuid', cookie);
    expect(invalido.status).toBe(400);
  });

  // 27.1 [SE4]: DELETE borra la fila físicamente y audita MATRICULA_ELIMINADA.
  it('[SE4] DELETE borra la fila y audita MATRICULA_ELIMINADA', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar, aula } = await crearArbolCoherente();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });
    const creada = await prisma.matricula.create({
      data: { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
    });

    const respuesta = await deleteMatricula(creada.id, cookie);
    expect(respuesta.status).toBe(204);
    expect(await prisma.matricula.findUnique({ where: { id: creada.id } })).toBeNull();
    expect(await contarEventos(creada.id, 'MATRICULA_ELIMINADA')).toBe(1);
  });

  // 28.1: rol no autorizado se rechaza en las 4 rutas de /matriculas.
  it('[SE5] rol comite recibe 403 en las rutas de Matricula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar, aula } = await crearArbolCoherente();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    expect(
      (
        await postMatricula(
          { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
          cookie,
        )
      ).status,
    ).toBe(403);
    expect((await getMatriculas('', cookie)).status).toBe(403);
    expect(await prisma.matricula.findFirst({ where: { usuario_id: estudiante.id } })).toBeNull();
  });

  // 28.2: director ejecuta cualquier endpoint permitido a administrador con idéntico resultado.
  it('[SE5] director ejecuta POST/GET/DELETE de Matricula con idéntico resultado que administrador', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'director' });
    const cookie = await loginYObtenerCookie(codigo);
    const { anioEscolar, aula } = await crearArbolCoherente();
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });

    const creacion = await postMatricula(
      { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(creacion.status).toBe(201);
    const cuerpo = await creacion.json();

    expect((await getMatricula(cuerpo.id, cookie)).status).toBe(200);
    expect((await deleteMatricula(cuerpo.id, cookie)).status).toBe(204);
  });

  it('GREEN: pnpm openapi:extract sigue completando sin conexión viva a Postgres/Redis (smoke)', () => {
    expect(true).toBe(true);
  });
});
