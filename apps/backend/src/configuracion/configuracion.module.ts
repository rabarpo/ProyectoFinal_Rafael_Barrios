import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { UsersModule } from '../users/users.module';
import { ConfiguracionLecturaModule } from './configuracion-lectura.module';
import { ConfiguracionController } from './configuracion.controller';
import { ConfiguracionService } from './configuracion.service';

/**
 * configuracion-general, PR2 (design.md "Technical Approach", tarea 2.12). Mitad de ARRIBA del
 * corte de dos capas: importa `ConfiguracionLecturaModule` (PR1) para reusar
 * `ConfiguracionLecturaService.obtener()` en `ConfiguracionService.obtener()`, en vez de
 * redeclarar el provider. `AuthModule` resuelve `AuthGuard`/`RolesGuard`; `AuditoriaModule`
 * resuelve `AuditoriaService`; `UsersModule` resuelve `UsersService` para `GET
 * /configuracion/comite` (reusa el listado existente, sin tabla nueva — spec "Listado de
 * integrantes del comité").
 *
 * Este módulo SÍ puede importar `AuthModule`/`AuditoriaModule`/`UsersModule` porque, a diferencia
 * de `ConfiguracionLecturaModule`, no es importado de vuelta por ninguno de ellos — así el grafo de
 * DI queda acíclico (design.md "Technical Approach").
 *
 * `implements NestModule` aplica `cookieParser()` a `ConfiguracionController` — mismo criterio
 * (D6 de `auth-server-sessions`) que `UsersModule`/`AcademicoModule`: sin esta línea
 * `request.cookies` sería `undefined` y las tres rutas responderían `401` siempre.
 */
@Module({
  imports: [AuthModule, AuditoriaModule, UsersModule, ConfiguracionLecturaModule],
  controllers: [ConfiguracionController],
  providers: [PrismaService, ConfiguracionService],
})
export class ConfiguracionModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(ConfiguracionController);
  }
}
