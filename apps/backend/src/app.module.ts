import { Module } from '@nestjs/common';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { SystemPingModule } from './system-ping/system-ping.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [HealthModule, SystemPingModule, AuditoriaModule, AuthModule, UsersModule],
})
export class AppModule {}
