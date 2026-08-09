import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { AniosEscolaresController } from './anios-escolares.controller';
import { AniosEscolaresService } from './anios-escolares.service';

/**
 * administracion-academica, PR2 (design.md D0, tareas 1.1-1.2, 7.8). `imports: [AuthModule,
 * AuditoriaModule]`: `AuthModule` resuelve `AuthGuard`/`RolesGuard`/`SessionService`,
 * `AuditoriaModule` resuelve `AuditoriaService`.
 *
 * `AcademicoModule implements NestModule` desde este PR (D0, snippet literal de la tarea 1.1):
 * `AniosEscolaresController` es el primer controlador real del módulo, así que
 * `consumer.apply(cookieParser()).forRoutes(...)` ya tiene un argumento válido — la deviación
 * declarada en PR1 (commit de este módulo, tarea 1.1) queda resuelta aquí. `cookieParser()` se
 * extiende a cada controlador nuevo (`NivelesController`, `GradosController`, …) conforme se
 * registra en los PR siguientes (D6 de `auth-server-sessions`, nunca en `main.ts`); omitir un
 * controlador de `forRoutes(...)` hace que todas sus rutas respondan `401`.
 *
 * Ningún provider abre conexión al instanciarse, así que `src/openapi.ts` sigue extrayendo el
 * contrato sin Postgres ni Redis vivos (gotcha D1 de `system-scaffolding`).
 */
@Module({
  imports: [AuthModule, AuditoriaModule],
  controllers: [AniosEscolaresController],
  providers: [PrismaService, AniosEscolaresService],
})
export class AcademicoModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(AniosEscolaresController);
  }
}
