import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ResultadosRespuestaDto } from './dto/resultados-respuesta.dto';
import { ResultadosService } from './resultados.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * resultados-en-vivo (#16, PR1; design.md D1, tarea 4.1). Controlador HERMANO de
 * `ProcesosController`, no un método más: `ProcesosController` lleva `@Roles(...)` a nivel de
 * clase y la audiencia de #16 es cualquier votante autenticado con `DerechoVoto` (D1/D2). Sólo
 * `AuthGuard`, sin `RolesGuard`/`@Roles()` — mismo patrón que `VotosController`.
 */
@ApiTags('procesos')
@ApiCookieAuth()
@Controller('procesos')
@UseGuards(AuthGuard)
export class ResultadosController {
  constructor(private readonly resultadosService: ResultadosService) {}

  @Get(':id/resultados')
  @ApiOperation({ summary: 'Participación y (según ocultar_resultados) desglose en vivo de un proceso (D1/D2)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Resultados', type: ResultadosRespuestaDto })
  @ApiResponse({ status: 400, description: ':id no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Sin DerechoVoto, proceso inexistente o en borrador (idéntico, D3)' })
  async resultados(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<ResultadosRespuestaDto> {
    return this.resultadosService.obtener(id, req.usuario!);
  }
}
