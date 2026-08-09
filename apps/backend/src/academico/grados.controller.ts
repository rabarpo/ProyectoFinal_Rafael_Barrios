import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ActualizarGradoDto } from './dto/actualizar-grado.dto';
import { CrearGradoDto } from './dto/crear-grado.dto';
import { GradoRespuestaDto } from './dto/grado-respuesta.dto';
import { ListarGradosQuery } from './dto/listar-grados.query';
import { GradosService } from './grados.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-academica, PR4 (design.md D2/D3/D5, tarea 14.10). `@Roles('administrador',
 * 'director')` a nivel de clase (D3). `ParseUUIDPipe` en `:id`.
 */
@ApiTags('grados')
@ApiCookieAuth()
@Controller('grados')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class GradosController {
  constructor(private readonly gradosService: GradosService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un Grado acotado a un Nivel existente' })
  @ApiResponse({ status: 201, description: 'Grado creado', type: GradoRespuestaDto })
  @ApiResponse({ status: 409, description: 'Nivel inexistente o nombre duplicado dentro del Nivel' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async crear(
    @Body() dto: CrearGradoDto,
    @Req() req: RequestConUsuario,
  ): Promise<GradoRespuestaDto> {
    return this.gradosService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista grados, con filtro opcional por nivel_id' })
  @ApiResponse({ status: 200, description: 'Listado de grados', type: [GradoRespuestaDto] })
  @ApiResponse({ status: 400, description: 'nivel_id malformado' })
  async listar(@Query() query: ListarGradosQuery): Promise<GradoRespuestaDto[]> {
    return this.gradosService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un Grado por id' })
  @ApiResponse({ status: 200, description: 'Grado encontrado', type: GradoRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'Grado no encontrado' })
  async obtenerPorId(@Param('id', ParseUUIDPipe) id: string): Promise<GradoRespuestaDto> {
    return this.gradosService.obtenerPorId(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza el nombre de un Grado (nunca su Nivel)' })
  @ApiResponse({ status: 200, description: 'Grado actualizado', type: GradoRespuestaDto })
  @ApiResponse({ status: 409, description: 'Nombre duplicado dentro del Nivel' })
  @ApiResponse({ status: 404, description: 'Grado no encontrado' })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarGradoDto,
    @Req() req: RequestConUsuario,
  ): Promise<GradoRespuestaDto> {
    return this.gradosService.actualizar(id, dto, req.usuario!.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente un Grado sin Seccion/Aula dependiente' })
  @ApiResponse({ status: 204, description: 'Grado eliminado' })
  @ApiResponse({ status: 409, description: 'Existe Seccion o Aula dependiente' })
  @ApiResponse({ status: 404, description: 'Grado no encontrado' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<void> {
    await this.gradosService.eliminar(id, req.usuario!.userId);
  }
}
