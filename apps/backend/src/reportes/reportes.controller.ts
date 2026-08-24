import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ReporteDetalleDto } from './dto/reporte-detalle.dto';
import { SolicitarReporteDto } from './dto/solicitar-reporte.dto';
import { ReportesService } from './reportes.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

interface RespuestaConCabeceras {
  set(cabeceras: Record<string, string>): void;
}

/**
 * reportes-y-exportaciones (#18, PR3; design.md "Contratos HTTP", D8, "Migración / Rollout" R3).
 * Mismos tres roles que `ActasController` y por el mismo motivo: un reporte de `resultados` lleva
 * el desglose que `#16` le niega al votante. Sin comprobación de propiedad sobre `solicitado_por`
 * (design.md, "Contratos HTTP"): los tres roles pueden solicitar/consultar/descargar cualquier
 * reporte.
 *
 * `POST /reportes` responde `202`, no `201`: el recurso `Reporte` existe, pero el artefacto que el
 * cliente quiere (el archivo) todavía no — la fila `borrador` es la entrada de outbox que el
 * despachador del worker (PR4) descubre por *polling*. `GET /reportes/:id/archivo` ya existe en
 * este PR (R3: "descarga ⇒ 409 mientras no haya archivo") aunque el worker que lo popula recién
 * llega en PR4 — el controlador no depende de quién escribió `archivo`, sólo del estado de la fila.
 */
@ApiTags('reportes')
@ApiCookieAuth()
@Controller('reportes')
@UseGuards(AuthGuard, RolesGuard)
@Roles('administrador', 'director', 'comite')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Solicita un reporte: crea la fila Reporte en borrador (patrón outbox)' })
  @ApiBody({ type: SolicitarReporteDto })
  @ApiResponse({ status: 202, description: 'Reporte en borrador, listo para que el worker lo recoja', type: ReporteDetalleDto })
  @ApiResponse({ status: 400, description: 'dimension/formato/proceso_id inválidos' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'ProcesoElectoral inexistente' })
  async solicitar(
    @Body() dto: SolicitarReporteDto,
    @Req() req: RequestConUsuario,
  ): Promise<ReporteDetalleDto> {
    return this.reportesService.solicitar(dto, req.usuario!.userId);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'ID del reporte' })
  @ApiOperation({ summary: 'Consulta el detalle de un reporte (nunca contenido ni archivo)' })
  @ApiResponse({ status: 200, description: 'Detalle del reporte', type: ReporteDetalleDto })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Reporte inexistente' })
  async obtener(@Param('id', ParseUUIDPipe) id: string): Promise<ReporteDetalleDto> {
    return this.reportesService.obtener(id);
  }

  @Get(':id/archivo')
  @ApiParam({ name: 'id', description: 'ID del reporte' })
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/pdf', 'text/csv')
  @ApiOperation({ summary: 'Descarga el archivo de un reporte emitido' })
  @ApiResponse({ status: 200, description: 'Archivo del reporte' })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de administrador/director/comite' })
  @ApiResponse({ status: 404, description: 'Reporte inexistente' })
  @ApiResponse({ status: 409, description: 'Reporte aún no emitido, o gate vigente (REPORTE_NO_DISPONIBLE)' })
  async archivo(
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: RespuestaConCabeceras,
  ): Promise<StreamableFile> {
    const archivo = await this.reportesService.archivo(id);

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Content-Disposition': `attachment; filename="${archivo.nombre}"`,
    });

    return new StreamableFile(archivo.buffer, { type: archivo.mime });
  }
}
