import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ActualizarNivelDto } from './dto/actualizar-nivel.dto';
import { CrearNivelDto } from './dto/crear-nivel.dto';
import { NivelRespuestaDto } from './dto/nivel-respuesta.dto';
import { NivelesService } from './niveles.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-academica, PR4 (design.md D2/D3/D5, tarea 13.10). `@Roles('administrador',
 * 'director')` a nivel de clase (D3) — mismo precedente que `AniosEscolaresController`.
 * `ParseUUIDPipe` en `:id`.
 */
@ApiTags('niveles')
@ApiCookieAuth()
@Controller('niveles')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class NivelesController {
  constructor(private readonly nivelesService: NivelesService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un Nivel' })
  @ApiResponse({ status: 201, description: 'Nivel creado', type: NivelRespuestaDto })
  @ApiResponse({ status: 409, description: 'Nombre duplicado' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async crear(
    @Body() dto: CrearNivelDto,
    @Req() req: RequestConUsuario,
  ): Promise<NivelRespuestaDto> {
    return this.nivelesService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista niveles' })
  @ApiResponse({ status: 200, description: 'Listado de niveles', type: [NivelRespuestaDto] })
  async listar(): Promise<NivelRespuestaDto[]> {
    return this.nivelesService.listar();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un Nivel por id' })
  @ApiResponse({ status: 200, description: 'Nivel encontrado', type: NivelRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'Nivel no encontrado' })
  async obtenerPorId(@Param('id', ParseUUIDPipe) id: string): Promise<NivelRespuestaDto> {
    return this.nivelesService.obtenerPorId(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza el nombre de un Nivel' })
  @ApiResponse({ status: 200, description: 'Nivel actualizado', type: NivelRespuestaDto })
  @ApiResponse({ status: 409, description: 'Nombre duplicado' })
  @ApiResponse({ status: 404, description: 'Nivel no encontrado' })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarNivelDto,
    @Req() req: RequestConUsuario,
  ): Promise<NivelRespuestaDto> {
    return this.nivelesService.actualizar(id, dto, req.usuario!.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente un Nivel sin Grado dependiente' })
  @ApiResponse({ status: 204, description: 'Nivel eliminado' })
  @ApiResponse({ status: 409, description: 'Existe Grado dependiente' })
  @ApiResponse({ status: 404, description: 'Nivel no encontrado' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<void> {
    await this.nivelesService.eliminar(id, req.usuario!.userId);
  }
}
