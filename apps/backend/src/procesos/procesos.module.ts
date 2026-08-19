import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { ConfiguracionLecturaModule } from '../configuracion/configuracion-lectura.module';
import { PrismaService } from '../prisma/prisma.service';
import { redisProvider } from '../redis/redis.provider';
import { ActasController } from './actas.controller';
import { ActasService } from './actas.service';
import { PadronService } from './padron.service';
import { ProcesosController } from './procesos.controller';
import { ProcesosService } from './procesos.service';
import { ResultadosController } from './resultados.controller';
import { ResultadosService } from './resultados.service';

/**
 * administracion-procesos-electorales, PR5 (design.md "Enfoque técnico"/"Cambios de archivos",
 * tareas 12.3-12.4). `imports: [AuthModule, AuditoriaModule, ConfiguracionLecturaModule]`:
 * `AuthModule` resuelve `AuthGuard`/`RolesGuard`/`SessionService`, `AuditoriaModule` resuelve
 * `AuditoriaService` (`PadronService.calcular()` no audita, D6 — pero `ProcesosService`, PR6, sí
 * la usa para `PROCESO_CREADO` dentro de la `$transaction` de `crear()`),
 * `ConfiguracionLecturaModule` resuelve `ConfiguracionLecturaService.anioEscolarActivoId()` (D2b).
 *
 * `cookie-parser` se registra como middleware del propio módulo (mismo criterio que
 * `AcademicoModule`/`AuthModule`), nunca en `main.ts`.
 *
 * Ningún provider abre conexión al instanciarse, así que `pnpm openapi:extract` sigue corriendo
 * sin Postgres ni Redis vivos tras registrar este módulo en `AppModule` (tarea 12.4).
 *
 * resultados-en-vivo (#16, PR1; design.md D1, tarea 4.2). `ResultadosController` va **primero**
 * en `controllers: []` (rutas estáticas primero, mismo criterio ya documentado en
 * `procesos.controller.ts`): `/procesos/:id/resultados` (3 segmentos) nunca choca con
 * `/procesos/:id` (2 segmentos), pero el orden se mantiene por consistencia. `redisProvider` se
 * suma porque `ResultadosService` es el primer consumidor de `REDIS_CLIENT` de este módulo
 * (`lazyConnect: true`, no abre conexión al instanciarse).
 *
 * cierre-escrutinio-actas (#17, PR4; design.md D13, tarea 16.7). `ActasController` va antes de
 * `ProcesosController` por el mismo criterio de rutas estáticas primero que `ResultadosController`:
 * `/procesos/:id/actas(/:tipo/pdf)` (3-4 segmentos) nunca choca con `/procesos/:id` (2 segmentos),
 * pero el orden se mantiene por consistencia con el resto del módulo.
 */
@Module({
  imports: [AuthModule, AuditoriaModule, ConfiguracionLecturaModule],
  controllers: [ResultadosController, ActasController, ProcesosController],
  providers: [PrismaService, redisProvider, PadronService, ProcesosService, ResultadosService, ActasService],
})
export class ProcesosModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(ProcesosController, ResultadosController, ActasController);
  }
}
