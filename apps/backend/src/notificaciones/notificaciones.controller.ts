import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ListarNotificacionesQueryDto } from './dto/listar-notificaciones.query';
import { NotificacionDto } from './dto/notificacion-respuesta.dto';
import { PaginaNotificacionesDto } from './dto/pagina-notificaciones.dto';
import { NotificacionesService } from './notificaciones.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * notificaciones (backlog #19), PR6 (design.md D9, tarea 15.1). Sin `@Roles`: la bandeja es de
 * cualquier usuario autenticado y el `scope` lo da `usuario_id = sesion.userId`, nunca un
 * parámetro — mismo idioma que `GET /votos/mis-derechos`.
 */
@ApiTags('notificaciones')
@ApiCookieAuth()
@Controller('notificaciones')
@UseGuards(AuthGuard)
export class NotificacionesController {
  constructor(private readonly notificacionesService: NotificacionesService) {}

  @Get()
  @ApiOperation({ summary: 'Bandeja interna de notificaciones del usuario autenticado, paginada (D9)' })
  @ApiQuery({ name: 'pagina', required: false, type: Number })
  @ApiQuery({ name: 'tamano', required: false, type: Number })
  @ApiQuery({ name: 'solo_no_leidas', required: false, enum: ['true', 'false'] })
  @ApiResponse({ status: 200, description: 'Página de notificaciones propias', type: PaginaNotificacionesDto })
  @ApiResponse({ status: 400, description: 'Query fuera de rango o formato' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  async listar(
    @Query() query: ListarNotificacionesQueryDto,
    @Req() req: RequestConUsuario,
  ): Promise<PaginaNotificacionesDto> {
    return this.notificacionesService.listar(query, req.usuario!);
  }

  @Patch(':id/leido')
  @HttpCode(200)
  @ApiOperation({ summary: 'Marca la notificación propia como leída, idempotente (D10)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Notificación marcada (o ya leída previamente)', type: NotificacionDto })
  @ApiResponse({ status: 403, description: 'Notificación ajena o inexistente, sin cuerpo discriminante' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  async marcarLeido(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<NotificacionDto> {
    return this.notificacionesService.marcarLeido(id, req.usuario!);
  }
}
