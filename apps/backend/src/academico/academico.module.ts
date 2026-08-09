import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { AniosEscolaresController } from './anios-escolares.controller';
import { AniosEscolaresService } from './anios-escolares.service';
import { GradosController } from './grados.controller';
import { GradosService } from './grados.service';
import { NivelesController } from './niveles.controller';
import { NivelesService } from './niveles.service';
import { SeccionesController } from './secciones.controller';
import { SeccionesService } from './secciones.service';

/**
 * administracion-academica, PR2/PR4/PR5 (design.md D0, tareas 1.1-1.2, 7.8, 13.10, 14.10, 17.11).
 * `imports: [AuthModule, AuditoriaModule]`: `AuthModule` resuelve
 * `AuthGuard`/`RolesGuard`/`SessionService`, `AuditoriaModule` resuelve `AuditoriaService`.
 *
 * `AcademicoModule implements NestModule` desde PR2 (D0, snippet literal de la tarea 1.1).
 * `cookieParser()` se extiende a cada controlador nuevo (`NivelesController`, `GradosController`
 * desde PR4, `SeccionesController` desde PR5) conforme se registra en los PR siguientes (D6 de
 * `auth-server-sessions`, nunca en `main.ts`); omitir un controlador de `forRoutes(...)` hace que
 * todas sus rutas respondan `401`.
 *
 * Ningún provider abre conexión al instanciarse, así que `src/openapi.ts` sigue extrayendo el
 * contrato sin Postgres ni Redis vivos (gotcha D1 de `system-scaffolding`).
 */
@Module({
  imports: [AuthModule, AuditoriaModule],
  controllers: [AniosEscolaresController, NivelesController, GradosController, SeccionesController],
  providers: [PrismaService, AniosEscolaresService, NivelesService, GradosService, SeccionesService],
})
export class AcademicoModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(cookieParser())
      .forRoutes(AniosEscolaresController, NivelesController, GradosController, SeccionesController);
  }
}
