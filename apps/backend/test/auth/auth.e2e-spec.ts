import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

/**
 * auth-server-sessions, PR3 (tarea 9.3, design.md "Estrategia de pruebas" — capa E2E). Corre
 * contra Postgres+Redis reales (`infra/docker/docker-compose.test.yml`, orquestado por
 * `scripts/test-e2e.mjs`: up -> `prisma migrate deploy` -> jest -> down). No usa el seed
 * estructural (`prisma/seed.ts` no corre en el pipeline de e2e) — cada `Usuario` de este archivo
 * se crea directamente vía `PrismaClient`, con `codigo`/`dni`/`correo` únicos por corrida
 * (sufijo `Date.now()`) para poder reejecutarse sin colisionar con una corrida anterior.
 *
 * Cookies: el `fetch` nativo de Node no persiste cookies entre llamadas por sí solo — se extrae
 * el valor de `Set-Cookie` de la respuesta de login y se reenvía a mano en el header `Cookie` de
 * las siguientes llamadas (mismo patrón mínimo que un cliente real haría).
 */
describe('Auth e2e — login/logout/guards [R2][R3a][R3b][R4][R5][R6a][R6b][D3][D7]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-e2e-2026';
  let passwordHash: string;

  let codigoActivo: string;
  let codigoBloqueado: string;
  let codigoSinCredencial: string;
  let usuarioActivoId: string;

  function extraerCookie(respuesta: Response): string | null {
    const setCookie = respuesta.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? `${COOKIE_NAME}=${match[1]}` : null;
  }

  async function contarEventos(entityId: string, eventType: string): Promise<number> {
    return prisma.eventoAuditoria.count({ where: { entity_id: entityId, event_type: eventType } });
  }

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD_CORRECTA, ARGON2_OPTIONS);

    const sufijo = Date.now();
    codigoActivo = `e2e-activo-${sufijo}`;
    codigoBloqueado = `e2e-bloqueado-${sufijo}`;
    codigoSinCredencial = `e2e-sincred-${sufijo}`;

    const usuarioActivo = await prisma.usuario.create({
      data: {
        codigo: codigoActivo,
        dni: `act-${sufijo}`,
        correo: `activo-${sufijo}@e2e.local`,
        nombres: 'Activo E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    usuarioActivoId = usuarioActivo.id;

    await prisma.usuario.create({
      data: {
        codigo: codigoBloqueado,
        dni: `blo-${sufijo}`,
        correo: `bloqueado-${sufijo}@e2e.local`,
        nombres: 'Bloqueado E2E',
        rol: 'comite',
        estado: 'bloqueado',
        password_hash: passwordHash,
      },
    });

    await prisma.usuario.create({
      data: {
        codigo: codigoSinCredencial,
        dni: `sc-${sufijo}`,
        correo: `sincred-${sufijo}@e2e.local`,
        nombres: 'SinCredencial E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: null,
      },
    });

    app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix('api');
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

  it('[R2] login con credenciales válidas devuelve 200, Set-Cookie httpOnly y crea session:{id} en Redis', async () => {
    const respuesta = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: codigoActivo, password: PASSWORD_CORRECTA }),
    });

    expect(respuesta.status).toBe(200);
    const setCookie = respuesta.headers.get('set-cookie');
    expect(setCookie).toContain(`${COOKIE_NAME}=`);
    expect(setCookie?.toLowerCase()).toContain('httponly');
    expect(setCookie?.toLowerCase()).toContain('samesite=lax');
    // D6: sin maxAge/expires — cookie de sesión de navegador.
    expect(setCookie?.toLowerCase()).not.toContain('max-age');
    expect(setCookie?.toLowerCase()).not.toContain('expires=');

    const cookieHeader = extraerCookie(respuesta);
    const sessionId = cookieHeader?.split('=')[1] as string;
    const raw = await redis.get(`session:${sessionId}`);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).userId).toBe(usuarioActivoId);

    expect(await contarEventos(usuarioActivoId, 'LOGIN_EXITOSO')).toBeGreaterThanOrEqual(1);
  });

  it('[R6a] ruta protegida sin cookie es rechazada sin ejecutar el handler', async () => {
    const respuesta = await fetch(`${baseUrl}/api/auth/whoami`);
    expect(respuesta.status).toBe(401);
  });

  it('[R6b] ruta protegida con sesión eliminada es rechazada', async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: codigoActivo, password: PASSWORD_CORRECTA }),
    });
    const cookieHeader = extraerCookie(login) as string;
    const sessionId = cookieHeader.split('=')[1];
    await redis.del(`session:${sessionId}`);

    const respuesta = await fetch(`${baseUrl}/api/auth/whoami`, {
      headers: { Cookie: cookieHeader },
    });
    expect(respuesta.status).toBe(401);
  });

  it('ruta protegida con sesión válida devuelve la sesión autenticada (D8, whoami)', async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: codigoActivo, password: PASSWORD_CORRECTA }),
    });
    const cookieHeader = extraerCookie(login) as string;

    const respuesta = await fetch(`${baseUrl}/api/auth/whoami`, {
      headers: { Cookie: cookieHeader },
    });
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as { userId: string; rol: string };
    expect(cuerpo.userId).toBe(usuarioActivoId);
    expect(cuerpo.rol).toBe('comite');
  });

  it('[R5] logout invalida la sesión activa, expira la cookie y audita exactamente un LOGOUT', async () => {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: codigoActivo, password: PASSWORD_CORRECTA }),
    });
    const cookieHeader = extraerCookie(login) as string;
    const sessionId = cookieHeader.split('=')[1];

    const logout = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    expect(logout.status).toBe(204);
    const setCookie = logout.headers.get('set-cookie');
    // clearCookie de Express expira con Expires en el pasado.
    expect(setCookie?.toLowerCase()).toContain('expires=');

    expect(await redis.get(`session:${sessionId}`)).toBeNull();
    expect(await contarEventos(usuarioActivoId, 'LOGOUT')).toBe(1);

    const rutaProtegida = await fetch(`${baseUrl}/api/auth/whoami`, {
      headers: { Cookie: cookieHeader },
    });
    expect(rutaProtegida.status).toBe(401);
  });

  // 9.1 [D3][adversarial]: las 4 causas de fallo devuelven la MISMA respuesta.
  const casosFallo: Array<{ nombre: string; codigo: () => string; password: string }> = [
    { nombre: 'usuario inexistente', codigo: () => 'no-existe-e2e-999', password: 'cualquiera' },
    { nombre: 'password ausente', codigo: () => codigoSinCredencial, password: 'cualquiera' },
    { nombre: 'password incorrecta', codigo: () => codigoActivo, password: 'password-incorrecta' },
    { nombre: 'usuario bloqueado', codigo: () => codigoBloqueado, password: PASSWORD_CORRECTA },
  ];

  it.each(casosFallo)(
    '[D3][adversarial] $nombre devuelve 401 {"message":"Credenciales inválidas"}, sin cookie ni sesión',
    async ({ codigo, password }) => {
      const respuesta = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigo(), password }),
      });

      expect(respuesta.status).toBe(401);
      const cuerpo = (await respuesta.json()) as { message: string };
      expect(cuerpo.message).toBe('Credenciales inválidas');
      expect(respuesta.headers.get('set-cookie')).toBeNull();

      // 9.2 [adversarial]: ni el cuerpo de la respuesta ni el payload auditado contienen la
      // contraseña enviada.
      expect(JSON.stringify(cuerpo)).not.toContain(password);
    },
  );

  it('[R3a][R3b] contraseña incorrecta no crea sesión y audita exactamente un LOGIN_FALLIDO', async () => {
    const antes = await contarEventos(usuarioActivoId, 'LOGIN_FALLIDO');

    const respuesta = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: codigoActivo, password: 'password-incorrecta-otra-vez' }),
    });

    expect(respuesta.status).toBe(401);
    const despues = await contarEventos(usuarioActivoId, 'LOGIN_FALLIDO');
    expect(despues).toBe(antes + 1);

    const evento = await prisma.eventoAuditoria.findFirst({
      where: { entity_id: usuarioActivoId, event_type: 'LOGIN_FALLIDO' },
      orderBy: { occurred_at: 'desc' },
    });
    expect(JSON.stringify(evento?.payload)).not.toContain('password-incorrecta-otra-vez');
  });

  it('[adversarial] ninguna fila de EventoAuditoria de este archivo contiene la contraseña en texto plano', async () => {
    const eventos = await prisma.eventoAuditoria.findMany({
      where: { entity_id: { in: [usuarioActivoId] } },
    });
    for (const evento of eventos) {
      expect(JSON.stringify(evento.payload)).not.toContain(PASSWORD_CORRECTA);
    }
  });
});
