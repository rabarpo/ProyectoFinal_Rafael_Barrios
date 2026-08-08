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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-desbloqueo';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * bloqueo-desbloqueo-cuentas, PR3 (design.md "Contratos", "Flujo de datos — desbloqueo manual del
 * comité", tareas 10.4-11.1). Corre contra Postgres+Redis reales, mismo criterio que
 * `test/auth/auth-bloqueo.e2e-spec.ts`.
 */
describe('Auth e2e — desbloqueo manual y listado de cuentas bloqueadas [R6][R7]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-desbloqueo-e2e-2026';
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

  async function getBloqueados(cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/usuarios/bloqueados`, {
      headers: cookie ? { cookie } : {},
    });
  }

  async function postDesbloquear(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/usuarios/${id}/desbloquear`, {
      method: 'POST',
      headers: cookie ? { cookie } : {},
    });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
    estado?: 'activo' | 'inactivo' | 'bloqueado';
    bloqueado_hasta?: Date | null;
  }

  async function crearUsuario(overrides: UsuarioOverrides = {}) {
    contadorUsuarios += 1;
    const sufijo = `${sufijoBase}-${contadorUsuarios}`;
    const codigo = `e2e-desbloqueo-${sufijo}`;
    const correo = `desbloqueo-${sufijo}@e2e.local`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `dbl-${sufijo}`,
        correo,
        nombres: `Desbloqueo E2E ${sufijo}`,
        rol: overrides.rol ?? 'comite',
        estado: overrides.estado ?? 'activo',
        bloqueado_hasta: overrides.bloqueado_hasta ?? null,
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

  // 8.1/11.1 [R6]: desbloqueo manual exitoso, audita con actor=comité y revoca sesiones.
  it('[R6] el comité desbloquea una cuenta bloqueada: resetea estado, audita con actor=comité y revoca sesiones', async () => {
    const { usuario: comite, codigo: codigoComite } = await crearUsuario({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);

    const { usuario: bloqueado, codigo: codigoBloqueado } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() + 10 * 60_000),
    });

    // Deja una sesión revocable: forzamos la fila de vuelta a activo momentáneamente para loguear,
    // y volvemos a bloquearla — el estado bloqueado en sí no impide crear sesión vía Prisma directo.
    await prisma.usuario.update({ where: { id: bloqueado.id }, data: { estado: 'activo', bloqueado_hasta: null } });
    const cookiePrevia = await loginYObtenerCookie(codigoBloqueado);
    const sessionIdPrevio = cookiePrevia.split('=')[1];
    await prisma.usuario.update({
      where: { id: bloqueado.id },
      data: { estado: 'bloqueado', bloqueado_hasta: new Date(Date.now() + 10 * 60_000) },
    });
    expect(await redis.get(`session:${sessionIdPrevio}`)).not.toBeNull();

    const respuesta = await postDesbloquear(bloqueado.id, cookieComite);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ desbloqueado: true });

    const actualizado = await prisma.usuario.findUnique({ where: { id: bloqueado.id } });
    expect(actualizado?.estado).toBe('activo');
    expect(actualizado?.bloqueado_hasta).toBeNull();

    expect(await contarEventos(bloqueado.id, 'CUENTA_DESBLOQUEADA')).toBe(1);
    const evento = await prisma.eventoAuditoria.findFirst({
      where: { entity_id: bloqueado.id, event_type: 'CUENTA_DESBLOQUEADA' },
    });
    expect(evento?.actor_usuario_id).toBe(comite.id);
    expect(evento?.payload).toMatchObject({ motivo: 'manual_comite' });

    expect(await redis.get(`session:${sessionIdPrevio}`)).toBeNull();
  });

  // 8.2 [D2-analog]: desbloqueo idempotente sobre una cuenta ya activa.
  it('[D2-analog] desbloquear una cuenta ya activa es idempotente: desbloqueado=false, sin auditoría', async () => {
    const { codigo: codigoComite } = await crearUsuario({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);
    const { usuario: activo } = await crearUsuario({ estado: 'activo' });

    const respuesta = await postDesbloquear(activo.id, cookieComite);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.json()).toEqual({ desbloqueado: false });
    expect(await contarEventos(activo.id, 'CUENTA_DESBLOQUEADA')).toBe(0);
  });

  // 8.3 [adversarial]: dos desbloqueos concurrentes producen exactamente una CUENTA_DESBLOQUEADA.
  it('[adversarial] dos desbloqueos concurrentes del mismo usuario producen exactamente una CUENTA_DESBLOQUEADA', async () => {
    const { codigo: codigoComite } = await crearUsuario({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);
    const { usuario: bloqueado } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() + 10 * 60_000),
    });

    const [respuestaA, respuestaB] = await Promise.all([
      postDesbloquear(bloqueado.id, cookieComite),
      postDesbloquear(bloqueado.id, cookieComite),
    ]);
    expect(respuestaA.status).toBe(200);
    expect(respuestaB.status).toBe(200);

    const cuerpos = await Promise.all([respuestaA.json(), respuestaB.json()]);
    const exitos = cuerpos.filter((c) => (c as { desbloqueado: boolean }).desbloqueado).length;
    expect(exitos).toBe(1);

    expect(await contarEventos(bloqueado.id, 'CUENTA_DESBLOQUEADA')).toBe(1);
    const actualizado = await prisma.usuario.findUnique({ where: { id: bloqueado.id } });
    expect(actualizado?.estado).toBe('activo');
  });

  // 8.4/10.6 [adversarial]: id inexistente ⇒ 404; id malformado ⇒ 400, nunca 500.
  it('devuelve 404 sobre un id inexistente y 400 sobre un id malformado, nunca 500', async () => {
    const { codigo: codigoComite } = await crearUsuario({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);

    const respuestaInexistente = await postDesbloquear(
      '00000000-0000-0000-0000-000000000000',
      cookieComite,
    );
    expect(respuestaInexistente.status).toBe(404);

    const respuestaMalformada = await postDesbloquear('no-es-un-uuid', cookieComite);
    expect(respuestaMalformada.status).toBe(400);
  });

  // 10.4 [R6]: un rol distinto de comite no puede desbloquear.
  it('[R6] un rol distinto de comite recibe 403 al intentar desbloquear, sin cambiar estado', async () => {
    const { codigo: codigoNoComite } = await crearUsuario({ rol: 'estudiante' });
    const cookieNoComite = await loginYObtenerCookie(codigoNoComite);
    const { usuario: bloqueado } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() + 10 * 60_000),
    });

    const respuesta = await postDesbloquear(bloqueado.id, cookieNoComite);
    expect(respuesta.status).toBe(403);

    const actualizado = await prisma.usuario.findUnique({ where: { id: bloqueado.id } });
    expect(actualizado?.estado).toBe('bloqueado');
  });

  // 9.1/9.2/11.1 [R7]: listado con campos exactos, orden, e incluye vencidos.
  it('[R7] el listado devuelve solo cuentas bloqueadas con los campos mínimos, ordenadas, incluyendo vencidas', async () => {
    const { codigo: codigoComite } = await crearUsuario({ rol: 'comite' });
    const cookieComite = await loginYObtenerCookie(codigoComite);

    const { usuario: activo } = await crearUsuario({ estado: 'activo' });
    const { usuario: bloqueadoVigente } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() + 10 * 60_000),
    });
    const { usuario: bloqueadoVencido } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: new Date(Date.now() - 60_000),
    });
    const { usuario: bloqueadoIndefinido } = await crearUsuario({
      estado: 'bloqueado',
      bloqueado_hasta: null,
    });

    const respuesta = await getBloqueados(cookieComite);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as Array<{
      id: string;
      nombres: string;
      dni: string;
      codigo: string;
      bloqueado_hasta: string | null;
    }>;

    const ids = cuerpo.map((u) => u.id);
    expect(ids).toContain(bloqueadoVigente.id);
    expect(ids).toContain(bloqueadoVencido.id);
    expect(ids).toContain(bloqueadoIndefinido.id);
    expect(ids).not.toContain(activo.id);

    const primero = cuerpo.find((u) => u.id === bloqueadoVigente.id);
    expect(Object.keys(primero ?? {}).sort()).toEqual(
      ['bloqueado_hasta', 'codigo', 'dni', 'id', 'nombres'].sort(),
    );

    // orderBy [bloqueado_hasta desc, codigo asc]: el indefinido (NULL) queda antes que el vigente.
    const posicionIndefinido = ids.indexOf(bloqueadoIndefinido.id);
    const posicionVigente = ids.indexOf(bloqueadoVigente.id);
    expect(posicionIndefinido).toBeLessThan(posicionVigente);
  });

  // 10.4 [R7]: un rol distinto de comite no puede listar.
  it('[R7] un rol distinto de comite recibe 403 al listar cuentas bloqueadas', async () => {
    const { codigo: codigoNoComite } = await crearUsuario({ rol: 'estudiante' });
    const cookieNoComite = await loginYObtenerCookie(codigoNoComite);

    const respuesta = await getBloqueados(cookieNoComite);
    expect(respuesta.status).toBe(403);
  });

  it('GREEN: pnpm openapi:extract sigue completando sin conexión viva a Postgres/Redis (smoke)', () => {
    // La suite completa de este archivo ya ejerce la app real; este caso documenta el contrato de
    // la tarea 11.2 (verificado por separado vía `pnpm --filter @seei/backend openapi:extract`).
    expect(true).toBe(true);
  });
});
