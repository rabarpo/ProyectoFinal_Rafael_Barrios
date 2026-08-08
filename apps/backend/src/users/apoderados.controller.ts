import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ApoderadosService } from './apoderados.service';
import { ActualizarApoderadoDto } from './dto/actualizar-apoderado.dto';
import { ApoderadoRespuestaDto } from './dto/apoderado-respuesta.dto';
import { CrearApoderadoDto } from './dto/crear-apoderado.dto';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-usuarios-apoderados, PR3 (design.md D3, tarea 11.8). Sub-recurso anidado bajo
 * `Usuario` (`usuarios/:usuarioId/apoderados`), mismos guards/roles a nivel de clase que
 * `UsersController` (D3: satisface el aislamiento de `comite` y la equivalencia
 * `administrador`≡`director` por construcción). Toda operación pasa por
 * `ApoderadosService.verificarEstudiante()`: `:usuarioId` inexistente ⇒ `404`, `rol ≠ estudiante`
 * ⇒ `409 USUARIO_NO_ES_ESTUDIANTE`, sin escritura. `DELETE` es un borrado físico real (spec "CRUD
 * de Apoderado restringido a estudiantes").
 */
@ApiTags('apoderados')
@ApiCookieAuth()
@Controller('usuarios/:usuarioId/apoderados')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class ApoderadosController {
  constructor(private readonly apoderadosService: ApoderadosService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un Apoderado vinculado a un Usuario con rol estudiante' })
  @ApiResponse({ status: 201, description: 'Apoderado creado', type: ApoderadoRespuestaDto })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 409, description: 'El Usuario referenciado no es estudiante' })
  async crear(
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Body() dto: CrearApoderadoDto,
    @Req() req: RequestConUsuario,
  ): Promise<ApoderadoRespuestaDto> {
    return this.apoderadosService.crear(usuarioId, dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista los apoderados de un Usuario con rol estudiante' })
  @ApiResponse({ status: 200, description: 'Listado de apoderados', type: [ApoderadoRespuestaDto] })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 409, description: 'El Usuario referenciado no es estudiante' })
  async listar(
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
  ): Promise<ApoderadoRespuestaDto[]> {
    return this.apoderadosService.listar(usuarioId);
  }

  @Patch(':apoderadoId')
  @ApiOperation({ summary: 'Actualiza datos básicos de un Apoderado' })
  @ApiResponse({ status: 200, description: 'Apoderado actualizado', type: ApoderadoRespuestaDto })
  @ApiResponse({ status: 404, description: 'Usuario o Apoderado no encontrado' })
  @ApiResponse({ status: 409, description: 'El Usuario referenciado no es estudiante' })
  async actualizar(
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Param('apoderadoId', ParseUUIDPipe) apoderadoId: string,
    @Body() dto: ActualizarApoderadoDto,
    @Req() req: RequestConUsuario,
  ): Promise<ApoderadoRespuestaDto> {
    return this.apoderadosService.actualizar(usuarioId, apoderadoId, dto, req.usuario!.userId);
  }

  @Delete(':apoderadoId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente un Apoderado' })
  @ApiResponse({ status: 204, description: 'Apoderado eliminado' })
  @ApiResponse({ status: 404, description: 'Usuario o Apoderado no encontrado' })
  @ApiResponse({ status: 409, description: 'El Usuario referenciado no es estudiante' })
  async eliminar(
    @Param('usuarioId', ParseUUIDPipe) usuarioId: string,
    @Param('apoderadoId', ParseUUIDPipe) apoderadoId: string,
    @Req() req: RequestConUsuario,
  ): Promise<void> {
    await this.apoderadosService.eliminar(usuarioId, apoderadoId, req.usuario!.userId);
  }
}
