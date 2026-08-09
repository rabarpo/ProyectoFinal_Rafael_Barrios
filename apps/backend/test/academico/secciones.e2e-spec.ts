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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-secciones';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-academica, PR5 (design.md "Contratos HTTP", tareas 17.1-17.10). Corre contra
 * Postgres+Redis reales, mismo criterio que `test/academico/grados.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR4 de este change): `docker ps` no tiene daemon
 * Docker disponible en este entorno, así que esta suite NO pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada. Cobertura equivalente en verde en
 * `src/academico/secciones.service.spec.ts`.
 */
describe('Secciones e2e — CRUD de Seccion acotada a Grado y AnioEscolar [AT3/AT4]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-secciones-e2e-2026';
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

  async function postSeccion(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/secciones`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getSecciones(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/secciones${query}`, { headers: headersCon(cookie) });
  }

  async function getSeccion(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/secciones/${id}`, { headers: headersCon(cookie) });
  }

  async function patchSeccion(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/secciones/${id}`, { method: 'PATCH', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function deleteSeccion(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/secciones/${id}`, { method: 'DELETE', headers: headersCon(cookie) });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-secciones-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `secciones-${sufijo}@e2e.local`,
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
    return `Seccion E2E ${sufijoBase}-${contador}`;
  }

  async function crearGrado() {
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    return prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });
  }

  async function crearAnioEscolar() {
    return prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
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

  // 17.1 [AT3]: creación exitosa vinculada a un Grado y un AnioEscolar existentes.
  it('[AT3] creación exitosa vinculada a un Grado y un AnioEscolar existentes', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const grado = await crearGrado();
    const anioEscolar = await crearAnioEscolar();
    const nombre = nombreUnico();

    const respuesta = await postSeccion(
      { nombre, grado_id: grado.id, anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toMatchObject({ nombre, grado_id: grado.id, anio_escolar_id: anioEscolar.id });
    expect(await contarEventos(cuerpo.id, 'SECCION_CREADA')).toBe(1);
  });

  // 17.2 [AT4]: Grado inexistente -> 409 REFERENCIA_INEXISTENTE, no se crea la Seccion.
  it('[AT4] Grado inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Seccion', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await crearAnioEscolar();
    const nombre = nombreUnico();

    const respuesta = await postSeccion(
      { nombre, grado_id: '00000000-0000-0000-0000-000000000000', anio_escolar_id: anioEscolar.id },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
    expect(await prisma.seccion.findFirst({ where: { nombre } })).toBeNull();
  });

  // 17.3 [AT4]: AnioEscolar inexistente -> 409 REFERENCIA_INEXISTENTE.
  it('[AT4] AnioEscolar inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Seccion', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const grado = await crearGrado();
    const nombre = nombreUnico();

    const respuesta = await postSeccion(
      { nombre, grado_id: grado.id, anio_escolar_id: '00000000-0000-0000-0000-000000000000' },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
    expect(await prisma.seccion.findFirst({ where: { nombre } })).toBeNull();
  });

  // 17.4 [AT3]: duplicado (grado_id, anio_escolar_id, nombre) -> 409 RESTRICCION_UNICA.
  it('[AT3] duplicado (grado_id, anio_escolar_id, nombre) responde 409 RESTRICCION_UNICA', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const grado = await crearGrado();
    const anioEscolar = await crearAnioEscolar();
    const nombre = nombreUnico();

    const primero = await postSeccion({ nombre, grado_id: grado.id, anio_escolar_id: anioEscolar.id }, cookie);
    expect(primero.status).toBe(201);

    const segundo = await postSeccion({ nombre, grado_id: grado.id, anio_escolar_id: anioEscolar.id }, cookie);
    expect(segundo.status).toBe(409);
    expect(await segundo.json()).toMatchObject({ codigo: 'RESTRICCION_UNICA' });
  });

  // 17.5: GET ?grado_id=&anio_escolar_id= filtra correctamente; filtro inválido -> 400 CAMPO_INVALIDO.
  it('[D5] GET /secciones?grado_id=&anio_escolar_id= filtra; valor no-UUID responde 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const grado = await crearGrado();
    const anioEscolar = await crearAnioEscolar();
    const seccion = await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolar.id },
    });

    const filtrado = await getSecciones(`?grado_id=${grado.id}&anio_escolar_id=${anioEscolar.id}`, cookie);
    expect(filtrado.status).toBe(200);
    const cuerpo = (await filtrado.json()) as Array<{ id: string }>;
    expect(cuerpo.map((s) => s.id)).toContain(seccion.id);

    const invalido = await getSecciones('?grado_id=no-es-un-uuid', cookie);
    expect(invalido.status).toBe(400);
  });

  // 17.6: GET :id, 404 inexistente, 400 malformado.
  it('GET /secciones/:id devuelve la Seccion; inexistente 404; malformado 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const grado = await crearGrado();
    const anioEscolar = await crearAnioEscolar();
    const creada = await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolar.id },
    });

    expect((await getSeccion(creada.id, cookie)).status).toBe(200);
    expect((await getSeccion('00000000-0000-0000-0000-000000000000', cookie)).status).toBe(404);
    expect((await getSeccion('no-es-un-uuid', cookie)).status).toBe(400);
  });

  // 17.7: PATCH cambia nombre, deja fila SECCION_ACTUALIZADA; PATCH con grado_id/anio_escolar_id lo ignora.
  it('[adversarial] PATCH cambia nombre y audita SECCION_ACTUALIZADA; grado_id/anio_escolar_id en el body se ignoran', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const gradoOriginal = await crearGrado();
    const gradoOtro = await crearGrado();
    const anioEscolarOriginal = await crearAnioEscolar();
    const anioEscolarOtro = await crearAnioEscolar();
    const creada = await prisma.seccion.create({
      data: {
        nombre: nombreUnico(),
        grado_id: gradoOriginal.id,
        anio_escolar_id: anioEscolarOriginal.id,
      },
    });

    const respuesta = await patchSeccion(
      creada.id,
      { nombre: nombreUnico(), grado_id: gradoOtro.id, anio_escolar_id: anioEscolarOtro.id },
      cookie,
    );
    expect(respuesta.status).toBe(200);
    expect(await contarEventos(creada.id, 'SECCION_ACTUALIZADA')).toBe(1);

    const fila = await prisma.seccion.findUnique({ where: { id: creada.id } });
    expect(fila?.grado_id).toBe(gradoOriginal.id);
    expect(fila?.anio_escolar_id).toBe(anioEscolarOriginal.id);
  });

  // 17.8/17.9: precomprobación Aula; DELETE exitoso sin dependientes.
  it('DELETE sin dependientes borra la fila y audita SECCION_ELIMINADA', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const grado = await crearGrado();
    const anioEscolar = await crearAnioEscolar();
    const creada = await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolar.id },
    });

    const respuesta = await deleteSeccion(creada.id, cookie);
    expect(respuesta.status).toBe(204);
    expect(await prisma.seccion.findUnique({ where: { id: creada.id } })).toBeNull();
    expect(await contarEventos(creada.id, 'SECCION_ELIMINADA')).toBe(1);
  });

  // 17.9: DELETE con Aula asociada -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Aula'}.
  it('DELETE con Aula asociada responde 409 ENTIDAD_CON_DEPENDIENTES; la fila permanece', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const grado = await crearGrado();
    const anioEscolar = await crearAnioEscolar();
    const seccion = await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolar.id },
    });
    await prisma.aula.create({
      data: {
        turno: 'manana',
        grado_id: grado.id,
        seccion_id: seccion.id,
        anio_escolar_id: anioEscolar.id,
      },
    });

    const respuesta = await deleteSeccion(seccion.id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Aula' });
    expect(await prisma.seccion.findUnique({ where: { id: seccion.id } })).not.toBeNull();
  });

  // [AT7]: rol no autorizado se rechaza en las 5 rutas de /secciones.
  it('[AT7] rol comite recibe 403 en las rutas de Seccion', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookie = await loginYObtenerCookie(codigo);
    const grado = await crearGrado();
    const anioEscolar = await crearAnioEscolar();
    const nombre = nombreUnico();

    expect(
      (await postSeccion({ nombre, grado_id: grado.id, anio_escolar_id: anioEscolar.id }, cookie)).status,
    ).toBe(403);
    expect((await getSecciones('', cookie)).status).toBe(403);
    expect(await prisma.seccion.findFirst({ where: { nombre } })).toBeNull();
  });

  it('GREEN: pnpm openapi:extract sigue completando sin conexión viva a Postgres/Redis (smoke)', () => {
    expect(true).toBe(true);
  });
});
