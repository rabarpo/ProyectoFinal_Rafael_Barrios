import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ActualizarProcesoDto } from './dto/actualizar-proceso.dto';
import { CrearProcesoDto } from './dto/crear-proceso.dto';
import { ListarProcesosQueryDto } from './dto/listar-procesos.query';
import { PadronRespuestaDto } from './dto/padron-respuesta.dto';
import { ProcesoDetalleRespuestaDto } from './dto/proceso-detalle-respuesta.dto';
import { ProcesoRespuestaDto } from './dto/proceso-respuesta.dto';
import { SegmentacionDto } from './dto/segmentacion.dto';
import { PadronService } from './padron.service';
import { ProcesosService } from './procesos.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-procesos-electorales, PR5/PR6 (design.md "Contratos HTTP"/D4, tareas 14.1/17.8).
 * `@Roles('administrador', 'director', 'comite')` a nivel de clase (decisión 4 de la propuesta —
 * los tres roles son equivalentes). Rutas estáticas primero (D4, gotcha de enrutamiento de Nest):
 * `padron` se declara antes de `POST /` (que a su vez precede a `:id`, agregado en PR7).
 */
@ApiTags('procesos')
@ApiCookieAuth()
@Controller('procesos')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director', 'comite')
export class ProcesosController {
  constructor(
    private readonly padronService: PadronService,
    private readonly procesosService: ProcesosService,
  ) {}

  @Post('padron')
  @HttpCode(200)
  @ApiOperation({ summary: 'Calcula el padrón en vivo para una segmentación, sin persistir nada' })
  @ApiBody({ type: SegmentacionDto })
  @ApiResponse({ status: 200, description: 'Padrón calculado', type: PadronRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido' })
  @ApiResponse({ status: 409, description: 'Referencia inexistente, segmentación inválida o sin año escolar activo' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  async padron(@Body() dto: SegmentacionDto): Promise<PadronRespuestaDto> {
    return this.padronService.calcular(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un ProcesoElectoral en borrador, con lote de ProcesoAula (D3/D6)' })
  @ApiBody({ type: CrearProcesoDto })
  @ApiResponse({ status: 201, description: 'Proceso creado', type: ProcesoRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido' })
  @ApiResponse({
    status: 409,
    description: 'Referencia inexistente, segmentación inválida, sin elegibles o sin año escolar activo',
  })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  async crear(
    @Body() dto: CrearProcesoDto,
    @Req() req: RequestConUsuario,
  ): Promise<ProcesoRespuestaDto> {
    return this.procesosService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista procesos electorales, filtrable por estado y tipo' })
  @ApiQuery({
    name: 'estado',
    required: false,
    enum: ['borrador', 'abierto', 'cerrado', 'acta_emitida'],
  })
  @ApiQuery({
    name: 'tipo',
    required: false,
    enum: ['municipio', 'representante_aula', 'padres', 'consulta'],
  })
  @ApiResponse({ status: 200, description: 'Listado', type: [ProcesoRespuestaDto] })
  @ApiResponse({ status: 400, description: 'Campo inválido (filtro fuera del enum)' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  async listar(@Query() query: ListarProcesosQueryDto): Promise<ProcesoRespuestaDto[]> {
    return this.procesosService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un proceso electoral, incluido su ProcesoAula[]' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Detalle', type: ProcesoDetalleRespuestaDto })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Proceso inexistente' })
  async detalle(@Param('id', ParseUUIDPipe) id: string): Promise<ProcesoDetalleRespuestaDto> {
    return this.procesosService.detalle(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita un proceso en borrador, sin límite de reintentos (D3)' })
  @ApiParam({ name: 'id', type: String })
  @ApiBody({ type: ActualizarProcesoDto })
  @ApiResponse({ status: 200, description: 'Proceso actualizado', type: ProcesoRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido' })
  @ApiResponse({
    status: 409,
    description: 'Referencia inexistente, segmentación inválida, sin elegibles, proceso no editable o sin año escolar activo',
  })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Proceso inexistente' })
  async editar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarProcesoDto,
    @Req() req: RequestConUsuario,
  ): Promise<ProcesoRespuestaDto> {
    return this.procesosService.editar(id, dto, req.usuario!.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente un proceso en borrador (cascada a ProcesoAula)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 204, description: 'Proceso eliminado' })
  @ApiResponse({ status: 409, description: 'Proceso no editable (estado != borrador)' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Proceso inexistente' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<void> {
    await this.procesosService.eliminar(id, req.usuario!.userId);
  }
}
