import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import type { ResultadoActivacionAnioEscolar } from './anios-escolares.service';
import { AniosEscolaresService } from './anios-escolares.service';
import { ActualizarAnioEscolarDto } from './dto/actualizar-anio-escolar.dto';
import { AnioEscolarRespuestaDto } from './dto/anio-escolar-respuesta.dto';
import { CrearAnioEscolarDto } from './dto/crear-anio-escolar.dto';
import { ListarAniosEscolaresQuery } from './dto/listar-anios-escolares.query';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-academica, PR2 (design.md D2/D3/D5, tareas 7.8/8.6). `@Roles('administrador',
 * 'director')` a nivel de clase (D3): un único guard cubre las cinco rutas de este PR (la sexta,
 * `PATCH :id/activar`, llega en PR3). `ParseUUIDPipe` en `:id` — mismo precedente que
 * `UsersController`: un id malformado nunca escapa como `500`, siempre `400`.
 */
@ApiTags('anios-escolares')
@ApiCookieAuth()
@Controller('anios-escolares')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class AniosEscolaresController {
  constructor(private readonly aniosEscolaresService: AniosEscolaresService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un AnioEscolar con activo=false' })
  @ApiResponse({ status: 201, description: 'AnioEscolar creado', type: AnioEscolarRespuestaDto })
  @ApiResponse({ status: 409, description: 'Nombre duplicado' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async crear(
    @Body() dto: CrearAnioEscolarDto,
    @Req() req: RequestConUsuario,
  ): Promise<AnioEscolarRespuestaDto> {
    return this.aniosEscolaresService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @Roles('administrador', 'director', 'comite')
  @ApiOperation({ summary: 'Lista años escolares, con filtro opcional por activo' })
  @ApiQuery({ name: 'activo', required: false, description: "'true'/'false'", type: String })
  @ApiResponse({ status: 200, description: 'Listado de años escolares', type: [AnioEscolarRespuestaDto] })
  @ApiResponse({ status: 400, description: 'Filtro activo desconocido' })
  async listar(@Query() query: ListarAniosEscolaresQuery): Promise<AnioEscolarRespuestaDto[]> {
    return this.aniosEscolaresService.listar(query);
  }

  @Get(':id')
  @Roles('administrador', 'director', 'comite')
  @ApiOperation({ summary: 'Consulta un AnioEscolar por id' })
  @ApiResponse({ status: 200, description: 'AnioEscolar encontrado', type: AnioEscolarRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'AnioEscolar no encontrado' })
  async obtenerPorId(@Param('id', ParseUUIDPipe) id: string): Promise<AnioEscolarRespuestaDto> {
    return this.aniosEscolaresService.obtenerPorId(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza el nombre de un AnioEscolar (nunca activo)' })
  @ApiResponse({ status: 200, description: 'AnioEscolar actualizado', type: AnioEscolarRespuestaDto })
  @ApiResponse({ status: 409, description: 'Nombre duplicado' })
  @ApiResponse({ status: 404, description: 'AnioEscolar no encontrado' })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarAnioEscolarDto,
    @Req() req: RequestConUsuario,
  ): Promise<AnioEscolarRespuestaDto> {
    return this.aniosEscolaresService.actualizar(id, dto, req.usuario!.userId);
  }

  @Patch(':id/activar')
  @ApiOperation({ summary: 'Activa un AnioEscolar, desactivando el previamente activo (idempotente)' })
  @ApiResponse({ status: 200, description: 'AnioEscolar activado (o ya estaba activo, cambio=false)' })
  @ApiResponse({ status: 409, description: 'Activación concurrente sobre el índice único parcial' })
  @ApiResponse({ status: 404, description: 'AnioEscolar no encontrado' })
  async activar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<ResultadoActivacionAnioEscolar> {
    return this.aniosEscolaresService.activar(id, req.usuario!.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente un AnioEscolar sin dependientes' })
  @ApiResponse({ status: 204, description: 'AnioEscolar eliminado' })
  @ApiResponse({ status: 409, description: 'Existen Seccion/Aula/Matricula/Configuracion dependientes' })
  @ApiResponse({ status: 404, description: 'AnioEscolar no encontrado' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<void> {
    await this.aniosEscolaresService.eliminar(id, req.usuario!.userId);
  }
}
