import nodemailer from 'nodemailer';
import type { EmailSender } from './email-sender';

export interface SmtpEmailSenderConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
}

/**
 * google-oauth-y-recuperacion, PR1 (design.md D8): implementación real de `EmailSender` vía
 * `nodemailer`. La construcción NO abre socket — sin `pool` y sin `verify()` al arrancar — así
 * `EmailModule` sigue siendo instanciable sin conexión SMTP viva (preserva el gotcha de
 * `src/openapi.ts`). `createTransport(...).sendMail()` se invoca recién en `send()`, de forma
 * perezosa.
 */
export class SmtpEmailSender implements EmailSender {
  constructor(private readonly config: SmtpEmailSenderConfig) {}

  async send(destinatario: string, asunto: string, cuerpo: string): Promise<void> {
    const transport = nodemailer.createTransport({
      host: this.config.host,
      port: this.config.port,
      auth: this.config.user
        ? { user: this.config.user, pass: this.config.password }
        : undefined,
    });

    await transport.sendMail({
      from: this.config.from,
      to: destinatario,
      subject: asunto,
      text: cuerpo,
    });
  }
}
