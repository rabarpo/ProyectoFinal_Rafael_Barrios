import { ApiProperty } from '@nestjs/swagger';
import type { EstadoActa, TipoActa } from '@prisma/client';

// cierre-escrutinio-actas (#17, PR4; design.md D13). Metadatos de listado — NUNCA `pdf` ni
// `contenido` (Threat Matrix: "Denegación por polling / tamaño de payload" y "Fuga del gate
// ocultar_resultados por la puerta lateral del acta"). `pdf_disponible` deriva de `pdf !== null`,
// no del `estado` (una acta puede quedar `fallido` con un intento anterior... en la práctica nunca
// ocurre porque `finalizar()` sólo escribe `pdf` junto con `estado='emitida'`, pero el DTO no
// asume esa invariante silenciosamente).
export class ActaResumenDto {
  @ApiProperty({ description: 'ID del acta', type: String })
  id!: string;

  @ApiProperty({ description: 'Tipo de acta', enum: ['apertura', 'cierre', 'escrutinio', 'oficial'] })
  tipo!: TipoActa;

  @ApiProperty({ description: 'Estado de emisión del acta', enum: ['borrador', 'emitida', 'fallido'] })
  estado!: EstadoActa;

  @ApiProperty({ description: 'Momento de creación del acta en borrador (ISO-8601)', type: String })
  creado_en!: string;

  @ApiProperty({ description: 'true si el PDF ya fue persistido y puede descargarse', type: Boolean })
  pdf_disponible!: boolean;
}
