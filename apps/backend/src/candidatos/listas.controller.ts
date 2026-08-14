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
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiCookieAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import {
  ArchivoTamanioExcedidoFilter,
  TAMANIO_MAXIMO_PLAN_TRABAJO_BYTES,
  filtroPlanTrabajo,
} from './archivos';
import type { ArchivoMulter } from './archivos';
import { ActualizarEstadoListaDto } from './dto/actualizar-estado-lista.dto';
import { ActualizarListaDto } from './dto/actualizar-lista.dto';
import { CrearListaDto } from './dto/crear-lista.dto';
import { ListarListasQuery } from './dto/listar-listas.query';
import { ListaRespuestaDto } from './dto/lista-respuesta.dto';
import { PlanTrabajoRespuestaDto } from './dto/plan-trabajo-respuesta.dto';
import { ListasService } from './listas.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

interface RespuestaConCabeceras {
  set(cabeceras: Record<string, string>): void;
}

/**
 * candidatos-listas-opciones-consulta, PR2 (design.md D5, "Contratos HTTP", tarea 5.7).
 * `@Roles('administrador', 'director', 'comite')` a nivel de clase (D5 de este change). Rutas
 * estáticas antes de `:id` (gotcha de enrutamiento de Nest, D4 de #11) — este controlador no
 * declara ninguna ruta estática de nivel superior, así que no aplica más allá de las rutas del
 * subrecurso `:id/plan-trabajo`, que Nest resuelve sin ambigüedad frente a `:id`.
 */
@ApiTags('listas')
@ApiCookieAuth()
@Controller('listas')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director', 'comite')
export class ListasController {
  constructor(private readonly listasService: ListasService) {}

  @Post()
  @ApiOperation({ summary: 'Crea una Lista acotada a un ProcesoElectoral existente' })
  @ApiResponse({ status: 201, description: 'Lista creada', type: ListaRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido' })
  @ApiResponse({ status: 409, description: 'ProcesoElectoral inexistente o número duplicado' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  async crear(@Body() dto: CrearListaDto, @Req() req: RequestConUsuario): Promise<ListaRespuestaDto> {
    return this.listasService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista Listas, con filtro opcional por proceso_id y estado' })
  @ApiResponse({ status: 200, description: 'Listado de listas', type: [ListaRespuestaDto] })
  @ApiResponse({ status: 400, description: 'Filtro malformado' })
  async listar(@Query() query: ListarListasQuery): Promise<ListaRespuestaDto[]> {
    return this.listasService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta una Lista por id' })
  @ApiResponse({ status: 200, description: 'Lista encontrada', type: ListaRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  async detalle(@Param('id', ParseUUIDPipe) id: string): Promise<ListaRespuestaDto> {
    return this.listasService.detalle(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita los datos de una Lista (nunca su ProcesoElectoral)' })
  @ApiResponse({ status: 200, description: 'Lista actualizada', type: ListaRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  @ApiResponse({ status: 409, description: 'Número duplicado' })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarListaDto,
    @Req() req: RequestConUsuario,
  ): Promise<ListaRespuestaDto> {
    return this.listasService.actualizar(id, dto, req.usuario!.userId);
  }

  @Patch(':id/estado')
  @ApiOperation({ summary: 'Da de baja o reactiva una Lista, permitido en cualquier estado de Proceso' })
  @ApiResponse({ status: 200, description: 'Estado actualizado', type: ListaRespuestaDto })
  @ApiResponse({ status: 400, description: 'estado fuera de {activo, baja}' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  async cambiarEstado(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarEstadoListaDto,
    @Req() req: RequestConUsuario,
  ): Promise<ListaRespuestaDto> {
    return this.listasService.cambiarEstado(id, dto.estado, req.usuario!.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente una Lista sin Voto/Candidato dependiente' })
  @ApiResponse({ status: 204, description: 'Lista eliminada' })
  @ApiResponse({ status: 409, description: 'Existe Voto o Candidato dependiente' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestConUsuario): Promise<void> {
    await this.listasService.eliminar(id, req.usuario!.userId);
  }

  @Put(':id/plan-trabajo')
  @ApiConsumes('multipart/form-data')
  @UseFilters(ArchivoTamanioExcedidoFilter)
  @UseInterceptors(
    FileInterceptor('plan_trabajo', {
      fileFilter: filtroPlanTrabajo,
      limits: { fileSize: TAMANIO_MAXIMO_PLAN_TRABAJO_BYTES },
    }),
  )
  @ApiOperation({ summary: 'Sube o reemplaza el plan de trabajo de una Lista (PDF, máximo 5 MB)' })
  @ApiResponse({ status: 200, description: 'Plan de trabajo persistido', type: PlanTrabajoRespuestaDto })
  @ApiResponse({ status: 400, description: 'Formato no permitido, archivo vacío o excede 5 MB' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  async subirPlanTrabajo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() archivo: ArchivoMulter | undefined,
    @Req() req: RequestConUsuario,
  ): Promise<PlanTrabajoRespuestaDto> {
    return this.listasService.subirPlanTrabajo(id, archivo, req.usuario!.userId);
  }

  @Get(':id/plan-trabajo')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Descarga el plan de trabajo de una Lista' })
  @ApiResponse({ status: 200, description: 'PDF del plan de trabajo' })
  @ApiResponse({ status: 404, description: 'Lista sin plan de trabajo almacenado' })
  async obtenerPlanTrabajo(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: RespuestaConCabeceras,
  ): Promise<StreamableFile> {
    const planTrabajo = await this.listasService.obtenerPlanTrabajo(id);

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Content-Disposition': `attachment; filename="${planTrabajo.nombre}"`,
    });

    return new StreamableFile(planTrabajo.buffer, { type: planTrabajo.mime });
  }

  @Delete(':id/plan-trabajo')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina el plan de trabajo de una Lista, sin afectar el resto de sus datos' })
  @ApiResponse({ status: 204, description: 'Plan de trabajo eliminado' })
  @ApiResponse({ status: 404, description: 'Lista no encontrada' })
  async eliminarPlanTrabajo(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<void> {
    await this.listasService.eliminarPlanTrabajo(id, req.usuario!.userId);
  }
}
