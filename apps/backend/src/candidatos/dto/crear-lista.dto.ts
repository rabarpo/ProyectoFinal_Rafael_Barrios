import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR2 (design.md D5, "Contratos HTTP", tarea 4.3). FK en el
// body (D5, "Superficie de rutas"), no anidado bajo /procesos/:procesoId. `numero` es obligatorio
// y único junto a `proceso_id` (@@unique([proceso_id, numero])) — la colisión se traduce a `409
// RESTRICCION_UNICA` en `ListasService.crear()`.
export class CrearListaDto {
  @ApiProperty({ description: 'ID del ProcesoElectoral al que pertenece la lista', type: String })
  proceso_id!: string;

  @ApiProperty({ description: 'Nombre de la lista', type: String })
  nombre!: string;

  @ApiProperty({ description: 'Número de lista, único dentro del proceso', type: Number })
  numero!: number;

  @ApiPropertyOptional({ description: 'Símbolo de la lista', type: String })
  simbolo?: string;

  @ApiPropertyOptional({ description: 'Lema de la lista', type: String })
  lema?: string;

  @ApiPropertyOptional({ description: 'Propuesta de la lista', type: String })
  propuesta?: string;
}
