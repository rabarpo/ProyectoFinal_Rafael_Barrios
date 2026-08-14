import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { CandidatosController } from './candidatos.controller';
import { CandidatosService } from './candidatos.service';
import { ListasController } from './listas.controller';
import { ListasService } from './listas.service';
import { OpcionesController } from './opciones.controller';
import { OpcionesService } from './opciones.service';

/**
 * candidatos-listas-opciones-consulta, PR2/PR3/PR4 (design.md "Enfoque técnico"/"Cambios de
 * archivos", tareas 4.1/8.7/11.9). `imports: [AuthModule, AuditoriaModule]`: `AuthModule` resuelve
 * `AuthGuard`/`RolesGuard`, `AuditoriaModule` resuelve `AuditoriaService`. `ListasController` desde
 * PR2, `OpcionesController` desde PR3, `CandidatosController` se suma en PR4 (design.md "Enfoque
 * técnico": un único `CandidatosModule` con tres controladores).
 *
 * `cookie-parser` como middleware del propio módulo, mismo criterio que
 * `AcademicoModule`/`ProcesosModule`. Ningún provider abre conexión al instanciarse, así que
 * `pnpm openapi:extract` sigue corriendo sin Postgres ni Redis vivos tras registrar este módulo.
 */
@Module({
  imports: [AuthModule, AuditoriaModule],
  controllers: [ListasController, OpcionesController, CandidatosController],
  providers: [PrismaService, ListasService, OpcionesService, CandidatosService],
})
export class CandidatosModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(ListasController, OpcionesController, CandidatosController);
  }
}
