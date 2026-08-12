import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { ConfiguracionLecturaModule } from '../configuracion/configuracion-lectura.module';
import { PrismaService } from '../prisma/prisma.service';
import { PadronService } from './padron.service';
import { ProcesosController } from './procesos.controller';
import { ProcesosService } from './procesos.service';

/**
 * administracion-procesos-electorales, PR5 (design.md "Enfoque técnico"/"Cambios de archivos",
 * tareas 12.3-12.4). `imports: [AuthModule, AuditoriaModule, ConfiguracionLecturaModule]`:
 * `AuthModule` resuelve `AuthGuard`/`RolesGuard`/`SessionService`, `AuditoriaModule` resuelve
 * `AuditoriaService` (`PadronService.calcular()` no audita, D6 — pero `ProcesosService`, PR6, sí
 * la usa para `PROCESO_CREADO` dentro de la `$transaction` de `crear()`),
 * `ConfiguracionLecturaModule` resuelve `ConfiguracionLecturaService.anioEscolarActivoId()` (D2b).
 *
 * `cookie-parser` se registra como middleware del propio módulo (mismo criterio que
 * `AcademicoModule`/`AuthModule`), nunca en `main.ts`.
 *
 * Ningún provider abre conexión al instanciarse, así que `pnpm openapi:extract` sigue corriendo
 * sin Postgres ni Redis vivos tras registrar este módulo en `AppModule` (tarea 12.4).
 */
@Module({
  imports: [AuthModule, AuditoriaModule, ConfiguracionLecturaModule],
  controllers: [ProcesosController],
  providers: [PrismaService, PadronService, ProcesosService],
})
export class ProcesosModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(ProcesosController);
  }
}
