import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR2 (design.md "Contratos HTTP", tarea 4.3, spec "GET
// /listas nunca expone bytes"). `plan_trabajo_presente`/`plan_trabajo_nombre` reemplazan los bytes
// del PDF — el binario solo viaja por `GET /listas/:id/plan-trabajo` (StreamableFile).
export class ListaRespuestaDto {
  @ApiProperty({ description: 'ID de la lista', type: String })
  id!: string;

  @ApiProperty({ description: 'ID del ProcesoElectoral al que pertenece', type: String })
  proceso_id!: string;

  @ApiProperty({ description: 'Nombre de la lista', type: String })
  nombre!: string;

  @ApiProperty({ description: 'Número de lista', type: Number })
  numero!: number;

  @ApiPropertyOptional({ description: 'Símbolo de la lista', type: String })
  simbolo?: string;

  @ApiPropertyOptional({ description: 'Lema de la lista', type: String })
  lema?: string;

  @ApiPropertyOptional({ description: 'Propuesta de la lista', type: String })
  propuesta?: string;

  @ApiProperty({ description: 'Estado de participación de la lista', enum: ['activo', 'baja'] })
  estado!: string;

  @ApiPropertyOptional({ description: 'Fecha/hora de la baja (ISO 8601), ausente si está activa', type: String })
  baja_en?: string;

  @ApiProperty({ description: 'true si la lista tiene un plan de trabajo en PDF almacenado', type: Boolean })
  plan_trabajo_presente!: boolean;

  @ApiPropertyOptional({ description: 'Nombre original del PDF del plan de trabajo, si existe', type: String })
  plan_trabajo_nombre?: string;
}
