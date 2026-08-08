import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import Redis from 'ioredis';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import type { EmailSender } from '../email/email-sender';
import { PasswordService } from './password.service';
import { RecoveryService } from './recovery.service';
import { SessionService } from './session.service';

/**
 * google-oauth-y-recuperacion, PR3 (design.md D4/D5/D6/D7). Corre contra un Redis real (efímero,
 * `infra/docker/docker-compose.test.yml` en 6380 — mismo criterio que `session.service.spec.ts`):
 * el consumo atómico `TTL+GETDEL` y la carrera de dos `confirmar()` concurrentes no son
 * simulables con mocks. Prisma, `SessionService.revokeAllForUser` y `EmailSender` sí se mockean —
 * el foco es la orquestación y la atomicidad de Redis, no la persistencia real (reservada a
 * `test/auth/auth-recovery.e2e-spec.ts`).
 */
describe('RecoveryService — solicitar()/confirmar() (D4/D5/D6/D7)', () => {
  let redis: Redis;

  const USUARIO_EXISTENTE = {
    id: 'usuario-recovery-1',
    correo: 'existente@e2e.local',
    password_hash: 'hash-viejo',
  };

  beforeAll(() => {
    redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  function crearServicio(overrides: {
    usuario?: typeof USUARIO_EXISTENTE | null;
    transactionThrows?: boolean;
  }) {
    const prisma = {
      usuario: {
        findUnique: jest.fn().mockResolvedValue(overrides.usuario ?? null),
        update: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn(async (callback: (tx: Prisma.TransactionClient) => Promise<void>) => {
        if (overrides.transactionThrows) {
          throw new Error('fallo simulado de auditoría');
        }
        const tx = { usuario: { update: prisma.usuario.update } } as unknown as Prisma.TransactionClient;
        return callback(tx);
      }),
    };

    const passwordService = { hash: jest.fn().mockResolvedValue('hash-nuevo') };
    const sessionService = { revokeAllForUser: jest.fn().mockResolvedValue(undefined) };
    const auditoria = { log: jest.fn().mockResolvedValue(undefined) };
    const emailSender: jest.Mocked<EmailSender> = { send: jest.fn().mockResolvedValue(undefined) };

    const service = new RecoveryService(
      prisma as never,
      passwordService as unknown as PasswordService,
      sessionService as unknown as SessionService,
      auditoria as unknown as AuditoriaService,
      redis,
      emailSender,
    );

    return { service, prisma, passwordService, sessionService, auditoria, emailSender };
  }

  async function claveRecovery(token: string): Promise<string | null> {
    return redis.get(`recovery:${token}`);
  }

  async function tokensDeRecuperacion(): Promise<string[]> {
    const claves = await redis.keys('recovery:*');
    return claves.filter((clave) => !clave.startsWith('recovery:cooldown:'));
  }

  function extraerTokenDeEnlace(mockSend: jest.Mock): string {
    const cuerpo = mockSend.mock.calls[0][2] as string;
    const match = cuerpo.match(/token=([^\s]+)/);
    if (!match) throw new Error('token no encontrado en el cuerpo del correo');
    return match[1];
  }

  // 9.1 [R6][D4][D5]
  it('[R6][D4][D5] correo existente genera recovery:{token} con TTL~1800 y despacha el correo', async () => {
    const { service, emailSender } = crearServicio({ usuario: USUARIO_EXISTENTE });

    await service.solicitar(USUARIO_EXISTENTE.correo);

    expect(emailSender.send).toHaveBeenCalledTimes(1);
    const token = extraerTokenDeEnlace(emailSender.send as jest.Mock);
    const valor = await claveRecovery(token);
    expect(valor).toBe(USUARIO_EXISTENTE.id);
    const ttl = await redis.ttl(`recovery:${token}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1800);
  });

  // 9.2 [R6][adversarial]
  it('[R6][adversarial] correo inexistente no crea ninguna clave recovery:{token}', async () => {
    const { service, emailSender } = crearServicio({ usuario: null });

    await service.solicitar('no-existe@e2e.local');

    expect(emailSender.send).not.toHaveBeenCalled();
    expect(await tokensDeRecuperacion()).toEqual([]);
  });

  // 9.3 [R9][D7]
  it('[R9][D7] audita RECUPERACION_SOLICITADA en su propia transacción en ambos caminos', async () => {
    const { service: servicioConUsuario, auditoria: auditoriaA } = crearServicio({
      usuario: USUARIO_EXISTENTE,
    });
    await servicioConUsuario.solicitar(USUARIO_EXISTENTE.correo);
    expect(auditoriaA.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.RECUPERACION_SOLICITADA,
      USUARIO_EXISTENTE.id,
      'Usuario',
      USUARIO_EXISTENTE.id,
      expect.objectContaining({ correo: USUARIO_EXISTENTE.correo, emitido: true }),
    );

    const { service: servicioSinUsuario, auditoria: auditoriaB } = crearServicio({ usuario: null });
    await servicioSinUsuario.solicitar('no-existe@e2e.local');
    expect(auditoriaB.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.RECUPERACION_SOLICITADA,
      null,
      'Usuario',
      null,
      expect.objectContaining({ correo: 'no-existe@e2e.local', emitido: false }),
    );
  });

  // 9.4 [D5][adversarial]
  it('[D5][adversarial] una segunda solicitud dentro de 60s no emite token/correo nuevo', async () => {
    const { service: servicioUno, emailSender: emailUno } = crearServicio({ usuario: USUARIO_EXISTENTE });
    await servicioUno.solicitar(USUARIO_EXISTENTE.correo);
    expect(emailUno.send).toHaveBeenCalledTimes(1);
    expect(await tokensDeRecuperacion()).toHaveLength(1);

    const { service: servicioDos, emailSender: emailDos } = crearServicio({ usuario: USUARIO_EXISTENTE });
    await expect(servicioDos.solicitar(USUARIO_EXISTENTE.correo)).resolves.toBeUndefined();

    expect(emailDos.send).not.toHaveBeenCalled();
    expect(await tokensDeRecuperacion()).toHaveLength(1);
  });

  // 9.6 [adversarial]
  it('[adversarial] el payload de auditoría de RECUPERACION_SOLICITADA nunca contiene el token', async () => {
    const { service, auditoria, emailSender } = crearServicio({ usuario: USUARIO_EXISTENTE });

    await service.solicitar(USUARIO_EXISTENTE.correo);

    const token = extraerTokenDeEnlace(emailSender.send as jest.Mock);
    const payloadAuditado = (auditoria.log as jest.Mock).mock.calls[0][5];
    expect(JSON.stringify(payloadAuditado)).not.toContain(token);
  });

  // 10.2 [R8]
  it('[R8] token no presente en Redis rechaza con 400 uniforme, sin cambiar password_hash', async () => {
    const { service, prisma } = crearServicio({});

    await expect(service.confirmar('token-inexistente', 'password-valida-8')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  // 10.4
  it('password menor a 8 caracteres rechaza con 400 uniforme, sin tocar Redis ni Postgres', async () => {
    await redis.set('recovery:token-corto', USUARIO_EXISTENTE.id, 'EX', 1800);
    const { service, prisma } = crearServicio({});

    await expect(service.confirmar('token-corto', 'corta')).rejects.toThrow(BadRequestException);
    expect(prisma.usuario.update).not.toHaveBeenCalled();
    expect(await claveRecovery('token-corto')).toBe(USUARIO_EXISTENTE.id);
  });

  // 10.1/10.3 [R8][D5][adversarial]: consumo atómico — usado una vez, la reutilización rechaza.
  it('[R8][D5] token válido confirma una vez; reutilizarlo después rechaza sin cambiar password_hash', async () => {
    await redis.set('recovery:token-unico', USUARIO_EXISTENTE.id, 'EX', 1800);
    const { service, prisma, auditoria, sessionService } = crearServicio({});

    await service.confirmar('token-unico', 'password-nueva-valida');

    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: USUARIO_EXISTENTE.id },
      data: { password_hash: 'hash-nuevo' },
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.RECUPERACION_COMPLETADA,
      USUARIO_EXISTENTE.id,
      'Usuario',
      USUARIO_EXISTENTE.id,
      expect.objectContaining({ sesiones_revocadas: true }),
    );
    expect(sessionService.revokeAllForUser).toHaveBeenCalledWith(USUARIO_EXISTENTE.id);
    expect(await claveRecovery('token-unico')).toBeNull();

    prisma.usuario.update.mockClear();
    await expect(service.confirmar('token-unico', 'password-nueva-valida')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  // 10.1 [R8][D5][adversarial]: dos confirmar() concurrentes con el mismo token — exactamente uno gana.
  it('[R8][D5][adversarial] dos confirmar() concurrentes con el mismo token: exactamente uno tiene éxito', async () => {
    await redis.set('recovery:token-carrera', USUARIO_EXISTENTE.id, 'EX', 1800);
    const { service: servicioA, prisma: prismaA } = crearServicio({});
    const { service: servicioB, prisma: prismaB } = crearServicio({});

    const resultados = await Promise.allSettled([
      servicioA.confirmar('token-carrera', 'password-nueva-valida'),
      servicioB.confirmar('token-carrera', 'password-nueva-valida'),
    ]);

    const exitosos = resultados.filter((r) => r.status === 'fulfilled');
    const rechazados = resultados.filter((r) => r.status === 'rejected');
    expect(exitosos).toHaveLength(1);
    expect(rechazados).toHaveLength(1);

    const actualizacionesTotales =
      (prismaA.usuario.update as jest.Mock).mock.calls.length +
      (prismaB.usuario.update as jest.Mock).mock.calls.length;
    expect(actualizacionesTotales).toBe(1);
    expect(await claveRecovery('token-carrera')).toBeNull();
  });

  // 10.5 [R7]: cuenta solo-OAuth (password_hash nulo) usa el mismo camino, sin distinción observable.
  it('[R7] cuenta solo-OAuth con password_hash nulo establece la contraseña por el mismo camino', async () => {
    await redis.set('recovery:token-solo-oauth', 'usuario-solo-oauth', 'EX', 1800);
    const { service, prisma } = crearServicio({ usuario: { ...USUARIO_EXISTENTE, id: 'usuario-solo-oauth' } });

    await service.confirmar('token-solo-oauth', 'password-primera-vez');

    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: 'usuario-solo-oauth' },
      data: { password_hash: 'hash-nuevo' },
    });
  });

  // 10.6 [R9][D7][adversarial]: fallo de la transacción compensa restaurando el token, sin revocar sesiones.
  it('[R9][D7][adversarial] fallo de la transacción restaura el token (compensación) y no revoca sesiones', async () => {
    await redis.set('recovery:token-compensacion', USUARIO_EXISTENTE.id, 'EX', 900);
    const { service, sessionService } = crearServicio({ transactionThrows: true });

    await expect(service.confirmar('token-compensacion', 'password-nueva-valida')).rejects.toThrow(
      'fallo simulado de auditoría',
    );

    expect(sessionService.revokeAllForUser).not.toHaveBeenCalled();
    const valorRestaurado = await claveRecovery('token-compensacion');
    expect(valorRestaurado).toBe(USUARIO_EXISTENTE.id);
    const ttlRestaurado = await redis.ttl('recovery:token-compensacion');
    expect(ttlRestaurado).toBeGreaterThan(0);
  });

  // 10.10 [D6]: aviso de confirmación best-effort, sin token ni contraseña.
  it('[D6] confirmación exitosa despacha un aviso best-effort sin token ni contraseña', async () => {
    await redis.set('recovery:token-aviso', USUARIO_EXISTENTE.id, 'EX', 1800);
    const { service, emailSender } = crearServicio({ usuario: USUARIO_EXISTENTE });

    await service.confirmar('token-aviso', 'password-nueva-valida');

    expect(emailSender.send).toHaveBeenCalledTimes(1);
    const [destinatario, , cuerpo] = (emailSender.send as jest.Mock).mock.calls[0];
    expect(destinatario).toBe(USUARIO_EXISTENTE.correo);
    expect(cuerpo).not.toContain('token-aviso');
    expect(cuerpo).not.toContain('password-nueva-valida');
  });

  // [adversarial]: el fallo del correo de aviso no revierte nada ni afecta la respuesta.
  it('[adversarial] el fallo del correo de aviso no relanza ni revierte la confirmación', async () => {
    await redis.set('recovery:token-correo-falla', USUARIO_EXISTENTE.id, 'EX', 1800);
    const { service, prisma, emailSender } = crearServicio({ usuario: USUARIO_EXISTENTE });
    (emailSender.send as jest.Mock).mockRejectedValue(new Error('SMTP caído'));

    await expect(service.confirmar('token-correo-falla', 'password-nueva-valida')).resolves.toBeUndefined();
    expect(prisma.usuario.update).toHaveBeenCalled();
  });
});
