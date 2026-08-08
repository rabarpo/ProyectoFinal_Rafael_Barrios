import { randomBytes } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { EMAIL_SENDER, type EmailSender } from '../email/email-sender';
import { REDIS_CLIENT } from '../redis/redis.provider';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

const RECOVERY_TTL_SECONDS = Number(process.env.RECOVERY_TTL_SECONDS ?? 1800);
const COOLDOWN_SECONDS = 60;
const PASSWORD_MIN_LENGTH = 8;
const ENLACE_INVALIDO_O_EXPIRADO = 'Enlace inválido o expirado';

function recoveryKey(token: string): string {
  return `recovery:${token}`;
}

function cooldownKey(userId: string): string {
  return `recovery:cooldown:${userId}`;
}

/**
 * google-oauth-y-recuperacion, PR3 (design.md D4/D5/D6/D7, ADR-0017 no aplica — este flujo no
 * depende de Google). El token es opaco (`randomBytes(32)`, idéntico al `sessionId` de
 * `SessionService`): el `userId` nunca viaja en el token ni en el correo, solo vive como valor de
 * `recovery:{token}` en Redis. `solicitar()` responde SIEMPRE lo mismo exista o no el correo
 * (anti-enumeración, D7); `confirmar()` consume el token de forma atómica (`TTL+GETDEL`) y
 * compensa (`SET` de vuelta) si la transacción posterior falla, para no perder ni duplicar la
 * capacidad de reseteo (D5).
 */
@Injectable()
export class RecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly auditoria: AuditoriaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(EMAIL_SENDER) private readonly emailSender: EmailSender,
  ) {}

  /**
   * D7: la auditoría de `RECUPERACION_SOLICITADA` se confirma SIEMPRE, exista o no el correo, con
   * `emitido` reflejando si esta llamada efectivamente reclamó el cooldown de 60s de D5 (`SET NX`)
   * — la reclamación del cooldown ocurre antes de la transacción porque decide el propio contenido
   * del payload auditado; a diferencia del token de recuperación (una capacidad real de toma de
   * cuenta), el cooldown en sí no es un secreto ni una capacidad, así que reclamarlo antes de
   * confirmar la auditoría no reabre la ventana que D7 protege (un fallo de la transacción posterior
   * nunca deja un `recovery:{token}` huérfano, como sí ocurriría si el `SET` del token fuera antes
   * de la transacción).
   */
  async solicitar(correo: string): Promise<void> {
    const correoNormalizado = correo.trim().toLowerCase();
    const usuario = await this.prisma.usuario.findUnique({ where: { correo: correoNormalizado } });

    let emitido = false;
    if (usuario) {
      const reclamado = await this.redis.set(
        cooldownKey(usuario.id),
        '1',
        'EX',
        COOLDOWN_SECONDS,
        'NX',
      );
      emitido = reclamado === 'OK';
    }

    await this.prisma.$transaction((tx) =>
      this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.RECUPERACION_SOLICITADA,
        usuario?.id ?? null,
        'Usuario',
        usuario?.id ?? null,
        // Nunca el token — solo correo y si esta llamada efectivamente emitió uno.
        { correo: correoNormalizado, emitido } as Prisma.InputJsonValue,
      ),
    );

    if (!usuario || !emitido) return;

    const token = randomBytes(32).toString('base64url');
    await this.redis.set(recoveryKey(token), usuario.id, 'EX', RECOVERY_TTL_SECONDS);

    const enlace = `${process.env.APP_BASE_URL ?? ''}/recuperar?token=${token}`;
    // Fire-and-forget (D5/D8): la respuesta al cliente nunca espera al envío del correo.
    this.emailSender
      .send(usuario.correo, 'Recuperación de contraseña', `Ingresá a ${enlace} para continuar.`)
      .catch(() => undefined);
  }

  /**
   * D5: `multi().ttl(k).getdel(k).exec()` lee el TTL restante y borra la clave en un solo
   * roundtrip atómico — de dos `confirmar()` concurrentes con el mismo token, solo uno recibe un
   * `userId` no nulo. D7: el hash de la contraseña nueva se calcula FUERA de la transacción
   * (argon2id es caro); `UPDATE password_hash` + `log RECUPERACION_COMPLETADA` van en la MISMA
   * `$transaction()`. Si esa transacción falla, se compensa restaurando el token en Redis con el
   * TTL restante (nunca se pierde la capacidad de reintentar) antes de relanzar el error.
   */
  async confirmar(token: string, password: string): Promise<void> {
    if (password.length < PASSWORD_MIN_LENGTH) {
      throw new BadRequestException(ENLACE_INVALIDO_O_EXPIRADO);
    }

    const resultado = await this.redis.multi().ttl(recoveryKey(token)).getdel(recoveryKey(token)).exec();
    const ttlRestante = (resultado?.[0]?.[1] as number | undefined) ?? -2;
    const userId = resultado?.[1]?.[1] as string | null | undefined;

    if (!userId) {
      throw new BadRequestException(ENLACE_INVALIDO_O_EXPIRADO);
    }

    const passwordHash = await this.passwordService.hash(password);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.usuario.update({ where: { id: userId }, data: { password_hash: passwordHash } });
        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.RECUPERACION_COMPLETADA,
          userId,
          'Usuario',
          userId,
          { sesiones_revocadas: true } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      // Compensación (D5/D7): la transacción no confirmó, así que el token se restaura para no
      // perder la capacidad de reintentar — dirección segura, nunca se duplica sobre un token vivo
      // porque el GETDEL de arriba ya lo consumió.
      const ttlCompensacion = Math.max(ttlRestante, 1);
      await this.redis.set(recoveryKey(token), userId, 'EX', ttlCompensacion).catch(() => undefined);
      throw error;
    }

    await this.sessionService.revokeAllForUser(userId);

    // D6: aviso best-effort, sin token ni contraseña, después de revocar sesiones. Su fallo no
    // revierte nada ni cambia la respuesta (204 ya está decidido en este punto).
    const usuario = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (usuario) {
      this.emailSender
        .send(
          usuario.correo,
          'Tu contraseña fue actualizada',
          `Tu contraseña se cambió el ${new Date().toISOString()}. Si no fuiste vos, contactá a administración.`,
        )
        .catch(() => undefined);
    }
  }
}
