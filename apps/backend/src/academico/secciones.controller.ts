import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ActualizarSeccionDto } from './dto/actualizar-seccion.dto';
import { CrearSeccionDto } from './dto/crear-seccion.dto';
import { ListarSeccionesQuery } from './dto/listar-secciones.query';
import { SeccionRespuestaDto } from './dto/seccion-respuesta.dto';
import { SeccionesService } from './secciones.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-academica, PR5 (design.md D2/D3/D5, tarea 17.11). `@Roles('administrador',
 * 'director')` a nivel de clase (D3). `ParseUUIDPipe` en `:id`.
 */
@ApiTags('secciones')
@ApiCookieAuth()
@Controller('secciones')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class SeccionesController {
  constructor(private readonly seccionesService: SeccionesService) {}

  @Post()
  @ApiOperation({ summary: 'Crea una Seccion acotada a un Grado y un AnioEscolar existentes' })
  @ApiResponse({ status: 201, description: 'Seccion creada', type: SeccionRespuestaDto })
  @ApiResponse({ status: 409, description: 'Grado/AnioEscolar inexistente o nombre duplicado dentro de la combinación' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async crear(
    @Body() dto: CrearSeccionDto,
    @Req() req: RequestConUsuario,
  ): Promise<SeccionRespuestaDto> {
    return this.seccionesService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista secciones, con filtro opcional por grado_id y anio_escolar_id' })
  @ApiResponse({ status: 200, description: 'Listado de secciones', type: [SeccionRespuestaDto] })
  @ApiResponse({ status: 400, description: 'grado_id/anio_escolar_id malformado' })
  async listar(@Query() query: ListarSeccionesQuery): Promise<SeccionRespuestaDto[]> {
    return this.seccionesService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta una Seccion por id' })
  @ApiResponse({ status: 200, description: 'Seccion encontrada', type: SeccionRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'Seccion no encontrada' })
  async obtenerPorId(@Param('id', ParseUUIDPipe) id: string): Promise<SeccionRespuestaDto> {
    return this.seccionesService.obtenerPorId(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza el nombre de una Seccion (nunca su Grado/AnioEscolar)' })
  @ApiResponse({ status: 200, description: 'Seccion actualizada', type: SeccionRespuestaDto })
  @ApiResponse({ status: 409, description: 'Nombre duplicado dentro de la combinación' })
  @ApiResponse({ status: 404, description: 'Seccion no encontrada' })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarSeccionDto,
    @Req() req: RequestConUsuario,
  ): Promise<SeccionRespuestaDto> {
    return this.seccionesService.actualizar(id, dto, req.usuario!.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente una Seccion sin Aula dependiente' })
  @ApiResponse({ status: 204, description: 'Seccion eliminada' })
  @ApiResponse({ status: 409, description: 'Existe Aula dependiente' })
  @ApiResponse({ status: 404, description: 'Seccion no encontrada' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<void> {
    await this.seccionesService.eliminar(id, req.usuario!.userId);
  }
}
