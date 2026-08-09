import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ActualizarAulaDto } from './dto/actualizar-aula.dto';
import { AulaRespuestaDto } from './dto/aula-respuesta.dto';
import { CrearAulaDto } from './dto/crear-aula.dto';
import { ListarAulasQuery } from './dto/listar-aulas.query';
import { AulasService } from './aulas.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-academica, PR6 (design.md D2/D3/D5/D6, tarea 22.3). `@Roles('administrador',
 * 'director')` a nivel de clase (D3). `ParseUUIDPipe` en `:id`.
 */
@ApiTags('aulas')
@ApiCookieAuth()
@Controller('aulas')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class AulasController {
  constructor(private readonly aulasService: AulasService) {}

  @Post()
  @ApiOperation({ summary: 'Crea un Aula acotada a un Grado, una Seccion y un AnioEscolar existentes y coherentes' })
  @ApiResponse({ status: 201, description: 'Aula creada', type: AulaRespuestaDto })
  @ApiResponse({ status: 400, description: 'turno fuera de {manana, tarde}' })
  @ApiResponse({ status: 409, description: 'Grado/Seccion/AnioEscolar inexistente, combinación duplicada o incoherencia jerárquica' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async crear(
    @Body() dto: CrearAulaDto,
    @Req() req: RequestConUsuario,
  ): Promise<AulaRespuestaDto> {
    return this.aulasService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista aulas, con filtro opcional por grado_id, seccion_id, anio_escolar_id y turno' })
  @ApiResponse({ status: 200, description: 'Listado de aulas', type: [AulaRespuestaDto] })
  @ApiResponse({ status: 400, description: 'Filtro malformado' })
  async listar(@Query() query: ListarAulasQuery): Promise<AulaRespuestaDto[]> {
    return this.aulasService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta un Aula por id' })
  @ApiResponse({ status: 200, description: 'Aula encontrada', type: AulaRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'Aula no encontrada' })
  async obtenerPorId(@Param('id', ParseUUIDPipe) id: string): Promise<AulaRespuestaDto> {
    return this.aulasService.obtenerPorId(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualiza el turno de un Aula (nunca su Grado/Seccion/AnioEscolar)' })
  @ApiResponse({ status: 200, description: 'Aula actualizada', type: AulaRespuestaDto })
  @ApiResponse({ status: 400, description: 'turno fuera de {manana, tarde}' })
  @ApiResponse({ status: 404, description: 'Aula no encontrada' })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarAulaDto,
    @Req() req: RequestConUsuario,
  ): Promise<AulaRespuestaDto> {
    return this.aulasService.actualizar(id, dto, req.usuario!.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente un Aula sin Matricula/ProcesoAula dependiente' })
  @ApiResponse({ status: 204, description: 'Aula eliminada' })
  @ApiResponse({ status: 409, description: 'Existe Matricula o ProcesoAula dependiente' })
  @ApiResponse({ status: 404, description: 'Aula no encontrada' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<void> {
    await this.aulasService.eliminar(id, req.usuario!.userId);
  }
}
