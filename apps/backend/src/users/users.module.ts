import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

/**
 * administracion-usuarios-apoderados, PR2 (design.md D3, tareas 1.2/7.10). `imports: [AuthModule,
 * AuditoriaModule]`: `AuthModule` resuelve `AuthGuard`/`RolesGuard`/`SessionService` (exportado en
 * PR1, tarea 1.1), `AuditoriaModule` resuelve `AuditoriaService`. `SessionService` NO se
 * redeclara en `providers` — se resuelve vía el `exports` de `AuthModule`; redeclararlo abriría un
 * segundo cliente Redis y una segunda instancia de sesiones (design.md D3, descartado).
 *
 * `UsersModule` pasa a `implements NestModule` en esta fase (PR2), completando la DESVIACIÓN
 * declarada en PR1 (tarea 1.2): `UsersController` ya existe, así que `cookieParser()` tiene una
 * ruta válida a la que enrutarse (D6 de `auth-server-sessions`, nunca en `main.ts`); sin esta
 * línea `request.cookies` sería `undefined` y toda ruta de este módulo respondería `401`.
 * `ApoderadosController` (PR3) se agrega a `forRoutes(...)` cuando exista — dos instancias de
 * `cookie-parser` sobre rutas disjuntas no interfieren entre sí (design.md D3).
 *
 * Ningún provider abre conexión al instanciarse, así que `src/openapi.ts` sigue extrayendo el
 * contrato sin Postgres ni Redis vivos (gotcha D1 de system-scaffolding).
 */
@Module({
  imports: [AuthModule, AuditoriaModule],
  controllers: [UsersController],
  providers: [PrismaService, UsersService],
})
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(UsersController);
  }
}
