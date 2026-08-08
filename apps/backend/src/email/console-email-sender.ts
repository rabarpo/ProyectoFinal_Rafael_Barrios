import type { EmailSender } from './email-sender';

/**
 * google-oauth-y-recuperacion, PR1 (design.md D8): implementación por defecto de `EmailSender`
 * cuando `SMTP_HOST` no está configurado (entorno de desarrollo). Loguea **solo** destinatario y
 * asunto — nunca el `cuerpo`, que lleva el token de recuperación en el flujo real (D5/D7).
 */
export class ConsoleEmailSender implements EmailSender {
  async send(destinatario: string, asunto: string, _cuerpo: string): Promise<void> {
    console.log(`[ConsoleEmailSender] destinatario=${destinatario} asunto=${asunto}`);
  }
}
