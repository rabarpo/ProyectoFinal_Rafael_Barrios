import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';

/**
 * administracion-academica, PR1 (design.md D0, tareas 1.1-1.2). `imports: [AuthModule,
 * AuditoriaModule]`: `AuthModule` resuelve `AuthGuard`/`RolesGuard`/`SessionService`,
 * `AuditoriaModule` resuelve `AuditoriaService`. PR1 solo deja el wiring, el catálogo de errores
 * (`academico.errors.ts`) y el traductor de errores de Prisma (`prisma-errores.ts`) — sin
 * controladores ni servicios de entidad todavía (fuera de alcance explícito de PR1; llegan por PR
 * conforme se implementa cada entidad).
 *
 * Deviación declarada frente al snippet literal de la tarea 1.1: el diseño describe
 * `implements NestModule` aplicando `cookieParser()` a los seis controladores (D6 de
 * `auth-server-sessions`, nunca en `main.ts`), pero ninguno de esos controladores existe todavía
 * en PR1. `consumer.apply(cookieParser()).forRoutes(...)` exige al menos un controlador/ruta como
 * argumento, así que no hay nada válido a lo que enrutar — mismo problema y misma solución que
 * `UsersModule` en PR1 de `administracion-usuarios-apoderados` (commit `eb73479`). Este módulo pasa
 * a `implements NestModule` cuando el primer controlador (`AniosEscolaresController`, PR2) exista,
 * y `cookieParser()` se extiende a cada controlador nuevo conforme se registra en PR siguientes —
 * mismo criterio D6, sin cambios de comportamiento hasta entonces (`AcademicoModule` no expone
 * ninguna ruta en PR1).
 *
 * Ningún provider abre conexión al instanciarse, así que `src/openapi.ts` sigue extrayendo el
 * contrato sin Postgres ni Redis vivos (gotcha D1 de `system-scaffolding`).
 */
@Module({
  imports: [AuthModule, AuditoriaModule],
})
export class AcademicoModule {}
