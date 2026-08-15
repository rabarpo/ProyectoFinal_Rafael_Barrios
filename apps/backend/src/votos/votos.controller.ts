import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ComprobanteDto } from './dto/comprobante.dto';
import { EmitirVotoDto } from './dto/emitir-voto.dto';
import { PapeletaDto } from './dto/papeleta.dto';
import { PapeletaService } from './papeleta.service';
import { VOTOS_ERROR_CODES } from './votos.errors';
import { VotosService } from './votos.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

interface RespuestaConEstado {
  status(codigo: number): void;
}

// design.md threat matrix "SQL crudo parametrizado (D4)": `derecho_voto_id` viaja en el body (no
// hay `ParseUUIDPipe` de parámetro de ruta para `POST /votos`), así que el formato se valida acá,
// en el controlador, ANTES de invocar `VotosService.emitir()` — y por lo tanto antes de que se
// abra cualquier transacción (tarea 11.12). Deliberadamente NO vive dentro de `emitir()` (PR2):
// esa transacción y su suite de 19 unit tests ya está completa e indivisa (tarea 9.1) y sus casos
// usan ids no-UUID (`'dv-1'`) por diseño — moverla ahí reabriría PR2 sin necesidad.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * vote-casting, PR3 (design.md D1/D6/D10/D13, "Contratos HTTP", tareas 10.2). `POST /votos` usa
 * `@Res({passthrough:true})` (mismo patrón que `auth.controller.ts`/`candidatos.controller.ts`)
 * para distinguir `201` (esta petición creó la fila) de `200` (reintento con la misma clave o
 * colisión `23505` — ambos ya resueltos por `VotosService.emitir()`, D5/D7). El cuerpo es idéntico
 * en ambos casos, sin bandera `ya_registrado` (D6).
 */
@ApiTags('votos')
@ApiCookieAuth()
@Controller('votos')
@UseGuards(AuthGuard)
export class VotosController {
  constructor(
    private readonly papeletaService: PapeletaService,
    private readonly votosService: VotosService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Emite el voto del derecho propio, con idempotencia y colisión UNIQUE (D5/D6/D7)' })
  @ApiBody({ type: EmitirVotoDto })
  @ApiResponse({ status: 201, description: 'Voto creado', type: ComprobanteDto })
  @ApiResponse({ status: 200, description: 'Comprobante existente (reintento o colisión, D6)', type: ComprobanteDto })
  @ApiResponse({ status: 400, description: 'Campo inválido (elección, o derecho_voto_id no-UUID)' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Derecho ajeno o inexistente' })
  @ApiResponse({ status: 409, description: 'SIN_DERECHO / VOTACION_CERRADA / ELECCION_INVALIDA' })
  async emitir(
    @Body() dto: EmitirVotoDto,
    @Req() req: RequestConUsuario,
    @Res({ passthrough: true }) res: RespuestaConEstado,
  ): Promise<ComprobanteDto> {
    if (typeof dto.derecho_voto_id !== 'string' || !UUID_REGEX.test(dto.derecho_voto_id)) {
      throw new BadRequestException({ codigo: VOTOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'derecho_voto_id', motivo: 'formato' });
    }

    const resultado = await this.votosService.emitir(dto, req.usuario!);
    res.status(resultado.creado ? 201 : 200);
    return this.votosService.construirComprobante(resultado);
  }

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
