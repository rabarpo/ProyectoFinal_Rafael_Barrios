import { Module } from '@nestjs/common';
import { AcademicoModule } from './academico/academico.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { ImportacionModule } from './importacion/importacion.module';
import { SystemPingModule } from './system-ping/system-ping.module';
import { UsersModule } from './users/users.module';

// importacion-excel, PR3 (design.md "Migration / Rollout", tarea 3.4). `ImportacionModule` se
// registra al final de la lista, mismo criterio de orden que los módulos de dominio previos
// (`UsersModule`, `AcademicoModule`) — cambio aditivo puro (design.md "Rollback Plan": revertir
// esto es quitar una línea, sin tocar rutas existentes).
@Module({
  imports: [
    HealthModule,
    SystemPingModule,
    AuditoriaModule,
    AuthModule,
    UsersModule,
    AcademicoModule,
    ImportacionModule,
  ],
})
export class AppModule {}
