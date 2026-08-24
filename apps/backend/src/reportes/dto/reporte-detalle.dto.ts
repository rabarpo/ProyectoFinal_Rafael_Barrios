import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { DimensionReporte, EstadoReporte, FormatoReporte } from '@prisma/client';

// reportes-y-exportaciones (#18, PR3; design.md "Contratos HTTP", D8). Respuesta de `POST
// /reportes` y `GET /reportes/:id`: NUNCA expone `contenido` ni `archivo` (bytes) — mismo criterio
// que `#17` D13 (`ActaResumenDto`). `archivo_disponible` deriva de `archivo !== null`, no del
// `estado` (misma cautela documentada en `ActaResumenDto`: el DTO no asume la invariante en
// silencio). `archivo_bytes` es el tamaño en bytes, útil para el cliente sin transportar el
// archivo completo.
export class ReporteDetalleDto {
  @ApiProperty({ description: 'ID del reporte', type: String })
  id!: string;

  @ApiProperty({ description: 'ID del ProcesoElectoral', type: String })
  proceso_id!: string;

  @ApiProperty({
    description: 'Dimensión del reporte',
    enum: ['participacion', 'votantes', 'abstenciones', 'resultados', 'candidatos', 'consultas'],
  })
  dimension!: DimensionReporte;

  @ApiProperty({ description: 'Formato de salida', enum: ['excel', 'pdf', 'csv'] })
  formato!: FormatoReporte;

  @ApiProperty({ description: 'Estado de emisión del reporte', enum: ['borrador', 'emitida', 'fallido'] })
  estado!: EstadoReporte;

  @ApiPropertyOptional({
    description:
      'Gate efectivo aplicado por el worker al generar (D7.2); null mientras el reporte sigue en borrador',
    type: Boolean,
    nullable: true,
  })
  gate_aplicado!: boolean | null;

  @ApiProperty({ description: 'true si el archivo ya fue persistido y puede descargarse', type: Boolean })
  archivo_disponible!: boolean;

  @ApiPropertyOptional({ description: 'Tamaño del archivo en bytes', type: Number, nullable: true })
  archivo_bytes!: number | null;

  @ApiPropertyOptional({ description: 'Content-Type del archivo emitido', type: String, nullable: true })
  archivo_mime!: string | null;

  @ApiPropertyOptional({ description: 'Nombre de archivo sugerido para la descarga', type: String, nullable: true })
  archivo_nombre!: string | null;

  @ApiProperty({ description: 'ID del usuario que solicitó el reporte', type: String })
  solicitado_por!: string;

  @ApiProperty({ description: 'Momento de creación en borrador (ISO-8601)', type: String })
  creado_en!: string;

  @ApiPropertyOptional({ description: 'Momento de emisión (ISO-8601)', type: String, nullable: true })
  emitido_en!: string | null;
}
