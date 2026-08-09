import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionLecturaService } from './configuracion-lectura.service';

/**
 * configuracion-general, PR1 (design.md "Technical Approach", tarea 1.8). Módulo de SOLO LECTURA,
 * sin controller: la mitad de abajo del corte de dos capas descrito en design.md que evita el
 * ciclo de DI entre `AuthModule`/`EmailModule` y el `ConfiguracionModule` (PR2, controller +
 * `AuditoriaModule` + `AuthModule` + `UsersModule`) — importar el módulo de escritura desde
 * `AuthModule` cerraría un ciclo (`ConfiguracionModule` ya importa `AuthModule`).
 *
 * Deliberadamente NO importa `AuthModule` ni `AuditoriaModule`: cualquiera de los dos reintroduce
 * el ciclo que este módulo existe para romper.
 *
 * `providers: [PrismaService, ...]` sigue el mismo precedente que `HealthModule`/`AuthModule`
 * (sin `DatabaseModule` global) — ningún provider abre conexión al instanciarse, así que
 * `pnpm openapi:extract` sigue corriendo sin Postgres vivo tras registrar este módulo en
 * `AppModule` (tarea 1.9).
 */
@Module({
  providers: [PrismaService, ConfiguracionLecturaService],
  exports: [ConfiguracionLecturaService],
})
export class ConfiguracionLecturaModule {}
