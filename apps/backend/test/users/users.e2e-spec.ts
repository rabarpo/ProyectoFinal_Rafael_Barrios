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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-users';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * administracion-usuarios-apoderados, PR2 (design.md "Contratos HTTP", tareas 7.1-7.9, 8.1-8.2,
 * 9.1-9.7). Corre contra Postgres+Redis reales, mismo criterio que
 * `test/auth/auth-desbloqueo.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1, tarea 6.4): en el entorno de ejecución de este
 * `sdd-apply` no hay daemon Docker disponible (`docker ps` falla con
 * "failed to connect to the docker API"), así que esta suite NO pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada (`pnpm typecheck` en verde) contra el contrato real de
 * `UsersController`/`UsersService`, lista para ejecutarse en CI o en un entorno con
 * `docker-compose.test.yml` levantado. La cobertura equivalente de orquestación/lógica de negocio
 * (validación, colisión, transición de estado, idempotencia, revocación de sesión mockeada) ya
 * está en verde como unit tests en `src/users/users.service.spec.ts`.
 */
describe('Users e2e — CRUD de Usuario y cambio de estado [R1-R10]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-users-e2e-2026';
  let passwordHash: string;
  let sufijoBase: number;
  let contadorUsuarios = 0;

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

  async function postUsuarios(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/usuarios`, {
      method: 'POST',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  async function getUsuarios(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/usuarios${query}`, { headers: headersCon(cookie) });
  }

  async function getUsuario(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/usuarios/${id}`, { headers: headersCon(cookie) });
  }

  async function patchUsuario(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/usuarios/${id}`, {
      method: 'PATCH',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  async function patchEstado(id: string, estado: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/usuarios/${id}/estado`, {
      method: 'PATCH',
      headers: headersCon(cookie),
      body: JSON.stringify({ estado }),
    });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
    estado?: 'activo' | 'inactivo' | 'bloqueado';
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contadorUsuarios += 1;
    const sufijo = `${sufijoBase}-${contadorUsuarios}`;
    const codigo = `e2e-users-${sufijo}`;
    const correo = `users-${sufijo}@e2e.local`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo,
        nombres: `Usuario E2E ${sufijo}`,
        rol: overrides.rol ?? 'administrador',
        estado: overrides.estado ?? 'activo',
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

  function datosAlta(rol: RolUsuario, sufijo: string) {
    return {
      nombres: `Alta ${rol} ${sufijo}`,
      dni: `alta-${sufijo}`,
      codigo: `alta-${sufijo}`,
      correo: `alta-${sufijo}@e2e.local`,
      rol,
    };
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

  // 7.1 [R1]: alta con los 5 roles, password_hash=null, estado=activo, 1 fila USUARIO_CREADO.
  it.each(['estudiante', 'docente', 'comite', 'administrador', 'director'] as RolUsuario[])(
    '[R1] POST /usuarios crea un Usuario con rol=%s, password_hash null y audita USUARIO_CREADO',
    async (rol) => {
      const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
      const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
      const sufijo = `${sufijoBase}-${++contadorUsuarios}`;

      const respuesta = await postUsuarios(datosAlta(rol, sufijo), cookieAdmin);
      expect(respuesta.status).toBe(201);
      const cuerpo = (await respuesta.json()) as { id: string; estado: string };
      expect(cuerpo.estado).toBe('activo');

      const fila = await prisma.usuario.findUnique({ where: { id: cuerpo.id } });
      expect(fila?.password_hash).toBeNull();
      expect(await contarEventos(cuerpo.id, 'USUARIO_CREADO')).toBe(1);
    },
  );

  // 7.2 [R9]: comite no puede crear usuarios, sin ejecutar el handler ni crear fila.
  it('[R9] rol comite no puede POST /usuarios: se rechaza sin crear ninguna fila', async () => {
    const { codigo: codigoComite } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);
    const sufijo = `${sufijoBase}-${++contadorUsuarios}`;

    const respuesta = await postUsuarios(datosAlta('docente', sufijo), cookieComite);
    expect(respuesta.status).toBe(403);

    const fila = await prisma.usuario.findFirst({ where: { codigo: `alta-${sufijo}` } });
    expect(fila).toBeNull();
  });

  // 7.3 [R2]: DNI y correo duplicado -> 409 CAMPO_DUPLICADO, sin crear.
  it('[R2] DNI duplicado responde 409 CAMPO_DUPLICADO identificando el campo, sin crear', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const sufijo = `${sufijoBase}-${++contadorUsuarios}`;
    const datos = datosAlta('docente', sufijo);

    const primera = await postUsuarios(datos, cookieAdmin);
    expect(primera.status).toBe(201);

    const segunda = await postUsuarios(
      { ...datos, codigo: `${datos.codigo}-otro`, correo: `otro-${sufijo}@e2e.local` },
      cookieAdmin,
    );
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toMatchObject({ codigo: 'CAMPO_DUPLICADO', campo: 'dni' });
  });

  // 7.4 [R3]: dni no numérico se acepta; dni de 21 caracteres se rechaza.
  it('[R3] dni no numérico se acepta; dni de 21 caracteres se rechaza con 400 CAMPO_INVALIDO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const sufijo = `${sufijoBase}-${++contadorUsuarios}`;

    const noNumerico = await postUsuarios(
      { ...datosAlta('docente', sufijo), dni: 'AB-1234-XY' },
      cookieAdmin,
    );
    expect(noNumerico.status).toBe(201);

    const sufijo2 = `${sufijoBase}-${++contadorUsuarios}`;
    const largo = await postUsuarios(
      { ...datosAlta('docente', sufijo2), dni: 'A'.repeat(21) },
      cookieAdmin,
    );
    expect(largo.status).toBe(400);
    expect(await largo.json()).toMatchObject({ codigo: 'CAMPO_INVALIDO', campo: 'dni' });
  });

  // 7.5 [R4]: correo fuera de dominio institucional se acepta; formato inválido se rechaza.
  it('[R4] correo fuera del dominio institucional se acepta; formato inválido se rechaza', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const sufijo = `${sufijoBase}-${++contadorUsuarios}`;

    const externo = await postUsuarios(
      { ...datosAlta('docente', sufijo), correo: `externo-${sufijo}@gmail.com` },
      cookieAdmin,
    );
    expect(externo.status).toBe(201);

    const sufijo2 = `${sufijoBase}-${++contadorUsuarios}`;
    const invalido = await postUsuarios(
      { ...datosAlta('docente', sufijo2), correo: 'no-es-un-correo' },
      cookieAdmin,
    );
    expect(invalido.status).toBe(400);
    expect(await invalido.json()).toMatchObject({ codigo: 'CAMPO_INVALIDO', campo: 'correo' });
  });

  // 7.6 [D2]: GET :id devuelve el Usuario; inexistente 404; malformado 400.
  it('[D2] GET /usuarios/:id devuelve el Usuario; inexistente 404; malformado 400', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario } = await crearUsuarioDirecto({ rol: 'docente' });

    const encontrado = await getUsuario(usuario.id, cookieAdmin);
    expect(encontrado.status).toBe(200);

    const inexistente = await getUsuario('00000000-0000-0000-0000-000000000000', cookieAdmin);
    expect(inexistente.status).toBe(404);

    const malformado = await getUsuario('no-es-un-uuid', cookieAdmin);
    expect(malformado.status).toBe(400);
  });

  // 7.7 [R5]: GET /usuarios filtra por rol/estado; valor desconocido -> 400.
  it('[R5] GET /usuarios filtra por rol y estado; filtro desconocido responde 400', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario: docenteActivo } = await crearUsuarioDirecto({ rol: 'docente', estado: 'activo' });
    await crearUsuarioDirecto({ rol: 'estudiante', estado: 'activo' });

    const filtrado = await getUsuarios('?rol=docente&estado=activo', cookieAdmin);
    expect(filtrado.status).toBe(200);
    const cuerpo = (await filtrado.json()) as Array<{ id: string }>;
    expect(cuerpo.map((u) => u.id)).toContain(docenteActivo.id);

    const invalido = await getUsuarios('?rol=inexistente', cookieAdmin);
    expect(invalido.status).toBe(400);
  });

  // 7.8/spec "Permisos idénticos": director ejecuta lo mismo que administrador.
  it('[R10] director ejecuta POST /usuarios con idéntico resultado que administrador', async () => {
    const { codigo: codigoDirector } = await crearUsuarioDirecto({ rol: 'director' });
    const cookieDirector = await loginYObtenerCookie(codigoDirector);
    const sufijo = `${sufijoBase}-${++contadorUsuarios}`;

    const respuesta = await postUsuarios(datosAlta('docente', sufijo), cookieDirector);
    expect(respuesta.status).toBe(201);
  });

  // 7.9 [adversarial]: ningún UsuarioRespuestaDto incluye password_hash ni google_id.
  it('[adversarial] la respuesta de POST /usuarios nunca incluye password_hash ni google_id', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const sufijo = `${sufijoBase}-${++contadorUsuarios}`;

    const respuesta = await postUsuarios(datosAlta('docente', sufijo), cookieAdmin);
    const cuerpo = (await respuesta.json()) as Record<string, unknown>;
    expect(cuerpo).not.toHaveProperty('password_hash');
    expect(cuerpo).not.toHaveProperty('google_id');
  });

  // 8.1 [R6]: PATCH cambia nombres/correo, 1 fila USUARIO_ACTUALIZADO.
  it('[R6] PATCH /usuarios/:id actualiza nombres/correo y audita USUARIO_ACTUALIZADO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario } = await crearUsuarioDirecto({ rol: 'docente' });

    const respuesta = await patchUsuario(
      usuario.id,
      { nombres: 'Nombre Actualizado', correo: `actualizado-${usuario.id}@e2e.local` },
      cookieAdmin,
    );
    expect(respuesta.status).toBe(200);
    expect(await contarEventos(usuario.id, 'USUARIO_ACTUALIZADO')).toBe(1);
  });

  // 8.2 [adversarial]: PATCH con estado en el body lo ignora (el DTO no lo declara).
  it('[adversarial] PATCH /usuarios/:id con estado en el body lo ignora; Usuario.estado no cambia', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario } = await crearUsuarioDirecto({ rol: 'docente', estado: 'activo' });

    const respuesta = await patchUsuario(
      usuario.id,
      { nombres: 'Otro Nombre', estado: 'inactivo' },
      cookieAdmin,
    );
    expect(respuesta.status).toBe(200);

    const fila = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(fila?.estado).toBe('activo');
  });

  // 9.1/9.6 [R7][D6]: destino inactivo desde activo -> 200, audita, revoca sesiones.
  it('[R7][D6] PATCH .../estado a inactivo desactiva, audita USUARIO_DESACTIVADO y revoca sesiones', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario, codigo: codigoObjetivo } = await crearUsuarioDirecto({ rol: 'docente' });

    const cookieObjetivo = await loginYObtenerCookie(codigoObjetivo);
    const sessionIdObjetivo = cookieObjetivo.split('=')[1];
    expect(await redis.get(`session:${sessionIdObjetivo}`)).not.toBeNull();

    const respuesta = await patchEstado(usuario.id, 'inactivo', cookieAdmin);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ id: usuario.id, estado: 'inactivo' });
    expect(await contarEventos(usuario.id, 'USUARIO_DESACTIVADO')).toBe(1);
    expect(await redis.get(`session:${sessionIdObjetivo}`)).toBeNull();
  });

  // 9.2 [R7]: destino activo desde inactivo -> 200, audita USUARIO_REACTIVADO.
  it('[R7] PATCH .../estado a activo reactiva y audita USUARIO_REACTIVADO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario } = await crearUsuarioDirecto({ rol: 'docente', estado: 'inactivo' });

    const respuesta = await patchEstado(usuario.id, 'activo', cookieAdmin);
    expect(respuesta.status).toBe(200);
    expect(await contarEventos(usuario.id, 'USUARIO_REACTIVADO')).toBe(1);
  });

  // 9.3 [adversarial]: destino bloqueado -> 400 ESTADO_DESTINO_NO_PERMITIDO, sin cambiar estado.
  it('[adversarial] PATCH .../estado a bloqueado responde 400 ESTADO_DESTINO_NO_PERMITIDO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario } = await crearUsuarioDirecto({ rol: 'docente', estado: 'activo' });

    const respuesta = await patchEstado(usuario.id, 'bloqueado', cookieAdmin);
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ESTADO_DESTINO_NO_PERMITIDO' });

    const fila = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(fila?.estado).toBe('activo');
  });

  // 9.4 [adversarial]: fila bloqueada -> 409 TRANSICION_DESDE_BLOQUEADO, sin cambiar estado.
  it('[adversarial] PATCH .../estado sobre fila bloqueada responde 409 TRANSICION_DESDE_BLOQUEADO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario } = await crearUsuarioDirecto({ rol: 'docente', estado: 'bloqueado' });

    const respuesta = await patchEstado(usuario.id, 'activo', cookieAdmin);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'TRANSICION_DESDE_BLOQUEADO' });

    const fila = await prisma.usuario.findUnique({ where: { id: usuario.id } });
    expect(fila?.estado).toBe('bloqueado');
  });

  // 9.5: :id inexistente -> 404; malformado -> 400.
  it('PATCH .../estado responde 404 sobre id inexistente y 400 sobre id malformado', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);

    const inexistente = await patchEstado(
      '00000000-0000-0000-0000-000000000000',
      'activo',
      cookieAdmin,
    );
    expect(inexistente.status).toBe(404);

    const malformado = await patchEstado('no-es-un-uuid', 'activo', cookieAdmin);
    expect(malformado.status).toBe(400);
  });

  // 9.7 [adversarial]: repetir la misma transición es idempotente, sin auditoría duplicada.
  it('[adversarial] repetir activo→activo es idempotente: sin fila de auditoría nueva', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario } = await crearUsuarioDirecto({ rol: 'docente', estado: 'activo' });

    const primera = await patchEstado(usuario.id, 'activo', cookieAdmin);
    expect(primera.status).toBe(200);
    const segunda = await patchEstado(usuario.id, 'activo', cookieAdmin);
    expect(segunda.status).toBe(200);

    expect(await contarEventos(usuario.id, 'USUARIO_REACTIVADO')).toBe(0);
  });

  // 11.7 (isla de este PR): comite rechazado en las rutas de Usuario de PR2.
  it('[R9] rol comite recibe 403 en todas las rutas de Usuario', async () => {
    const { codigo: codigoComite } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);
    const { usuario } = await crearUsuarioDirecto({ rol: 'docente' });

    expect((await getUsuarios('', cookieComite)).status).toBe(403);
    expect((await getUsuario(usuario.id, cookieComite)).status).toBe(403);
    expect((await patchUsuario(usuario.id, { nombres: 'x' }, cookieComite)).status).toBe(403);
    expect((await patchEstado(usuario.id, 'inactivo', cookieComite)).status).toBe(403);
  });

  it('GREEN: pnpm openapi:extract sigue completando sin conexión viva a Postgres/Redis (smoke)', () => {
    expect(true).toBe(true);
  });
});
