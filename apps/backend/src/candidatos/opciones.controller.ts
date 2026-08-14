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
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ActualizarOpcionDto } from './dto/actualizar-opcion.dto';
import { CrearOpcionDto } from './dto/crear-opcion.dto';
import { ListarOpcionesQuery } from './dto/listar-opciones.query';
import { OpcionRespuestaDto } from './dto/opcion-respuesta.dto';
import { OpcionesService } from './opciones.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * candidatos-listas-opciones-consulta, PR3 (design.md D5, "Contratos HTTP", tarea 8.7).
 * `@Roles('administrador', 'director', 'comite')` a nivel de clase (D5 de este change).
 * `OpcionConsulta` no tiene `estado`/`baja_en` en el schema ⇒ sin `PATCH .../estado`, solo CRUD
 * con borrado guardado.
 */
@ApiTags('opciones')
@ApiCookieAuth()
@Controller('opciones')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director', 'comite')
export class OpcionesController {
  constructor(private readonly opcionesService: OpcionesService) {}

  @Post()
  @ApiOperation({ summary: 'Crea una OpcionConsulta acotada a un ProcesoElectoral existente' })
  @ApiResponse({ status: 201, description: 'OpcionConsulta creada', type: OpcionRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido' })
  @ApiResponse({ status: 409, description: 'ProcesoElectoral inexistente o etiqueta duplicada' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  async crear(@Body() dto: CrearOpcionDto, @Req() req: RequestConUsuario): Promise<OpcionRespuestaDto> {
    return this.opcionesService.crear(dto, req.usuario!.userId);
  }

  @Get()
  @ApiOperation({ summary: 'Lista OpcionesConsulta, con filtro opcional por proceso_id' })
  @ApiResponse({ status: 200, description: 'Listado de opciones', type: [OpcionRespuestaDto] })
  @ApiResponse({ status: 400, description: 'Filtro malformado' })
  async listar(@Query() query: ListarOpcionesQuery): Promise<OpcionRespuestaDto[]> {
    return this.opcionesService.listar(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Consulta una OpcionConsulta por id' })
  @ApiResponse({ status: 200, description: 'OpcionConsulta encontrada', type: OpcionRespuestaDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'OpcionConsulta no encontrada' })
  async detalle(@Param('id', ParseUUIDPipe) id: string): Promise<OpcionRespuestaDto> {
    return this.opcionesService.detalle(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita los datos de una OpcionConsulta (nunca su ProcesoElectoral)' })
  @ApiResponse({ status: 200, description: 'OpcionConsulta actualizada', type: OpcionRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido' })
  @ApiResponse({ status: 404, description: 'OpcionConsulta no encontrada' })
  @ApiResponse({ status: 409, description: 'Etiqueta duplicada' })
  async actualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActualizarOpcionDto,
    @Req() req: RequestConUsuario,
  ): Promise<OpcionRespuestaDto> {
    return this.opcionesService.actualizar(id, dto, req.usuario!.userId);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Elimina físicamente una OpcionConsulta sin Voto dependiente' })
  @ApiResponse({ status: 204, description: 'OpcionConsulta eliminada' })
  @ApiResponse({ status: 409, description: 'Existe Voto dependiente' })
  @ApiResponse({ status: 404, description: 'OpcionConsulta no encontrada' })
  async eliminar(@Param('id', ParseUUIDPipe) id: string, @Req() req: RequestConUsuario): Promise<void> {
    await this.opcionesService.eliminar(id, req.usuario!.userId);
  }
}
