import type { Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { EMAIL_SENDER } from './email-sender';
import { ConsoleEmailSender } from './console-email-sender';
import { SmtpEmailSender } from './smtp-email-sender';

/**
 * google-oauth-y-recuperacion, PR1 (design.md D8). Módulo propio, fuera de `auth/`, para que el
 * backlog #15 (outbox real) pueda reemplazar la implementación sin tocar `auth/`. La factory de
 * `EMAIL_SENDER` es perezosa (ninguna rama abre socket ni conexión al instanciarse): con
 * `SMTP_HOST` definido usa `SmtpEmailSender`, si no `ConsoleEmailSender` — así `src/openapi.ts`
 * sigue extrayendo el contrato sin SMTP vivo (mismo gotcha que `PrismaService`/`redisProvider`).
 *
 * El sistema MUST NOT escribir en `JobCorreo`/`Notificacion` ni leer `Configuracion` (spec
 * "`EmailSender` mínimo sin outbox"): por eso este módulo no importa `PrismaService` ni ningún
 * provider de acceso a esos modelos — su única superficie es `EMAIL_SENDER`.
 */
const emailSenderProvider: Provider = {
  provide: EMAIL_SENDER,
  useFactory: () => {
    if (process.env.SMTP_HOST) {
      return new SmtpEmailSender({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER,
        password: process.env.SMTP_PASSWORD,
        from: process.env.SMTP_FROM ?? 'no-reply@seei.local',
      });
    }
    return new ConsoleEmailSender();
  },
};

@Module({
  providers: [emailSenderProvider],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
