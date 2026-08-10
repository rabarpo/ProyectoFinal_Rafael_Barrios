import { Injectable } from '@nestjs/common';
import type { EmailSender } from './email-sender';
import { ConsoleEmailSender } from './console-email-sender';
import { SmtpEmailSender } from './smtp-email-sender';
import { ConfiguracionLecturaService } from '../configuracion/configuracion-lectura.service';

/**
 * configuracion-general, PR4 (design.md D3, tarea 4.5). Implementación de `EmailSender` que
 * resuelve `smtp_host`/`smtp_puerto`/`smtp_remitente` desde `Configuracion`
 * (`ConfiguracionLecturaService.smtp()`) **dentro de `send()`**, nunca en el constructor ni en la
 * `useFactory` de `EmailModule` — así la instanciación del módulo sigue sin abrir Postgres
 * (`pnpm openapi:extract` sin BD viva, D2/D3). `smtp_host` nulo/ausente ⇒ delega en
 * `ConsoleEmailSender` (mismo fallback de desarrollo que hoy con env var ausente). La contraseña
 * SMTP MUST seguir viniendo exclusivamente de `SMTP_USER`/`SMTP_PASSWORD` (variable de
 * entorno/secret manager) — `Configuracion` nunca tiene columna de contraseña (spec "La
 * contraseña SMTP nunca se lee de `Configuracion`").
 */
@Injectable()
export class ConfiguracionEmailSender implements EmailSender {
  constructor(private readonly configuracionLectura: ConfiguracionLecturaService) {}

  async send(destinatario: string, asunto: string, cuerpo: string): Promise<void> {
    const smtp = await this.configuracionLectura.smtp();
    const sender = smtp
      ? new SmtpEmailSender({
          host: smtp.host,
          port: smtp.puerto,
          user: process.env.SMTP_USER,
          password: process.env.SMTP_PASSWORD,
          from: smtp.remitente,
        })
      : new ConsoleEmailSender();

    await sender.send(destinatario, asunto, cuerpo);
  }
}
