import type { Provider } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { EMAIL_SENDER } from './email-sender';
import { ConfiguracionEmailSender } from './configuracion-email-sender';
import { ConfiguracionLecturaModule } from '../configuracion/configuracion-lectura.module';
import { ConfiguracionLecturaService } from '../configuracion/configuracion-lectura.service';

/**
 * google-oauth-y-recuperacion, PR1 (design.md D8). Módulo propio, fuera de `auth/`, para que el
 * backlog #15 (outbox real) pueda reemplazar la implementación sin tocar `auth/`.
 *
 * configuracion-general, PR4 (design.md D3, tarea 4.6): la factory de `EMAIL_SENDER` ya NO decide
 * Smtp/Console en el arranque — siempre construye `ConfiguracionEmailSender`, que resuelve
 * `smtp_host/puerto/remitente` desde `Configuracion` recién dentro de `send()` (D3). La factory
 * sigue sin abrir socket ni conexión al instanciarse (`ConfiguracionLecturaService` no conecta en
 * su constructor), así `src/openapi.ts` sigue extrayendo el contrato sin Postgres ni SMTP vivos
 * (mismo gotcha que `PrismaService`/`redisProvider`).
 *
 * El sistema MUST NOT escribir en `JobCorreo`/`Notificacion` (spec "`EmailSender` mínimo sin
 * outbox", MODIFIED): la restricción de PR1 sobre no leer `Configuracion` fue reemplazada por ese
 * mismo requirement — ahora leer `Configuracion` es el comportamiento esperado, vía el módulo de
 * SOLO LECTURA `ConfiguracionLecturaModule` (nunca escritura ni auditoría desde aquí).
 */
const emailSenderProvider: Provider = {
  provide: EMAIL_SENDER,
  useFactory: (configuracionLectura: ConfiguracionLecturaService) =>
    new ConfiguracionEmailSender(configuracionLectura),
  inject: [ConfiguracionLecturaService],
};

@Module({
  imports: [ConfiguracionLecturaModule],
  providers: [emailSenderProvider],
  exports: [EMAIL_SENDER],
})
export class EmailModule {}
