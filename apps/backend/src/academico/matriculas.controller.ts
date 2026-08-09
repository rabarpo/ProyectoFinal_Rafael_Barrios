import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { CrearMatriculaDto } from './dto/crear-matricula.dto';
import { ListarMatriculasQuery } from './dto/listar-matriculas.query';
import { MatriculaRespuestaDto } from './dto/matricula-respuesta.dto';
import { MatriculasService } from './matriculas.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-academica, PR7 (design.md D2/D3/D5/D6, tarea 28.3). `@Roles('administrador',
 * 'director')` a nivel de clase (D3). `ParseUUIDPipe` en `:id`. Sin `PATCH` (D3, "sin
 * re-parentado" — un traslado de `Matricula` es `DELETE` + `POST`).
 */
@ApiTags('matriculas')
@ApiCookieAuth()
@Controller('matriculas')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director')
export class MatriculasController {
  constructor(private readonly matriculasService: MatriculasService) {}

  @Post()
  @ApiOperation({ summary: 'Matricula un Usuario con rol estudiante en un Aula y AnioEscolar existentes y coherentes' })
  @ApiResponse({ status: 201, description: 'Matricula creada', type: MatriculaRespuestaDto })
  @ApiResponse({ status: 409, description: 'Usuario/Aula/AnioEscolar inexistente, rol distinto de estudiante, combinación duplicada o incoherencia jerárquica' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director' })
  async crear(
    @Body() dto: CrearMatriculaDto,
    @Req() req: RequestConUsuario,
  ): Promise<MatriculaRespuestaDto> {
    return this.matriculasService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista matrículas, con filtro opcional por usuario_id, aula_id y anio_escolar_id' })
  @ApiResponse({ status: 200, description: 'Listado de matrículas', type: [MatriculaRespuestaDto] })
  @ApiResponse({ status: 400, description: 'Filtro malformado' })
  async listar(@Query() query: ListarMatriculasQuery): Promise<MatriculaRespuestaDto[]> {
    return this.matriculasService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta una Matricula por id' })
  @ApiResponse({ status: 200, description: 'Matricula encontrada', type: MatriculaRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'Matricula no encontrada' })
  async obtenerPorId(@Param('id', ParseUUIDPipe) id: string): Promise<MatriculaRespuestaDto> {
    return this.matriculasService.obtenerPorId(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente una Matricula (retiro/traslado)' })
  @ApiResponse({ status: 204, description: 'Matricula eliminada' })
  @ApiResponse({ status: 404, description: 'Matricula no encontrada' })
  async eliminar(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<void> {
    await this.matriculasService.eliminar(id, req.usuario!.userId);
  }
}
