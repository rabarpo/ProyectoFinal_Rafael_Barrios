import { Module } from '@nestjs/common';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

/**
 * administracion-usuarios-apoderados, PR1 (design.md D3, tareas 1.2-1.4). `imports: [AuthModule,
 * AuditoriaModule]`: `AuthModule` resuelve `AuthGuard`/`RolesGuard`/`SessionService` (exportado en
 * la tarea 1.1), `AuditoriaModule` resuelve `AuditoriaService`. PR1 solo deja el wiring y
 * `UsersService` con `crear()`/`crearIdempotente()` — sin controladores todavía (fuera de alcance
 * explícito de PR1).
 *
 * Deviación declarada frente al snippet literal de la tarea 1.2: el diseño describe
 * `implements NestModule` aplicando `cookieParser()` a `UsersController`/`ApoderadosController`
 * (D6 de `auth-server-sessions`, nunca en `main.ts`), pero esos controladores no existen en PR1.
 * `consumer.apply(cookieParser()).forRoutes(...)` exige al menos un controlador/ruta como
 * argumento, así que no hay nada válido a lo que enrutar todavía. Este módulo pasa a
 * `implements NestModule` en PR2, cuando `UsersController`/`ApoderadosController` existan — mismo
 * criterio D6, sin cambios de comportamiento hasta entonces (`UsersModule` no expone ninguna ruta
 * en PR1, así que no hay ningún handler que dependa de `request.cookies`).
 *
 * Ningún provider abre conexión al instanciarse (`PrismaService` sin `$connect()` en
 * `onModuleInit`), así que `src/openapi.ts` sigue extrayendo el contrato sin Postgres ni Redis
 * vivos (gotcha D1 de system-scaffolding).
 */
@Module({
  imports: [AuthModule, AuditoriaModule],
  providers: [PrismaService, UsersService],
})
export class UsersModule {}
