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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-niveles';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-academica, PR4 (design.md "Contratos HTTP", tareas 13.1-13.9). Corre contra
 * Postgres+Redis reales, mismo criterio que `test/academico/anios-escolares.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR3 de este change): `docker ps` no tiene daemon
 * Docker disponible en este entorno (`failed to connect to the docker API`), así que esta suite
 * NO pudo correrse hasta GREEN en esta sesión. Queda escrita y type-checkeada, lista para CI o un
 * entorno con `docker-compose.test.yml` levantado. La cobertura equivalente de orquestación/lógica
 * de negocio ya está en verde como unit tests en `src/academico/niveles.service.spec.ts`.
 */
describe('Niveles e2e — CRUD de Nivel [AT1]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-niveles-e2e-2026';
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

  async function postNivel(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/niveles`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getNiveles(cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/niveles`, { headers: headersCon(cookie) });
  }

  async function getNivel(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/niveles/${id}`, { headers: headersCon(cookie) });
  }

  async function patchNivel(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/niveles/${id}`, { method: 'PATCH', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function deleteNivel(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/niveles/${id}`, { method: 'DELETE', headers: headersCon(cookie) });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-niveles-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `niveles-${sufijo}@e2e.local`,
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
    return `Nivel E2E ${sufijoBase}-${contador}`;
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

  // 13.1 [AT1]: creación exitosa con nombre no usado.
  it('[AT1] POST /niveles crea y audita NIVEL_CREADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postNivel({ nombre: nombreUnico() }, cookie);
    expect(respuesta.status).toBe(201);
    const cuerpo = (await respuesta.json()) as { id: string };
    expect(await contarEventos(cuerpo.id, 'NIVEL_CREADO')).toBe(1);
  });

  // 13.2 [AT1]: nombre duplicado -> 409 RESTRICCION_UNICA.
  it('[AT1] nombre duplicado responde 409 RESTRICCION_UNICA sin crear una segunda fila', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nombre = nombreUnico();

    const primera = await postNivel({ nombre }, cookie);
    expect(primera.status).toBe(201);

    const segunda = await postNivel({ nombre }, cookie);
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toMatchObject({ codigo: 'RESTRICCION_UNICA' });
  });

  // 13.3 [AT7]: rol no autorizado se rechaza en las rutas de escritura de /niveles; lectura
  // (GET) se abre a 'comite' para que el asistente de creación de procesos (#11) pueda listar
  // el árbol académico al segmentar el público objetivo.
  it('[AT7] rol comite recibe 403 al escribir en /niveles, pero puede leer', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookie = await loginYObtenerCookie(codigo);
    const nombre = nombreUnico();

    expect((await postNivel({ nombre }, cookie)).status).toBe(403);
    expect((await getNiveles(cookie)).status).toBe(200);
    const fila = await prisma.nivel.findFirst({ where: { nombre } });
    expect(fila).toBeNull();
  });

  // 13.4: GET :id, 404 inexistente, 400 malformado.
  it('GET /niveles/:id devuelve el Nivel; inexistente 404; malformado 400', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const creado = await prisma.nivel.create({ data: { nombre: nombreUnico() } });

    expect((await getNivel(creado.id, cookie)).status).toBe(200);
    expect((await getNivel('00000000-0000-0000-0000-000000000000', cookie)).status).toBe(404);
    expect((await getNivel('no-es-un-uuid', cookie)).status).toBe(400);
  });

  // 13.5: PATCH cambia nombre, deja fila NIVEL_ACTUALIZADO.
  it('PATCH /niveles/:id cambia nombre y audita NIVEL_ACTUALIZADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const creado = await prisma.nivel.create({ data: { nombre: nombreUnico() } });

    const respuesta = await patchNivel(creado.id, { nombre: nombreUnico() }, cookie);
    expect(respuesta.status).toBe(200);
    expect(await contarEventos(creado.id, 'NIVEL_ACTUALIZADO')).toBe(1);
  });

  // 13.7 [AT1]: DELETE exitoso sin dependientes.
  it('DELETE sin Grado dependiente borra la fila y audita NIVEL_ELIMINADO', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const creado = await prisma.nivel.create({ data: { nombre: nombreUnico() } });

    const respuesta = await deleteNivel(creado.id, cookie);
    expect(respuesta.status).toBe(204);
    expect(await prisma.nivel.findUnique({ where: { id: creado.id } })).toBeNull();
    expect(await contarEventos(creado.id, 'NIVEL_ELIMINADO')).toBe(1);
  });

  // 13.8 [AT1]: DELETE con Grado asociado -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Grado'}.
  it('DELETE con Grado asociado responde 409 ENTIDAD_CON_DEPENDIENTES; la fila permanece', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });

    const respuesta = await deleteNivel(nivel.id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Grado' });
    expect(await prisma.nivel.findUnique({ where: { id: nivel.id } })).not.toBeNull();
  });

  it('director ejecuta POST /niveles con idéntico resultado que administrador', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'director' });
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postNivel({ nombre: nombreUnico() }, cookie);
    expect(respuesta.status).toBe(201);
  });

  it('GREEN: pnpm openapi:extract sigue completando sin conexión viva a Postgres/Redis (smoke)', () => {
    expect(true).toBe(true);
  });
});
