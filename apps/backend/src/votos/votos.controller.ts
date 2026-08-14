import { Controller, Get, Param, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { PapeletaDto } from './dto/papeleta.dto';
import { PapeletaService } from './papeleta.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * vote-casting, PR1 (design.md D1/D13, "Contratos HTTP", tarea 1.1). Primer controlador orientado
 * al VOTANTE, no a la gestión: `@UseGuards(AuthGuard)` SIN `RolesGuard` — cualquier sesión válida
 * puede llegar al handler; la autorización real es la pertenencia del `DerechoVoto` al usuario de
 * la sesión, verificada dentro de `PapeletaService`/`VotosService` (D1). `POST /votos` llega en
 * PR3 (design.md D6/D10, "Contratos HTTP").
 */
@ApiTags('votos')
@ApiCookieAuth()
@Controller('votos')
@UseGuards(AuthGuard)
export class VotosController {
  constructor(private readonly papeletaService: PapeletaService) {}

  @Get('papeleta/:derechoVotoId')
  @ApiOperation({ summary: 'Lectura de la papeleta para el derecho propio (D13, no es la validación)' })
  @ApiParam({ name: 'derechoVotoId', type: String })
  @ApiResponse({ status: 200, description: 'Papeleta', type: PapeletaDto })
  @ApiResponse({ status: 400, description: 'derechoVotoId no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Derecho ajeno o inexistente' })
  async papeleta(
    @Param('derechoVotoId', ParseUUIDPipe) derechoVotoId: string,
    @Req() req: RequestConUsuario,
  ): Promise<PapeletaDto> {
    return this.papeletaService.obtener(derechoVotoId, req.usuario!);
  }
}
