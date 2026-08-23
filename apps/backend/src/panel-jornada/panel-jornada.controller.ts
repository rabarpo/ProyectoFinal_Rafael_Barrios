import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { AvanceAulasDto } from './dto/avance-aulas.dto';
import { InstitucionDto } from './dto/institucion.dto';
import { ProyeccionDto } from './dto/proyeccion.dto';
import { ResumenJornadaDto } from './dto/resumen-jornada.dto';
import { VotosPorHoraDto } from './dto/votos-por-hora.dto';
import { PanelJornadaService } from './panel-jornada.service';

/**
 * dashboard-panel-jornada (Backlog #20, PR1; design.md D1/D2, tarea 4.1). Controlador HERMANO de
 * `ProcesosController`/`ActasController` (D1), no un método más — patrón literal de
 * `ActasController`: `@UseGuards(AuthGuard, RolesGuard)` + `@Roles(...)` a nivel de clase, los 3
 * roles operativos de jornada (`administrador`, `director`, `comite`). 5 rutas `GET` (D2): una
 * sola agregación no mezcla datos institucionales (sin proceso) con datos por proceso.
 */
@ApiTags('panel-jornada')
@ApiCookieAuth()
@Controller('panel-jornada')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director', 'comite')
export class PanelJornadaController {
  constructor(private readonly panelJornadaService: PanelJornadaService) {}

  @Get('institucion')
  @ApiOperation({ summary: 'Conteo institucional de estudiantes y vínculos apoderado-estudiante, sin proceso' })
  @ApiResponse({ status: 200, description: 'Conteo institucional', type: InstitucionDto })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  async institucion(): Promise<InstitucionDto> {
    return this.panelJornadaService.institucion();
  }

  @Get('procesos/:id/resumen')
  @ApiOperation({ summary: 'Resumen de jornada de un proceso: participación y, según ocultar_resultados, desglose (D6)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Resumen de jornada', type: ResumenJornadaDto })
  @ApiResponse({ status: 400, description: ':id no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Proceso inexistente' })
  @ApiResponse({ status: 409, description: 'Proceso en estado borrador (ESTADO_INVALIDO, D11)' })
  async resumen(@Param('id', ParseUUIDPipe) id: string): Promise<ResumenJornadaDto> {
    return this.panelJornadaService.resumen(id);
  }

  @Get('procesos/:id/votos-por-hora')
  @ApiOperation({ summary: 'Serie de votos por hora del proceso, sin franjas vacías omitidas' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Votos por hora', type: VotosPorHoraDto })
  @ApiResponse({ status: 400, description: ':id no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Proceso inexistente' })
  @ApiResponse({ status: 409, description: 'Proceso en estado borrador (ESTADO_INVALIDO)' })
  async votosPorHora(@Param('id', ParseUUIDPipe) id: string): Promise<VotosPorHoraDto> {
    return this.panelJornadaService.votosPorHora(id);
  }

  @Get('procesos/:id/avance-aulas')
  @ApiOperation({ summary: 'Avance por aula del proceso, con umbral relativo de rezago (D7)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Avance por aula', type: AvanceAulasDto })
  @ApiResponse({ status: 400, description: ':id no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Proceso inexistente' })
  @ApiResponse({ status: 409, description: 'Proceso en estado borrador (ESTADO_INVALIDO)' })
  async avanceAulas(@Param('id', ParseUUIDPipe) id: string): Promise<AvanceAulasDto> {
    return this.panelJornadaService.avanceAulas(id);
  }

  @Get('procesos/:id/proyeccion')
  @ApiOperation({ summary: 'Payload de proyección (kiosco), sin desglose por candidato bajo ninguna circunstancia (D8)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Proyección', type: ProyeccionDto })
  @ApiResponse({ status: 400, description: ':id no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Proceso inexistente' })
  @ApiResponse({ status: 409, description: 'Proceso en estado borrador (ESTADO_INVALIDO)' })
  async proyeccion(@Param('id', ParseUUIDPipe) id: string): Promise<ProyeccionDto> {
    return this.panelJornadaService.proyeccion(id);
  }
}
