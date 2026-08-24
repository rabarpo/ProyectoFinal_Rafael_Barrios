import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { ReportesController } from './reportes.controller';
import { ReportesService } from './reportes.service';

/**
 * reportes-y-exportaciones (#18, PR3; design.md D1). Módulo Nest **propio y de primer nivel**
 * (`apps/backend/src/reportes/`), no colgado de `ProcesosModule`: un reporte no transiciona nada
 * del ciclo de vida de `ProcesoElectoral`, se solicita en cualquier momento y su audiencia es
 * administrativa — mismo precedente que `ImportacionModule`/`PanelJornadaModule`. `imports:
 * [AuthModule]` resuelve `AuthGuard`/`RolesGuard`. Sin `AuditoriaModule`: `ReportesService` no
 * escribe eventos de auditoría (los escribe el worker en PR4, dentro de su propia transacción
 * terminal, D13). `cookie-parser` se registra como middleware del propio módulo, mismo criterio
 * que `ProcesosModule`/`AcademicoModule`/`AuthModule`.
 *
 * Ningún provider abre conexión al instanciarse, así que `pnpm openapi:extract` sigue corriendo
 * sin Postgres ni Redis vivos tras registrar este módulo en `AppModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [ReportesController],
  providers: [PrismaService, ReportesService],
})
export class ReportesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(ReportesController);
  }
}
