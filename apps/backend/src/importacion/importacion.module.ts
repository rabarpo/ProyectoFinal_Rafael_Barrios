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
 * (consumido desde PR3 para el evento agregado `PADRON_IMPORTADO`, D6); `UsersModule` y
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
 * `redisProvider` se declara en `providers` desde PR2; PR3 lo consume para el reporte de errores
 * en Redis (D4, `SETEX importacion:errores:{id}`). Ningún provider abre conexión al instanciarse
 * (`redisProvider` con `lazyConnect: true`), así que `src/openapi.ts` sigue extrayendo el
 * contrato sin Postgres ni Redis vivos (gotcha D1 de `system-scaffolding`).
 *
 * PR3 (tarea 3.4) registra este módulo en `apps/backend/src/app.module.ts` — cambio aditivo puro
 * (design.md "Rollback Plan": revertir es quitar `ImportacionModule` de `AppModule`, sin tocar
 * ninguna ruta previa).
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
