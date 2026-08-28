import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma/prisma.service';
import { NotificacionesController } from './notificaciones.controller';
import { NotificacionesService } from './notificaciones.service';

/**
 * notificaciones (backlog #19), PR6 (design.md D9, tarea 15.2). `imports: [AuthModule]` resuelve
 * `AuthGuard`/`SessionService` — sin `RolesGuard` (D9, ver `NotificacionesController`).
 * `cookie-parser` como middleware del propio módulo, mismo criterio que `VotosModule`/
 * `ProcesosModule`/`AcademicoModule`.
 */
@Module({
  imports: [AuthModule],
  controllers: [NotificacionesController],
  providers: [PrismaService, NotificacionesService],
})
export class NotificacionesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(NotificacionesController);
  }
}
