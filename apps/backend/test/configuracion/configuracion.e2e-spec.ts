import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario } from '@prisma/client';
import Redis from 'ioredis';
import nodemailer from 'nodemailer';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';
import { EMAIL_SENDER } from '../../src/email/email-sender';
import type { EmailSender } from '../../src/email/email-sender';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-configuracion';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.pe';

/**
 * configuracion-general, PR2 (design.md "Interfaces / Contracts", tareas 2.5/2.9/2.10). Corre
 * contra Postgres+Redis reales, mismo criterio que `test/academico/anios-escolares.e2e-spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1 de este change, tareas 1.1/1.4, y
 * `anios-escolares.e2e-spec.ts`): en el entorno de ejecución de este `sdd-apply` no hay daemon
 * Docker disponible (`docker ps` falla con "failed to connect to the docker API"), así que esta
 * suite NO pudo correrse hasta GREEN en esta sesión. Queda escrita y type-checkeada
 * (`pnpm typecheck` en verde) contra el contrato real de `ConfiguracionController`/
 * `ConfiguracionService`, lista para CI o un entorno con `docker-compose.test.yml` levantado. La
 * cobertura equivalente de orquestación/validación/auditoría ya está en verde como unit tests en
 * `src/configuracion/configuracion.service.spec.ts` y `src/configuracion/configuracion.errors.spec.ts`.
 */
describe('Configuracion e2e — GET/PUT auditado + listado de comité [2.5][2.9][2.10]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-configuracion-e2e-2026';
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

  async function getConfiguracion(cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/configuracion`, { headers: headersCon(cookie) });
  }

  async function putConfiguracion(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/configuracion`, {
      method: 'PUT',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  async function getComite(cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/configuracion/comite`, { headers: headersCon(cookie) });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-config-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-cfg-${sufijo}`,
        correo: `configuracion-${sufijo}@e2e.local`,
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

  // 2.9: 401 sin cookie en GET/PUT.
  it('[2.9] GET/PUT /configuracion sin cookie responden 401', async () => {
    expect((await getConfiguracion(null)).status).toBe(401);
    expect((await putConfiguracion({ nombre: 'X' }, null)).status).toBe(401);
  });

  // 2.9: 403 con rol no autorizado (comite/docente/estudiante) en GET/PUT.
  it.each(['comite', 'docente', 'estudiante'] as RolUsuario[])(
    '[2.9] GET/PUT /configuracion con rol %s responden 403',
    async (rol) => {
      const { codigo } = await crearUsuarioDirecto({ rol });
      const cookie = await loginYObtenerCookie(codigo);

      expect((await getConfiguracion(cookie)).status).toBe(403);
      expect((await putConfiguracion({ nombre: 'X' }, cookie)).status).toBe(403);
    },
  );

  // 2.9: 200 con administrador/director en GET.
  it.each(['administrador', 'director'] as RolUsuario[])(
    '[2.9] GET /configuracion con rol %s responde 200',
    async (rol) => {
      const { codigo } = await crearUsuarioDirecto({ rol });
      const cookie = await loginYObtenerCookie(codigo);

      const respuesta = await getConfiguracion(cookie);
      expect(respuesta.status).toBe(200);
      const cuerpo = (await respuesta.json()) as { dominios_google: string[] };
      expect(Array.isArray(cuerpo.dominios_google)).toBe(true);
    },
  );

  // 2.5: PUT persiste campos válidos y audita CONFIGURACION_ACTUALIZADA/
  // CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO en la misma transacción (spec "Actualización exitosa
  // se audita").
  it('[2.5] PUT /configuracion actualiza nombre/color/dominios_google y audita ambos eventos', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'director' });
    const cookie = await loginYObtenerCookie(codigo);
    const filaAntes = await prisma.configuracion.findUniqueOrThrow({ where: { clave: 'institucional' } });

    const respuesta = await putConfiguracion(
      { nombre: 'Colegio E2E', color_primario: '#1A2B3C', dominios_google: ['colegio.edu.pe'] },
      cookie,
    );
    expect(respuesta.status).toBe(200);

    const cuerpo = (await respuesta.json()) as { nombre: string; color_primario: string };
    expect(cuerpo.nombre).toBe('Colegio E2E');
    expect(cuerpo.color_primario).toBe('#1A2B3C');

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { entity_type: 'Configuracion', entity_id: filaAntes.id },
    });
    expect(eventos.map((e) => e.event_type)).toEqual(
      expect.arrayContaining(['CONFIGURACION_ACTUALIZADA', 'CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO']),
    );
  });

  // 2.5: zona horaria inválida se rechaza con 4xx y no modifica ningún campo (spec "Zona horaria
  // inválida se rechaza").
  it('[2.5] PUT /configuracion con zona_horaria inválida responde 400 y no modifica la fila', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const antes = await prisma.configuracion.findUniqueOrThrow({ where: { clave: 'institucional' } });

    const respuesta = await putConfiguracion({ zona_horaria: 'No/Existe' }, cookie);
    expect(respuesta.status).toBe(400);

    const despues = await prisma.configuracion.findUniqueOrThrow({ where: { clave: 'institucional' } });
    expect(despues.zona_horaria).toBe(antes.zona_horaria);
  });

  // 2.10: GET /configuracion/comite devuelve solo rol=comite; 403 con rol no autorizado.
  it('[2.10] GET /configuracion/comite devuelve únicamente usuarios con rol comite', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const { usuario: comite } = await crearUsuarioDirecto({ rol: 'comite' });
    await crearUsuarioDirecto({ rol: 'docente' });

    const respuesta = await getComite(cookieAdmin);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as Array<{ id: string; rol: string }>;
    expect(cuerpo.every((u) => u.rol === 'comite')).toBe(true);
    expect(cuerpo.map((u) => u.id)).toContain(comite.id);
  });

  it('[2.10] GET /configuracion/comite con rol docente responde 403', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'docente' });
    const cookie = await loginYObtenerCookie(codigo);

    expect((await getComite(cookie)).status).toBe(403);
  });

  // 4.7 [D3][R2 envio-correo]: actualizar Configuracion.smtp_host vía PUT /configuracion afecta el
  // siguiente envío sin reiniciar el proceso — ConfiguracionEmailSender.send() consulta
  // ConfiguracionLecturaService.smtp() en cada llamada, nunca cacheado desde el arranque.
  it('[4.7] actualizar smtp_host vía PUT /configuracion afecta el próximo envío sin reiniciar el backend', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);

    const createTransportSpy = jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: jest.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof nodemailer.createTransport>);

    const emailSender = app.get<EmailSender>(EMAIL_SENDER);

    const primeraRespuesta = await putConfiguracion(
      {
        smtp_host: 'smtp.viejo.test',
        smtp_puerto: 587,
        smtp_remitente: 'no-responder@viejo.test',
      },
      cookie,
    );
    expect(primeraRespuesta.status).toBe(200);

    await emailSender.send('destinatario@e2e.local', 'Asunto', 'Cuerpo');
    expect(createTransportSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ host: 'smtp.viejo.test' }),
    );

    const segundaRespuesta = await putConfiguracion(
      {
        smtp_host: 'smtp.nuevo.test',
        smtp_puerto: 2525,
        smtp_remitente: 'no-responder@nuevo.test',
      },
      cookie,
    );
    expect(segundaRespuesta.status).toBe(200);

    await emailSender.send('destinatario@e2e.local', 'Asunto', 'Cuerpo');
    expect(createTransportSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ host: 'smtp.nuevo.test' }),
    );

    createTransportSpy.mockRestore();
  });
});

/**
 * configuracion-general, PR3 (design.md "Threat Matrix", tareas 3.4/3.6/3.7). Round-trip real del
 * logo en `bytea` (3.4) y la matriz de rechazo de archivo activo (3.6): SVG con `<script>` se
 * acepta como archivo (allowlist doble) pero `GET /configuracion/logo` responde con la CSP
 * restrictiva verificada en la respuesta (nunca ejecuta el script en el origen); archivo de 0
 * bytes, `>2 MB` y `.exe`/`.gif` se rechazan con `400` antes de persistir.
 *
 * DESVIACIÓN declarada (misma que el resto de este change): sin daemon Docker disponible
 * (`docker ps` sin conexión) en este entorno, esta suite no pudo correrse hasta GREEN en esta
 * sesión. Queda escrita y type-checkeada (`pnpm typecheck` en verde) contra el contrato real de
 * `ConfiguracionController`/`ConfiguracionService`, lista para CI o un entorno con
 * `docker-compose.test.yml` levantado. La cobertura equivalente de orquestación/validación ya está
 * en verde como unit tests en `src/configuracion/configuracion.controller.spec.ts` y
 * `src/configuracion/configuracion.service.spec.ts`.
 */
describe('Configuracion e2e — logo institucional [3.4][3.6][3.7]', () => {
  const prisma = new PrismaClient();
  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-configuracion-logo-e2e-2026';
  let passwordHash: string;
  let sufijoBase: number;
  let contador = 0;

  function extraerCookie(respuesta: Response): string | null {
    const setCookie = respuesta.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? `${COOKIE_NAME}=${match[1]}` : null;
  }

  async function postLoginLocal(codigo: string, password: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, password }),
    });
  }

  async function crearAdministrador(): Promise<{ codigo: string }> {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-config-logo-${sufijo}`;
    await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-cfg-logo-${sufijo}`,
        correo: `configuracion-logo-${sufijo}@e2e.local`,
        nombres: `Usuario Logo E2E ${sufijo}`,
        rol: 'administrador',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    return { codigo };
  }

  async function loginYObtenerCookie(codigo: string): Promise<string> {
    const respuesta = await postLoginLocal(codigo, PASSWORD_CORRECTA);
    expect(respuesta.status).toBe(200);
    return extraerCookie(respuesta) as string;
  }

  async function postLogoLocal(
    contenido: Buffer,
    nombreArchivo: string,
    mimeType: string,
    cookie: string,
  ): Promise<Response> {
    const form = new FormData();
    form.set('logo', new Blob([contenido], { type: mimeType }), nombreArchivo);
    return fetch(`${baseUrl}/api/configuracion/logo`, {
      method: 'POST',
      headers: { cookie },
      body: form,
    });
  }

  async function getLogoLocal(cookie: string): Promise<Response> {
    return fetch(`${baseUrl}/api/configuracion/logo`, { headers: { cookie } });
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
    await prisma.$disconnect();
  });

  // 3.4: round-trip bytea — sube un PNG válido y confirma que logo/logo_mime/logo_actualizado_en
  // quedan persistidos correctamente (spec "Logo válido se acepta y persiste").
  it('[3.4] PNG válido se persiste y GET /configuracion/logo lo devuelve con el Content-Type exacto', async () => {
    const { codigo } = await crearAdministrador();
    const cookie = await loginYObtenerCookie(codigo);
    const contenido = Buffer.from('contenido-png-e2e');

    const subida = await postLogoLocal(contenido, 'logo.png', 'image/png', cookie);
    expect(subida.status).toBe(200);
    const cuerpoSubida = (await subida.json()) as { logo_mime: string; logo_actualizado_en: string };
    expect(cuerpoSubida.logo_mime).toBe('image/png');

    const filaEnDb = await prisma.configuracion.findUniqueOrThrow({ where: { clave: 'institucional' } });
    expect(filaEnDb.logo?.toString('utf-8')).toBe('contenido-png-e2e');
    expect(filaEnDb.logo_mime).toBe('image/png');
    expect(filaEnDb.logo_actualizado_en).not.toBeNull();

    const descarga = await getLogoLocal(cookie);
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get('content-type')).toContain('image/png');
    expect(descarga.headers.get('x-content-type-options')).toBe('nosniff');
    expect(descarga.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'",
    );
  });

  // Threat matrix: SVG con <script>/onload se acepta como archivo (cumple allowlist) pero la
  // respuesta de descarga nunca lo ejecuta — la CSP restrictiva viaja siempre en GET
  // /configuracion/logo, verificada acá en la respuesta HTTP.
  it('[3.6] SVG con <script> se acepta y persiste, pero se sirve con CSP restrictiva (nunca se ejecuta en el origen)', async () => {
    const { codigo } = await crearAdministrador();
    const cookie = await loginYObtenerCookie(codigo);
    const svgMalicioso = Buffer.from('<svg onload="alert(1)"><script>alert(2)</script></svg>');

    const subida = await postLogoLocal(svgMalicioso, 'logo.svg', 'image/svg+xml', cookie);
    expect(subida.status).toBe(200);

    const descarga = await getLogoLocal(cookie);
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get('content-type')).toContain('image/svg+xml');
    expect(descarga.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'",
    );
  });

  // 3.6/3.2: archivo de 0 bytes se rechaza con 400 antes de persistir.
  it('[3.6] archivo de 0 bytes se rechaza con 400', async () => {
    const { codigo } = await crearAdministrador();
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postLogoLocal(Buffer.alloc(0), 'logo.png', 'image/png', cookie);
    expect(respuesta.status).toBe(400);
  });

  // Scenario "Logo que excede el tamaño máximo se rechaza": >2 MB responde 400 (no 413) antes de
  // persistir cualquier campo.
  it('[3.6] archivo >2 MB se rechaza con 400, no 413', async () => {
    const { codigo } = await crearAdministrador();
    const cookie = await loginYObtenerCookie(codigo);
    const archivoGrande = Buffer.alloc(3 * 1024 * 1024, 'a');

    const respuesta = await postLogoLocal(archivoGrande, 'logo.png', 'image/png', cookie);
    expect(respuesta.status).toBe(400);
  });

  // Scenario "Formato de logo no permitido se rechaza": .exe/.gif se rechazan con 400.
  it.each([
    ['logo.exe', 'application/octet-stream'],
    ['logo.gif', 'image/gif'],
  ])('[3.6] extensión no permitida (%s) se rechaza con 400', async (nombreArchivo, mimeType) => {
    const { codigo } = await crearAdministrador();
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postLogoLocal(Buffer.from('contenido'), nombreArchivo, mimeType, cookie);
    expect(respuesta.status).toBe(400);
  });

  // 401/403 en las dos rutas de logo (mismo criterio que 2.9 para GET/PUT /configuracion).
  it('[3.7] POST/GET /configuracion/logo sin cookie responden 401', async () => {
    const respuestaPost = await fetch(`${baseUrl}/api/configuracion/logo`, { method: 'POST' });
    expect(respuestaPost.status).toBe(401);
    expect((await getLogoLocal('')).status).toBe(401);
  });
});
