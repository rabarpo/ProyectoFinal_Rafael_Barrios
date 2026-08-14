import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { PapeletaService } from './papeleta.service';
import { VotosController } from './votos.controller';
import { VotosService } from './votos.service';

/**
 * vote-casting, PR1 (design.md "Enfoque técnico"/"Cambios de archivos", tarea 1.1). Primer módulo
 * orientado al VOTANTE: `imports: [AuthModule]` resuelve `AuthGuard`/`SessionService` — sin
 * `RolesGuard` (D1, ver `VotosController`). `AuditoriaModule` no se importa todavía: ni
 * `VotosService` (stub vacío en PR1) ni `PapeletaService` auditan nada — PR2 lo agrega cuando
 * `VotosService.emitir()` necesite `AuditoriaService`.
 *
 * `cookie-parser` como middleware del propio módulo, mismo criterio que `ProcesosModule`/
 * `AcademicoModule`/`AuthModule`. Ningún provider abre conexión al instanciarse, así que
 * `pnpm openapi:extract` sigue corriendo sin Postgres ni Redis vivos tras registrar este módulo
 * en `AppModule` (tarea 4.1).
 */
@Module({
  imports: [AuthModule],
  controllers: [VotosController],
  providers: [PrismaService, VotosService, PapeletaService],
})
export class VotosModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(VotosController);
  }
}
