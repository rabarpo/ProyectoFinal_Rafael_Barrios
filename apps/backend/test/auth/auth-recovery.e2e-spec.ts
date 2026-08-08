import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { EMAIL_SENDER, type EmailSender } from '../../src/email/email-sender';

const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

/**
 * google-oauth-y-recuperacion, PR3 (design.md D4/D5/D6/D7, tareas 11.1-12.3). E2E completo del
 * flujo de recuperación sobre Postgres+Redis reales, con `EMAIL_SENDER` sustituido por un stub en
 * memoria (`overrideProvider`) que guarda los correos enviados para extraer el token del enlace —
 * sin SMTP real. Cubre anti-enumeración (correo existente/inexistente responden igual), consumo
 * de un solo uso, primera contraseña de cuenta solo-OAuth, revocación de sesiones y una fila de
 * auditoría por camino.
 */
describe('Auth e2e — Recovery flow [R6][R7][R8][R9][D4][D5][D6][D7]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;
  let correosEnviados: Array<{ destinatario: string; asunto: string; cuerpo: string }>;

  const PASSWORD_VIEJA = 'clave-recovery-e2e-vieja-2026';
  let passwordHashVieja: string;

  // El cooldown de 60s de D5 opera por usuario: cada escenario que llama solicitar() usa su propio
  // Usuario para no chocar entre tests dentro de la misma corrida.
  let usuarioParaSolicitudId: string;
  let usuarioParaSolicitudCorreo: string;
  let usuarioParaConfirmacionId: string;
  let usuarioParaConfirmacionCorreo: string;
  let usuarioSoloOauthId: string;
  let usuarioSoloOauthCorreo: string;
  let usuarioParaNoLeakId: string;
  let usuarioParaNoLeakCorreo: string;

  function extraerTokenDelUltimoCorreo(): string {
    const ultimo = correosEnviados[correosEnviados.length - 1];
    const match = ultimo.cuerpo.match(/token=([^\s]+)/);
    if (!match) throw new Error('token no encontrado en el correo enviado');
    return match[1];
  }

  async function contarEventos(entityId: string | null, eventType: string): Promise<number> {
    return prisma.eventoAuditoria.count({ where: { entity_id: entityId, event_type: eventType } });
  }

  async function postRecovery(correo: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/recovery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo }),
    });
  }

  async function postRecoveryConfirm(token: string, password: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/recovery/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });
  }

  beforeAll(async () => {
    passwordHashVieja = await hash(PASSWORD_VIEJA, ARGON2_OPTIONS);
    const sufijo = Date.now();

    usuarioParaSolicitudCorreo = `recovery-solicitud-${sufijo}@e2e.local`;
    const usuarioParaSolicitud = await prisma.usuario.create({
      data: {
        codigo: `recovery-solicitud-${sufijo}`,
        dni: `recovery-solicitud-${sufijo}`,
        correo: usuarioParaSolicitudCorreo,
        nombres: 'Solicitud Recovery E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: passwordHashVieja,
      },
    });
    usuarioParaSolicitudId = usuarioParaSolicitud.id;

    usuarioParaConfirmacionCorreo = `recovery-confirmacion-${sufijo}@e2e.local`;
    const usuarioParaConfirmacion = await prisma.usuario.create({
      data: {
        codigo: `recovery-confirmacion-${sufijo}`,
        dni: `recovery-confirmacion-${sufijo}`,
        correo: usuarioParaConfirmacionCorreo,
        nombres: 'Confirmacion Recovery E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: passwordHashVieja,
      },
    });
    usuarioParaConfirmacionId = usuarioParaConfirmacion.id;

    usuarioParaNoLeakCorreo = `recovery-noleak-${sufijo}@e2e.local`;
    const usuarioParaNoLeak = await prisma.usuario.create({
      data: {
        codigo: `recovery-noleak-${sufijo}`,
        dni: `recovery-noleak-${sufijo}`,
        correo: usuarioParaNoLeakCorreo,
        nombres: 'NoLeak Recovery E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: passwordHashVieja,
      },
    });
    usuarioParaNoLeakId = usuarioParaNoLeak.id;

    usuarioSoloOauthCorreo = `recovery-solooauth-${sufijo}@e2e.local`;
    const usuarioSoloOauth = await prisma.usuario.create({
      data: {
        codigo: `recovery-solooauth-${sufijo}`,
        dni: `recovery-solooauth-${sufijo}`,
        correo: usuarioSoloOauthCorreo,
        nombres: 'SoloOAuth Recovery E2E',
        rol: 'comite',
        estado: 'activo',
        password_hash: null,
        google_id: `google-sub-recovery-${sufijo}`,
      },
    });
    usuarioSoloOauthId = usuarioSoloOauth.id;

    correosEnviados = [];
    const stubEmailSender: EmailSender = {
      send: async (destinatario, asunto, cuerpo) => {
        correosEnviados.push({ destinatario, asunto, cuerpo });
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(stubEmailSender)
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

  // 12.1 [R6][D5]: solicitud con correo existente genera token real y despacha correo.
  it('[R6][D5] solicitud con correo existente responde 202, genera token y despacha correo', async () => {
    const antes = await contarEventos(usuarioParaSolicitudId, 'RECUPERACION_SOLICITADA');

    const respuesta = await postRecovery(usuarioParaSolicitudCorreo);

    expect(respuesta.status).toBe(202);
    const cuerpo = (await respuesta.json()) as { mensaje: string };
    expect(cuerpo.mensaje).toBe('Si el correo corresponde a una cuenta, se envió un enlace');
    expect(correosEnviados.length).toBeGreaterThanOrEqual(1);
    const token = extraerTokenDelUltimoCorreo();
    expect(await redis.get(`recovery:${token}`)).toBe(usuarioParaSolicitudId);
    expect(await contarEventos(usuarioParaSolicitudId, 'RECUPERACION_SOLICITADA')).toBe(antes + 1);
  });

  // 12.1 [R6][adversarial]: correo inexistente responde IDÉNTICO, sin crear token.
  it('[R6][adversarial] solicitud con correo inexistente responde igual, sin crear recovery:{token}', async () => {
    const correosAntes = correosEnviados.length;
    const clavesAntes = (await redis.keys('recovery:*')).filter(
      (k) => !k.startsWith('recovery:cooldown:'),
    ).length;

    const respuesta = await postRecovery(`no-existe-${Date.now()}@e2e.local`);

    expect(respuesta.status).toBe(202);
    const cuerpo = (await respuesta.json()) as { mensaje: string };
    expect(cuerpo.mensaje).toBe('Si el correo corresponde a una cuenta, se envió un enlace');
    expect(correosEnviados.length).toBe(correosAntes);
    const clavesDespues = (await redis.keys('recovery:*')).filter(
      (k) => !k.startsWith('recovery:cooldown:'),
    ).length;
    expect(clavesDespues).toBe(clavesAntes);
  });

  // 12.1 [R8][R9]: confirmación válida actualiza password_hash, revoca sesiones, un solo uso.
  it('[R8][R9] confirmación válida actualiza password_hash, revoca sesiones y el token es de un solo uso', async () => {
    await postRecovery(usuarioParaConfirmacionCorreo);
    const token = extraerTokenDelUltimoCorreo();

    const sessionId = 'sesion-recovery-e2e-fixture';
    await redis.set(
      `session:${sessionId}`,
      JSON.stringify({
        userId: usuarioParaConfirmacionId,
        rol: 'comite',
        creadoEn: Math.floor(Date.now() / 1000),
      }),
      'EX',
      1800,
    );
    await redis.sadd(`session:user:${usuarioParaConfirmacionId}`, sessionId);

    const respuestaConfirm = await postRecoveryConfirm(token, 'password-nueva-e2e-2026');
    expect(respuestaConfirm.status).toBe(204);

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuarioParaConfirmacionId } });
    expect(usuarioActualizado?.password_hash).not.toBe(passwordHashVieja);
    expect(await redis.get(`recovery:${token}`)).toBeNull();
    expect(await redis.get(`session:${sessionId}`)).toBeNull();
    expect(await contarEventos(usuarioParaConfirmacionId, 'RECUPERACION_COMPLETADA')).toBeGreaterThanOrEqual(1);

    const respuestaReuso = await postRecoveryConfirm(token, 'otra-password-e2e-2026');
    expect(respuestaReuso.status).toBe(400);
  });

  // 12.1 [R7]: primera contraseña de cuenta solo-OAuth, mismo endpoint.
  it('[R7] cuenta solo-OAuth establece password_hash por primera vez con el mismo endpoint', async () => {
    await postRecovery(usuarioSoloOauthCorreo);
    const token = extraerTokenDelUltimoCorreo();

    const respuesta = await postRecoveryConfirm(token, 'primera-password-oauth-e2e');
    expect(respuesta.status).toBe(204);

    const usuarioActualizado = await prisma.usuario.findUnique({ where: { id: usuarioSoloOauthId } });
    expect(usuarioActualizado?.password_hash).not.toBeNull();
    expect(usuarioActualizado?.google_id).not.toBeNull();
  });

  // token expirado/desconocido rechaza uniforme.
  it('confirmación con token desconocido rechaza con 400 uniforme', async () => {
    const respuesta = await postRecoveryConfirm('token-que-nunca-existio', 'password-cualquiera');

    expect(respuesta.status).toBe(400);
    const cuerpo = (await respuesta.json()) as { message: string };
    expect(cuerpo.message).toBe('Enlace inválido o expirado');
  });

  // 12.2/adversarial: ninguna respuesta ni fila de auditoría contiene el token ni la contraseña.
  it('[adversarial] ninguna respuesta ni fila de EventoAuditoria contiene el token ni la contraseña', async () => {
    await postRecovery(usuarioParaNoLeakCorreo);
    const token = extraerTokenDelUltimoCorreo();
    const passwordNueva = 'password-no-debe-filtrarse-e2e';

    const respuesta = await postRecoveryConfirm(token, passwordNueva);
    const cuerpoTexto = await respuesta.text();
    expect(cuerpoTexto).not.toContain(token);
    expect(cuerpoTexto).not.toContain(passwordNueva);

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { entity_id: usuarioParaNoLeakId },
    });
    for (const evento of eventos) {
      const payloadTexto = JSON.stringify(evento.payload);
      expect(payloadTexto).not.toContain(token);
      expect(payloadTexto).not.toContain(passwordNueva);
    }
  });
});
