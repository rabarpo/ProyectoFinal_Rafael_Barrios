import { Body, Controller, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { CrearProcesoDto } from './dto/crear-proceso.dto';
import { PadronRespuestaDto } from './dto/padron-respuesta.dto';
import { ProcesoRespuestaDto } from './dto/proceso-respuesta.dto';
import { SegmentacionDto } from './dto/segmentacion.dto';
import { PadronService } from './padron.service';
import { ProcesosService } from './procesos.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

/**
 * administracion-procesos-electorales, PR5/PR6 (design.md "Contratos HTTP"/D4, tareas 14.1/17.8).
 * `@Roles('administrador', 'director', 'comite')` a nivel de clase (decisión 4 de la propuesta —
 * los tres roles son equivalentes). Rutas estáticas primero (D4, gotcha de enrutamiento de Nest):
 * `padron` se declara antes de `POST /` (que a su vez precede a `:id`, agregado en PR7).
 */
@ApiTags('procesos')
@ApiCookieAuth()
@Controller('procesos')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director', 'comite')
export class ProcesosController {
  constructor(
    private readonly padronService: PadronService,
    private readonly procesosService: ProcesosService,
  ) {}

  @Post('padron')
  @HttpCode(200)
  @ApiOperation({ summary: 'Calcula el padrón en vivo para una segmentación, sin persistir nada' })
  @ApiBody({ type: SegmentacionDto })
  @ApiResponse({ status: 200, description: 'Padrón calculado', type: PadronRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido' })
  @ApiResponse({ status: 409, description: 'Referencia inexistente, segmentación inválida o sin año escolar activo' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  async padron(@Body() dto: SegmentacionDto): Promise<PadronRespuestaDto> {
    return this.padronService.calcular(dto);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un ProcesoElectoral en borrador, con lote de ProcesoAula (D3/D6)' })
  @ApiBody({ type: CrearProcesoDto })
  @ApiResponse({ status: 201, description: 'Proceso creado', type: ProcesoRespuestaDto })
  @ApiResponse({ status: 400, description: 'Campo inválido' })
  @ApiResponse({
    status: 409,
    description: 'Referencia inexistente, segmentación inválida, sin elegibles o sin año escolar activo',
  })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  async crear(
    @Body() dto: CrearProcesoDto,
    @Req() req: RequestConUsuario,
  ): Promise<ProcesoRespuestaDto> {
    return this.procesosService.crear(dto, req.usuario!.userId);
  }
}
