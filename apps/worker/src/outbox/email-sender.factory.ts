import type { PrismaClient } from '@prisma/client';
import { ConsoleEmailSender } from '@seei/backend/dist/email/console-email-sender';
import type { EmailSender } from '@seei/backend/dist/email/email-sender';
import { SmtpEmailSender } from '@seei/backend/dist/email/smtp-email-sender';

/**
 * outbox-correo-comprobante-autenticado (#15, PR2; design.md D9). Reutiliza el CONTRATO y la
 * implementación de transporte de `apps/backend/src/email/*` sin modificarlas — `proposal.md`
 * protege ese módulo "tal cual". NO usa `ConfiguracionEmailSender` (es `@Injectable` de Nest y
 * exigiría montar un contexto de Nest completo en el worker sólo para inyectar dos dependencias):
 * este factory resuelve `Configuracion` con el mismo `PrismaClient` del worker y compone
 * `SmtpEmailSender`/`ConsoleEmailSender` con la misma semántica perezosa por envío que
 * `ConfiguracionEmailSender.send()` (sin abrir socket SMTP al construirse).
 *
 * Sin caché, igual que `ConfiguracionLecturaService.smtp()`: cada llamada relee `Configuracion`,
 * así un cambio de host SMTP surte efecto en el siguiente envío sin ventana de staleness.
 */
export async function crearEmailSender(prisma: PrismaClient): Promise<EmailSender> {
  const configuracion = await prisma.configuracion.findUnique({
    where: { clave: 'institucional' },
  });

  if (!configuracion?.smtp_host) {
    return new ConsoleEmailSender();
  }

  return new SmtpEmailSender({
    host: configuracion.smtp_host,
    port: configuracion.smtp_puerto ?? 0,
    user: process.env.SMTP_USER,
    password: process.env.SMTP_PASSWORD,
    from: configuracion.smtp_remitente ?? '',
  });
}
