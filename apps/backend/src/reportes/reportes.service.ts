import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { DimensionReporte, FormatoReporte, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { construirModelo } from './dimensiones';
import { esSensible } from './modelo-reporte';
import type { ReporteDetalleDto } from './dto/reporte-detalle.dto';
import type { SolicitarReporteDto } from './dto/solicitar-reporte.dto';
import { REPORTES_ERROR_CODES } from './reportes.errors';

const DIMENSIONES_VALIDAS: readonly string[] = [
  'participacion',
  'votantes',
  'abstenciones',
  'resultados',
  'candidatos',
  'consultas',
];

const FORMATOS_VALIDOS: readonly string[] = ['excel', 'pdf', 'csv'];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReporteFila {
  id: string;
  proceso_id: string;
  dimension: DimensionReporte;
  formato: FormatoReporte;
  estado: string;
  gate_aplicado: boolean | null;
  archivo: Buffer | null;
  archivo_mime: string | null;
  archivo_nombre: string | null;
  solicitado_por: string;
  creado_en: Date;
  emitido_en: Date | null;
}

function mapearRespuesta(reporte: ReporteFila): ReporteDetalleDto {
  return {
    id: reporte.id,
    proceso_id: reporte.proceso_id,
    dimension: reporte.dimension,
    formato: reporte.formato,
    estado: reporte.estado as ReporteDetalleDto['estado'],
    gate_aplicado: reporte.gate_aplicado,
    archivo_disponible: reporte.archivo !== null,
    archivo_bytes: reporte.archivo !== null ? reporte.archivo.length : null,
    archivo_mime: reporte.archivo_mime,
    archivo_nombre: reporte.archivo_nombre,
    solicitado_por: reporte.solicitado_por,
    creado_en: reporte.creado_en.toISOString(),
    emitido_en: reporte.emitido_en ? reporte.emitido_en.toISOString() : null,
  };
}

/**
 * reportes-y-exportaciones (#18, PR3; design.md D4/D7.1/D8, "Flujo de datos"). Validación manual
 * ANTES de abrir la transacción (mismo idioma de `#17` D9): `dimension`/`formato`/`proceso_id`
 * fuera de forma nunca llegan a `$transaction`. Dentro de la transacción `RepeatableRead` (un solo
 * snapshot, `#16` D4): (1) relee el proceso, 404 si no existe; (2) `gate =
 * esSensible(dimension) && proceso.ocultar_resultados` (D7.1, capa 1 del gate); (3)
 * `construirModelo()` (PR2) — con `gate=true` construye SOLO la parte no sensible, nunca invoca
 * `calcularEscrutinio()`; (4) crea la fila `Reporte` en `borrador` con `solicitado_por` tomado del
 * actor autenticado, jamás del cuerpo de la petición.
 *
 * Desviación declarada respecto de la spec (design.md, "Contratos HTTP"): este método NO encola
 * ningún job — la fila `borrador` es la entrada de outbox que el despachador del worker (PR4)
 * descubre por *polling* dentro de `REPORTES_POLL_MS` (ADR-0012, `#17` D10).
 */
@Injectable()
export class ReportesService {
  constructor(private readonly prisma: PrismaService) {}

  async solicitar(dto: SolicitarReporteDto, actorId: string): Promise<ReporteDetalleDto> {
    if (!DIMENSIONES_VALIDAS.includes(dto.dimension)) {
      throw new BadRequestException({ codigo: REPORTES_ERROR_CODES.CAMPO_INVALIDO, campo: 'dimension', motivo: 'formato' });
    }
    if (!FORMATOS_VALIDOS.includes(dto.formato)) {
      throw new BadRequestException({ codigo: REPORTES_ERROR_CODES.CAMPO_INVALIDO, campo: 'formato', motivo: 'formato' });
    }
    if (!UUID_RE.test(dto.proceso_id)) {
      throw new BadRequestException({ codigo: REPORTES_ERROR_CODES.CAMPO_INVALIDO, campo: 'proceso_id', motivo: 'formato' });
    }

    return this.prisma.$transaction(
      async (tx) => {
        const proceso = await tx.procesoElectoral.findUnique({
          where: { id: dto.proceso_id },
          select: { id: true, tipo: true, ocultar_resultados: true },
        });
        if (!proceso) {
          throw new NotFoundException({ codigo: REPORTES_ERROR_CODES.PROCESO_NO_ENCONTRADO });
        }

        const gate = esSensible(dto.dimension) && proceso.ocultar_resultados;

        const modelo = await construirModelo(dto.dimension, tx, {
          procesoId: proceso.id,
          tipo: proceso.tipo,
          formato: dto.formato,
          gate,
        });

        const reporte = await tx.reporte.create({
          data: {
            proceso_id: proceso.id,
            dimension: dto.dimension as DimensionReporte,
            formato: dto.formato as FormatoReporte,
            solicitado_por: actorId,
            contenido: modelo as unknown as Prisma.InputJsonValue,
          },
        });

        return mapearRespuesta(reporte as unknown as ReporteFila);
      },
      { isolationLevel: 'RepeatableRead' as Prisma.TransactionIsolationLevel },
    );
  }

  /**
   * `GET /reportes/:id` — mismo criterio que `ActaResumenDto` (`#17` D13): nunca `contenido` ni
   * `archivo` en la respuesta, sólo metadatos.
   */
  async obtener(id: string): Promise<ReporteDetalleDto> {
    const reporte = await this.prisma.reporte.findUnique({ where: { id } });
    if (!reporte) {
      throw new NotFoundException();
    }
    return mapearRespuesta(reporte as unknown as ReporteFila);
  }

  /**
   * `GET /reportes/:id/archivo` — D7.3 (capa 3 del gate) + D8. `409 REPORTE_NO_EMITIDO` si el
   * `estado` no es `emitida` (`borrador`/`fallido`, sin distinguir). Si está `emitida`, sólo
   * rechaza con `409 REPORTE_NO_DISPONIBLE` cuando la dimensión es sensible, la política VIGENTE
   * (releída ahora, no la congelada en la solicitud) es oculta, y el archivo se emitió SIN podar
   * (`gate_aplicado === false`) — un archivo ya podado (`gate_aplicado === true`) sigue siendo
   * seguro de servir sin importar hacia dónde viró la política después.
   */
  async archivo(id: string): Promise<{ buffer: Buffer; mime: string; nombre: string }> {
    const reporte = await this.prisma.reporte.findUnique({
      where: { id },
      include: { proceso: { select: { ocultar_resultados: true } } },
    });
    if (!reporte) {
      throw new NotFoundException();
    }
    if (reporte.estado !== 'emitida' || reporte.archivo === null) {
      throw new ConflictException({ codigo: REPORTES_ERROR_CODES.REPORTE_NO_EMITIDO, estado: reporte.estado });
    }

    const gateVigente = esSensible(reporte.dimension) && reporte.proceso.ocultar_resultados;
    if (gateVigente && reporte.gate_aplicado === false) {
      throw new ConflictException({ codigo: REPORTES_ERROR_CODES.REPORTE_NO_DISPONIBLE });
    }

    return {
      buffer: reporte.archivo,
      mime: reporte.archivo_mime ?? 'application/octet-stream',
      nombre: reporte.archivo_nombre ?? `reporte-${reporte.id}`,
    };
  }
}
