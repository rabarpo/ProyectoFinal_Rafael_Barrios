import { Controller, Get, Param, ParseUUIDPipe, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ActasService } from './actas.service';
import { ActaResumenDto } from './dto/acta-resumen.dto';

interface RespuestaConCabeceras {
  set(cabeceras: Record<string, string>): void;
}

/**
 * cierre-escrutinio-actas (#17, PR4; design.md D13, tareas 16.6-16.7). Controlador propio,
 * separado de `ProcesosController` (D1) — comparte `@Roles` de clase con `ProcesosController`
 * pero **no** con la audiencia de `#16`/`ResultadosController`: el acta de escrutinio lleva el
 * desglose completo incluso con `ocultar_resultados=true` (threat "Fuga del gate
 * ocultar_resultados por la puerta lateral del acta"). Cabeceras defensivas copiadas literal de
 * `listas.controller.ts` (`GET /listas/:id/plan-trabajo`), único precedente del repo que sirve
 * `bytea`.
 */
@ApiTags('actas')
@ApiCookieAuth()
@Controller('procesos')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director', 'comite')
export class ActasController {
  constructor(private readonly actasService: ActasService) {}

  @Get(':id/actas')
  @ApiOperation({ summary: 'Lista las actas de un ProcesoElectoral (metadatos, sin bytes ni contenido)' })
  @ApiResponse({ status: 200, description: 'Listado de actas', type: [ActaResumenDto] })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 404, description: 'ProcesoElectoral inexistente' })
  async listar(@Param('id', ParseUUIDPipe) id: string): Promise<ActaResumenDto[]> {
    return this.actasService.listar(id);
  }

  @Get(':id/actas/:tipo/pdf')
  @ApiParam({ name: 'tipo', enum: ['apertura', 'cierre', 'escrutinio', 'oficial'] })
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Descarga el PDF de un acta emitida' })
  @ApiResponse({ status: 200, description: 'PDF del acta' })
  @ApiResponse({ status: 400, description: 'tipo fuera del enum' })
  @ApiResponse({ status: 404, description: 'ProcesoElectoral inexistente' })
  @ApiResponse({ status: 409, description: 'Acta aún no emitida' })
  async obtenerPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('tipo') tipo: string,
    @Res({ passthrough: true }) res: RespuestaConCabeceras,
  ): Promise<StreamableFile> {
    const acta = await this.actasService.obtenerPdf(id, tipo);

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Content-Disposition': `attachment; filename="${acta.nombre}"`,
    });

    return new StreamableFile(acta.buffer, { type: 'application/pdf' });
  }
}
