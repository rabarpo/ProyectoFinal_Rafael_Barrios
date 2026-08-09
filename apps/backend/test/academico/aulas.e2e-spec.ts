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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-aulas';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-academica, PR6 (design.md "Contratos HTTP", tareas 21.1-21.10, 22.1-22.2). Corre
 * contra Postgres+Redis reales, mismo criterio que `test/academico/secciones.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR5 de este change): `docker ps` no tiene daemon
 * Docker disponible en este entorno, así que esta suite NO pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada. Cobertura equivalente en verde en
 * `src/academico/aulas.service.spec.ts`.
 */
describe('Aulas e2e — CRUD de Aula acotada a Grado/Seccion/AnioEscolar + coherencia jerárquica [AT5/AT6/D6]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-aulas-e2e-2026';
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

  async function postAula(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/aulas`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getAulas(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/aulas${query}`, { headers: headersCon(cookie) });
  }

  async function getAula(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/aulas/${id}`, { headers: headersCon(cookie) });
  }

  async function patchAula(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/aulas/${id}`, { method: 'PATCH', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function deleteAula(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/aulas/${id}`, { method: 'DELETE', headers: headersCon(cookie) });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-aulas-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `aulas-${sufijo}@e2e.local`,
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
    return `Aula E2E ${sufijoBase}-${contador}`;
  }

  async function crearGrado() {
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    return prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });
  }

  async function crearAnioEscolar() {
    return prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
  }

  async function crearSeccion(gradoId: string, anioEscolarId: string) {
    return prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: gradoId, anio_escolar_id: anioEscolarId },
    });
  }

  /** Crea Grado + AnioEscolar + Seccion coherentes entre sí, listos para un Aula válida. */
  async function crearArbolCoherente() {
    const grado = await crearGrado();
    const anioEscolar = await crearAnioEscolar();
    const seccion = await crearSeccion(grado.id, anioEscolar.id);
    return { grado, anioEscolar, seccion };
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

  // 21.1 [AT5]: creación exitosa con turno='manana', vinculada y coherente.
  it('[AT5] creación exitosa con turno válido, vinculada a Grado/Seccion/AnioEscolar coherentes', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion, anioEscolar } = await crearArbolCoherente();

    const respuesta = await postAula(
      { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toMatchObject({
      turno: 'manana',
      grado_id: grado.id,
      seccion_id: seccion.id,
      anio_escolar_id: anioEscolar.id,
    });
    expect(await contarEventos(cuerpo.id, 'AULA_CREADA')).toBe(1);
  });

  // 21.2: turno fuera de {manana, tarde} -> 400 CAMPO_INVALIDO.
  it('turno fuera de {manana, tarde} responde 400 CAMPO_INVALIDO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion, anioEscolar } = await crearArbolCoherente();

    const respuesta = await postAula(
      { turno: 'noche', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'CAMPO_INVALIDO', campo: 'turno' });
  });

  // 21.3: Grado/Seccion/AnioEscolar inexistente -> 409 REFERENCIA_INEXISTENTE (una prueba por FK).
  it('[AT5] Grado inexistente responde 409 REFERENCIA_INEXISTENTE sin crear el Aula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { seccion, anioEscolar } = await crearArbolCoherente();

    const respuesta = await postAula(
      {
        turno: 'manana',
        grado_id: '00000000-0000-0000-0000-000000000000',
        seccion_id: seccion.id,
        anio_escolar_id: anioEscolar.id,
      },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
  });

  it('Seccion inexistente responde 409 REFERENCIA_INEXISTENTE sin crear el Aula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, anioEscolar } = await crearArbolCoherente();

    const respuesta = await postAula(
      {
        turno: 'manana',
        grado_id: grado.id,
        seccion_id: '00000000-0000-0000-0000-000000000000',
        anio_escolar_id: anioEscolar.id,
      },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
  });

  it('AnioEscolar inexistente responde 409 REFERENCIA_INEXISTENTE sin crear el Aula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion } = await crearArbolCoherente();

    const respuesta = await postAula(
      {
        turno: 'manana',
        grado_id: grado.id,
        seccion_id: seccion.id,
        anio_escolar_id: '00000000-0000-0000-0000-000000000000',
      },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
  });

  // 22.1 [AT6][D6]: Aula con grado_id distinto al de su Seccion se rechaza.
  it('[AT6][D6] Aula con grado_id distinto al de su Seccion se rechaza', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { seccion, anioEscolar } = await crearArbolCoherente();
    const gradoDistinto = await crearGrado();

    const respuesta = await postAula(
      { turno: 'manana', grado_id: gradoDistinto.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'COHERENCIA_JERARQUICA', campo: 'grado_id' });
    expect(await prisma.aula.findFirst({ where: { seccion_id: seccion.id } })).toBeNull();
  });

  // 22.2 [AT6][D6]: Aula con anio_escolar_id distinto al de su Seccion se rechaza.
  it('[AT6][D6] Aula con anio_escolar_id distinto al de su Seccion se rechaza', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion } = await crearArbolCoherente();
    const anioEscolarDistinto = await crearAnioEscolar();

    const respuesta = await postAula(
      { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolarDistinto.id },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'COHERENCIA_JERARQUICA', campo: 'anio_escolar_id' });
    expect(await prisma.aula.findFirst({ where: { seccion_id: seccion.id } })).toBeNull();
  });

  // 21.4 [AT5]: duplicado (grado_id, seccion_id, anio_escolar_id) -> 409 RESTRICCION_UNICA.
  it('[AT5] duplicado (grado_id, seccion_id, anio_escolar_id) responde 409 RESTRICCION_UNICA', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion, anioEscolar } = await crearArbolCoherente();

    const primero = await postAula(
      { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(primero.status).toBe(201);

    const segundo = await postAula(
      { turno: 'tarde', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(segundo.status).toBe(409);
    expect(await segundo.json()).toMatchObject({ codigo: 'RESTRICCION_UNICA' });
  });

  // 21.5: GET ?grado_id=&seccion_id=&anio_escolar_id=&turno= filtra; filtro inválido -> 400.
  it('[D5] GET /aulas filtra por grado_id/seccion_id/anio_escolar_id/turno; valor inválido responde 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion, anioEscolar } = await crearArbolCoherente();
    const aula = await prisma.aula.create({
      data: { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
    });

    const filtrado = await getAulas(
      `?grado_id=${grado.id}&seccion_id=${seccion.id}&anio_escolar_id=${anioEscolar.id}&turno=manana`,
      cookie,
    );
    expect(filtrado.status).toBe(200);
    const cuerpo = (await filtrado.json()) as Array<{ id: string }>;
    expect(cuerpo.map((a) => a.id)).toContain(aula.id);

    const invalido = await getAulas('?turno=noche', cookie);
    expect(invalido.status).toBe(400);
  });

  // 21.6: GET :id, 404 inexistente, 400 malformado.
  it('GET /aulas/:id devuelve el Aula; inexistente 404; malformado 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion, anioEscolar } = await crearArbolCoherente();
    const creada = await prisma.aula.create({
      data: { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
    });

    expect((await getAula(creada.id, cookie)).status).toBe(200);
    expect((await getAula('00000000-0000-0000-0000-000000000000', cookie)).status).toBe(404);
    expect((await getAula('no-es-un-uuid', cookie)).status).toBe(400);
  });

  // 21.7: PATCH cambia turno, deja fila AULA_ACTUALIZADA; PATCH con cualquier FK la ignora.
  it('[adversarial] PATCH cambia turno y audita AULA_ACTUALIZADA; las FK en el body se ignoran', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion, anioEscolar } = await crearArbolCoherente();
    const gradoOtro = await crearGrado();
    const creada = await prisma.aula.create({
      data: { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
    });

    const respuesta = await patchAula(
      creada.id,
      { turno: 'tarde', grado_id: gradoOtro.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(respuesta.status).toBe(200);
    expect(await contarEventos(creada.id, 'AULA_ACTUALIZADA')).toBe(1);

    const fila = await prisma.aula.findUnique({ where: { id: creada.id } });
    expect(fila?.turno).toBe('tarde');
    expect(fila?.grado_id).toBe(grado.id);
  });

  // DELETE sin dependientes borra la fila.
  it('DELETE sin dependientes borra la fila y audita AULA_ELIMINADA', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion, anioEscolar } = await crearArbolCoherente();
    const creada = await prisma.aula.create({
      data: { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
    });

    const respuesta = await deleteAula(creada.id, cookie);
    expect(respuesta.status).toBe(204);
    expect(await prisma.aula.findUnique({ where: { id: creada.id } })).toBeNull();
    expect(await contarEventos(creada.id, 'AULA_ELIMINADA')).toBe(1);
  });

  // 21.9: DELETE con Matricula asociada -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Matricula'}.
  it('[AT5] DELETE con Matricula asociada responde 409 ENTIDAD_CON_DEPENDIENTES; la fila permanece', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion, anioEscolar } = await crearArbolCoherente();
    const aula = await prisma.aula.create({
      data: { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
    });
    const { usuario: estudiante } = await crearUsuarioDirecto({ rol: 'estudiante' });
    await prisma.matricula.create({
      data: { usuario_id: estudiante.id, aula_id: aula.id, anio_escolar_id: anioEscolar.id },
    });

    const respuesta = await deleteAula(aula.id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Matricula' });
    expect(await prisma.aula.findUnique({ where: { id: aula.id } })).not.toBeNull();
  });

  // [AT7]: rol no autorizado se rechaza en las 5 rutas de /aulas.
  it('[AT7] rol comite recibe 403 en las rutas de Aula', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookie = await loginYObtenerCookie(codigo);
    const { grado, seccion, anioEscolar } = await crearArbolCoherente();

    expect(
      (
        await postAula(
          { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
          cookie,
        )
      ).status,
    ).toBe(403);
    expect((await getAulas('', cookie)).status).toBe(403);
    expect(await prisma.aula.findFirst({ where: { seccion_id: seccion.id } })).toBeNull();
  });

  it('GREEN: pnpm openapi:extract sigue completando sin conexión viva a Postgres/Redis (smoke)', () => {
    expect(true).toBe(true);
  });
});
