import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { redisProvider } from '../redis/redis.provider';
import { PanelJornadaController } from './panel-jornada.controller';
import { PanelJornadaService } from './panel-jornada.service';

/**
 * dashboard-panel-jornada (Backlog #20, PR1; design.md "Enfoque técnico"/"Cambios de archivos",
 * tarea 4.2). Wiring espejo de `procesos.module.ts`: `AuthModule` resuelve
 * `AuthGuard`/`RolesGuard`, `redisProvider` resuelve `REDIS_CLIENT` (`lazyConnect: true`, no abre
 * conexión al instanciarse — `pnpm openapi:extract` sigue corriendo sin Postgres ni Redis vivos
 * tras registrar este módulo). `cookie-parser` como middleware del propio módulo, mismo criterio
 * que `CandidatosModule`/`AcademicoModule`/`ProcesosModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [PanelJornadaController],
  providers: [PrismaService, redisProvider, PanelJornadaService],
})
export class PanelJornadaModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(PanelJornadaController);
  }
}
