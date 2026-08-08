import type { MiddlewareConsumer, NestModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { PrismaService } from '../prisma/prisma.service';
import { redisProvider } from '../redis/redis.provider';
import { AuditoriaModule } from '../auditoria/auditoria.module';
import { EmailModule } from '../email/email.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { googleOauthClientProvider } from './google-oauth.provider';
import { GoogleOauthService } from './google-oauth.service';
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
 *
 * google-oauth-y-recuperacion, PR2 (design.md, tarea 8.3): `EmailModule` se importa ahora aunque
 * PR2 todavía no lo consume — PR3 (recovery flow) corre apilado sobre esta misma rama y lo
 * necesita; importar el módulo (sin inyectar `EMAIL_SENDER` en ningún provider de PR2) no abre
 * ninguna conexión, así que el gotcha de `src/openapi.ts` sigue intacto (D8).
 * `googleOauthClientProvider` tampoco abre red al instanciarse (D2) — mismo criterio.
 */
@Module({
  imports: [AuditoriaModule, EmailModule],
  controllers: [AuthController],
  providers: [
    PrismaService,
    redisProvider,
    SessionService,
    PasswordService,
    AuthService,
    googleOauthClientProvider,
    GoogleOauthService,
  ],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(cookieParser()).forRoutes(AuthController);
  }
}
