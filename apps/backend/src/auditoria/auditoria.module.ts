import { Module } from '@nestjs/common';
import { AuditoriaService } from './auditoria.service';

// append-only-audit-engine (design.md D6, tarea 5.3): módulo propio que exporta el provider,
// importado por `AppModule` (tarea 5.4) para que otros módulos de dominio puedan inyectar
// `AuditoriaService` sin repetir su registro.
@Module({
  providers: [AuditoriaService],
  exports: [AuditoriaService],
})
export class AuditoriaModule {}
