import { Injectable } from '@nestjs/common';
import type { Configuracion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ConfiguracionSmtp {
  host: string;
  puerto: number;
  remitente: string;
}

/**
 * configuracion-general, PR1 (design.md D2/D3/D6, tarea 1.7). Capa de SOLO LECTURA del singleton
 * `Configuracion` (`clave='institucional'`): la base sobre la que `AuthModule` (PR4,
 * `GoogleOauthService.dominiosPermitidos()`) y `EmailModule` (PR4, `ConfiguracionEmailSender`)
 * consultarán sin acoplarse al `ConfiguracionModule` de PR2 (controller + auditoría), rompiendo
 * así el ciclo de DI que ese acoplamiento directo produciría.
 *
 * Sin caché (D6): cada llamada es una consulta nueva — revocar un dominio Google o cambiar el
 * host SMTP debe surtir efecto en la siguiente request, sin ventana de staleness.
 *
 * Constructor solo con `PrismaService`, sin abrir conexión al construirse (misma conexión
 * perezosa documentada en `prisma.service.ts`) — así `pnpm openapi:extract` sigue corriendo sin
 * Postgres vivo una vez que este módulo se registra en `AppModule` (tarea 1.9).
 */
@Injectable()
export class ConfiguracionLecturaService {
  constructor(private readonly prisma: PrismaService) {}

  obtener(): Promise<Configuracion | null> {
    return this.prisma.configuracion.findUnique({ where: { clave: 'institucional' } });
  }

  async smtp(): Promise<ConfiguracionSmtp | null> {
    const fila = await this.obtener();
    if (!fila?.smtp_host) {
      return null;
    }
    return {
      host: fila.smtp_host,
      puerto: fila.smtp_puerto ?? 0,
      remitente: fila.smtp_remitente ?? '',
    };
  }

  async dominiosGooglePermitidos(): Promise<string[]> {
    const fila = await this.obtener();
    return fila?.dominios_google ?? [];
  }
}
