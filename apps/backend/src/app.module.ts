import { Module } from '@nestjs/common';
import { AcademicoModule } from './academico/academico.module';
import { AuditoriaModule } from './auditoria/auditoria.module';
import { AuthModule } from './auth/auth.module';
import { CandidatosModule } from './candidatos/candidatos.module';
import { ConfiguracionLecturaModule } from './configuracion/configuracion-lectura.module';
import { ConfiguracionModule } from './configuracion/configuracion.module';
import { HealthModule } from './health/health.module';
import { ImportacionModule } from './importacion/importacion.module';
import { PanelJornadaModule } from './panel-jornada/panel-jornada.module';
import { ProcesosModule } from './procesos/procesos.module';
import { ReportesModule } from './reportes/reportes.module';
import { SystemPingModule } from './system-ping/system-ping.module';
import { UsersModule } from './users/users.module';
import { VotosModule } from './votos/votos.module';

// importacion-excel, PR3 (design.md "Migration / Rollout", tarea 3.4). `ImportacionModule` se
// registra al final de la lista, mismo criterio de orden que los módulos de dominio previos
// (`UsersModule`, `AcademicoModule`) — cambio aditivo puro (design.md "Rollback Plan": revertir
// esto es quitar una línea, sin tocar rutas existentes).
//
// configuracion-general, PR1 (design.md "Technical Approach", tarea 1.9). `ConfiguracionLecturaModule`
// se registra ahora (sin controller, sin rutas nuevas) como guarda de regresión permanente: sin
// controller ni conexión abierta al instanciarse, `pnpm openapi:extract` sigue corriendo sin
// Postgres ni Redis vivos.
//
// configuracion-general, PR2 (design.md "File Changes", tarea 2.12). `ConfiguracionModule`
// (controller + escritura auditada) se registra al final, mismo criterio de orden que
// `ImportacionModule`.
//
// administracion-procesos-electorales, PR5 (design.md "Cambios de archivos", tarea 12.4).
// `ProcesosModule` se registra al final de la lista, mismo criterio de orden que los módulos de
// dominio previos — cambio aditivo puro, sin tocar rutas existentes.
//
// candidatos-listas-opciones-consulta, PR2 (design.md "Cambios de archivos", tarea 4.4).
// `CandidatosModule` se registra al final, mismo criterio de orden — cambio aditivo puro.
//
// vote-casting, PR1 (design.md "Cambios de archivos", tarea 1.3). `VotosModule` se registra al
// final de la lista, mismo criterio de orden que los módulos de dominio previos — cambio aditivo
// puro, sin tocar rutas existentes. Es el primer módulo orientado al VOTANTE (D1), no a la
// gestión.
//
// dashboard-panel-jornada, PR1 (Backlog #20; design.md "Cambios de archivos", tarea 4.3).
// `PanelJornadaModule` se registra al final de la lista, mismo criterio de orden — cambio aditivo
// puro, sin tocar rutas existentes; `/panel-jornada/*` no colisiona con ningún prefijo previo.
//
// reportes-y-exportaciones, PR3 (Backlog #18; design.md D1, "Cambios de archivos"). `ReportesModule`
// se registra al final de la lista, mismo criterio de orden — cambio aditivo puro; `/reportes/*` no
// colisiona con ningún prefijo previo.
@Module({
  imports: [
    HealthModule,
    SystemPingModule,
    AuditoriaModule,
    AuthModule,
    UsersModule,
    AcademicoModule,
    ImportacionModule,
    ConfiguracionLecturaModule,
    ConfiguracionModule,
    ProcesosModule,
    CandidatosModule,
    VotosModule,
    PanelJornadaModule,
    ReportesModule,
  ],
})
export class AppModule {}
