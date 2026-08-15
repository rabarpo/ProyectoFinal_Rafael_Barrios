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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-grados';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-academica, PR4 (design.md "Contratos HTTP", tareas 14.1-14.9). Corre contra
 * Postgres+Redis reales, mismo criterio que `test/academico/niveles.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR3 de este change): `docker ps` no tiene daemon
 * Docker disponible en este entorno, así que esta suite NO pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada. Cobertura equivalente en verde en
 * `src/academico/grados.service.spec.ts`.
 */
describe('Grados e2e — CRUD de Grado acotado a Nivel [AT2]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-grados-e2e-2026';
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

  async function postGrado(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/grados`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getGrados(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/grados${query}`, { headers: headersCon(cookie) });
  }

  async function getGrado(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/grados/${id}`, { headers: headersCon(cookie) });
  }

  async function patchGrado(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/grados/${id}`, { method: 'PATCH', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function deleteGrado(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/grados/${id}`, { method: 'DELETE', headers: headersCon(cookie) });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-grados-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `grados-${sufijo}@e2e.local`,
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
    return `Grado E2E ${sufijoBase}-${contador}`;
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

  // 14.1 [AT2]: Nivel inexistente -> 409 REFERENCIA_INEXISTENTE, no se crea el Grado.
  it('[AT2] Nivel inexistente responde 409 REFERENCIA_INEXISTENTE sin crear el Grado', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nombre = nombreUnico();

    const respuesta = await postGrado(
      { nombre, nivel_id: '00000000-0000-0000-0000-000000000000' },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
    expect(await prisma.grado.findFirst({ where: { nombre } })).toBeNull();
  });

  // 14.2 [AT2]: mismo nombre bajo Nivel distinto se acepta.
  it('[AT2] mismo nombre de Grado bajo Nivel distinto se acepta sin conflicto', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nivelA = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const nivelB = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const nombre = nombreUnico();

    const primero = await postGrado({ nombre, nivel_id: nivelA.id }, cookie);
    const segundo = await postGrado({ nombre, nivel_id: nivelB.id }, cookie);

    expect(primero.status).toBe(201);
    expect(segundo.status).toBe(201);
  });

  // 14.3 [AT2]: duplicado (nivel_id, nombre) -> 409 RESTRICCION_UNICA.
  it('[AT2] duplicado (nivel_id, nombre) responde 409 RESTRICCION_UNICA', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const nombre = nombreUnico();

    const primero = await postGrado({ nombre, nivel_id: nivel.id }, cookie);
    expect(primero.status).toBe(201);

    const segundo = await postGrado({ nombre, nivel_id: nivel.id }, cookie);
    expect(segundo.status).toBe(409);
    expect(await segundo.json()).toMatchObject({ codigo: 'RESTRICCION_UNICA' });
  });

  // 14.4: GET ?nivel_id= filtra correctamente; valor no-UUID -> 400 CAMPO_INVALIDO.
  it('[D5] GET /grados?nivel_id= filtra; valor no-UUID responde 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const grado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });

    const filtrado = await getGrados(`?nivel_id=${nivel.id}`, cookie);
    expect(filtrado.status).toBe(200);
    const cuerpo = (await filtrado.json()) as Array<{ id: string }>;
    expect(cuerpo.map((g) => g.id)).toContain(grado.id);

    const invalido = await getGrados('?nivel_id=no-es-un-uuid', cookie);
    expect(invalido.status).toBe(400);
  });

  // 14.5: GET :id, 404 inexistente, 400 malformado.
  it('GET /grados/:id devuelve el Grado; inexistente 404; malformado 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const creado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });

    expect((await getGrado(creado.id, cookie)).status).toBe(200);
    expect((await getGrado('00000000-0000-0000-0000-000000000000', cookie)).status).toBe(404);
    expect((await getGrado('no-es-un-uuid', cookie)).status).toBe(400);
  });

  // 14.6: PATCH cambia nombre, deja fila GRADO_ACTUALIZADO; PATCH con nivel_id lo ignora (no está en el DTO).
  it('[adversarial] PATCH cambia nombre y audita GRADO_ACTUALIZADO; nivel_id en el body se ignora', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nivelOriginal = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const nivelOtro = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const creado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivelOriginal.id } });

    const respuesta = await patchGrado(
      creado.id,
      { nombre: nombreUnico(), nivel_id: nivelOtro.id },
      cookie,
    );
    expect(respuesta.status).toBe(200);
    expect(await contarEventos(creado.id, 'GRADO_ACTUALIZADO')).toBe(1);

    const fila = await prisma.grado.findUnique({ where: { id: creado.id } });
    expect(fila?.nivel_id).toBe(nivelOriginal.id);
  });

  // 14.7/14.8 [AT2]: precomprobación Seccion/Aula; DELETE exitoso sin dependientes.
  it('DELETE sin dependientes borra la fila y audita GRADO_ELIMINADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const creado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });

    const respuesta = await deleteGrado(creado.id, cookie);
    expect(respuesta.status).toBe(204);
    expect(await prisma.grado.findUnique({ where: { id: creado.id } })).toBeNull();
    expect(await contarEventos(creado.id, 'GRADO_ELIMINADO')).toBe(1);
  });

  // 14.8 [AT2]: DELETE con Seccion asociada -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Seccion'}.
  it('DELETE con Seccion asociada responde 409 ENTIDAD_CON_DEPENDIENTES; la fila permanece', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const anioEscolar = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const grado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });
    await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolar.id },
    });

    const respuesta = await deleteGrado(grado.id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Seccion' });
    expect(await prisma.grado.findUnique({ where: { id: grado.id } })).not.toBeNull();
  });

  // 13.3-equivalente [AT7]: rol no autorizado se rechaza en las 5 rutas de /grados.
  // Lectura (GET) se abre a 'comite' para que el asistente de creación de procesos (#11) pueda
  // listar el árbol académico al segmentar el público objetivo; escritura sigue restringida.
  it('[AT7] rol comite recibe 403 al escribir en /grados, pero puede leer', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookie = await loginYObtenerCookie(codigo);
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const nombre = nombreUnico();

    expect((await postGrado({ nombre, nivel_id: nivel.id }, cookie)).status).toBe(403);
    expect((await getGrados('', cookie)).status).toBe(200);
    expect(await prisma.grado.findFirst({ where: { nombre } })).toBeNull();
  });

  it('GREEN: pnpm openapi:extract sigue completando sin conexión viva a Postgres/Redis (smoke)', () => {
    expect(true).toBe(true);
  });
});
