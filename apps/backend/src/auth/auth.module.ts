import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { PrismaService } from '../prisma/prisma.service';
import { redisProvider } from '../redis/redis.provider';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

/**
 * auth-server-sessions, PR3 (design.md, "Enfoque técnico"). Sigue el precedente exacto de
 * `HealthModule`: declara `PrismaService`/`redisProvider` en sus propios `providers` en vez de
 * asumir un `DatabaseModule`/`RedisModule` global que no existe todavía. Ningún provider abre
 * conexión en su constructor (`PrismaService` sin `$connect()` en `onModuleInit`, `redisProvider`
 * con `lazyConnect: true`), así que `src/openapi.ts` sigue extrayendo el contrato sin Postgres ni
 * Redis vivos (R10/D6/D9).
 *
 * `cookie-parser` se registra como middleware del propio módulo (D6), no en `main.ts` — así
 * funciona igual bajo el bootstrap real y bajo `Test.createTestingModule` de los e2e.
 */
@Module({
  imports: [AuditoriaModule],
  controllers: [AuthController],
  providers: [PrismaService, redisProvider, SessionService, PasswordService, AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(AuthController);
  }
}
