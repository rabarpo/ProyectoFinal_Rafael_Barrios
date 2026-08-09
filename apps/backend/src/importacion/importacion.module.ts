import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AcademicoModule } from '../academico/academico.module';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { redisProvider } from '../redis/redis.provider';
import { UsersModule } from '../users/users.module';
import { ImportacionController } from './importacion.controller';
import { ImportacionService } from './importacion.service';

/**
 * importacion-excel, PR2 (design.md D1/D4, "File Changes", tarea 2.7). `imports: [AuthModule,
 * AuditoriaModule, UsersModule, AcademicoModule]`: `AuthModule` resuelve
 * `AuthGuard`/`RolesGuard`/`SessionService`; `AuditoriaModule` resuelve `AuditoriaService`
 * (consumido recién en PR3 para el evento agregado `PADRON_IMPORTADO`, D6 — se importa ahora para
 * no reabrir este módulo en PR3, mismo criterio que `EmailModule` en `AuthModule`); `UsersModule` y
 * `AcademicoModule` exportan `UsersService`/`MatriculasService` respectivamente (D1) — se importan
 * en vez de redeclarar esos providers.
 *
 * `PrismaService` SÍ se redeclara en `providers` (corrección PR2, spec "Idempotencia por fila
 * reutilizando los servicios existentes"): `ImportacionService` necesita abrir su propia
 * `prisma.$transaction` por fila para compartir un mismo `tx` entre `UsersService.crearIdempotente()`
 * y `MatriculasService.crearIdempotente()` (MUST "misma transacción por fila"). Una segunda
 * instancia de `PrismaClient` no rompe la atomicidad: el `tx: Prisma.TransactionClient` que abre
 * viaja explícito como parámetro a ambos servicios, que lo usan en vez de su propio `this.prisma`
 * cuando llega (mismo contrato ya vigente de `txExterno` en ambos `crearIdempotente()`).
 *
 * `redisProvider` se declara en `providers` desde PR2 aunque el reporte de errores en Redis (D4,
 * `SETEX importacion:errores:{id}`) recién se consume en PR3 — mismo criterio que `UsersModule`/
 * `AcademicoModule`: no reabrir este módulo para agregar un provider en el PR siguiente. Ningún
 * provider abre conexión al instanciarse (`redisProvider` con `lazyConnect: true`), así que
 * `src/openapi.ts` sigue extrayendo el contrato sin Postgres ni Redis vivos (gotcha D1 de
 * `system-scaffolding`).
 *
 * DESVIACIÓN declarada frente a design.md (tarea 2.7): este módulo NO se registra todavía en
 * `apps/backend/src/app.module.ts` — eso es tarea 3.4 (PR3). Mantenerlo fuera de `AppModule`
 * aísla el rollback de este PR: revertir `apps/backend/src/importacion/*` no toca ninguna ruta
 * activa (design.md "Rollback Plan").
 */
@Module({
  imports: [AuthModule, AuditoriaModule, UsersModule, AcademicoModule],
  controllers: [ImportacionController],
  providers: [redisProvider, PrismaService, ImportacionService],
})
export class ImportacionModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(ImportacionController);
  }
}
