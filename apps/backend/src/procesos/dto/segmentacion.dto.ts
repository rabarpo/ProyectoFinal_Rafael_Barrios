import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// administracion-procesos-electorales, PR5 (design.md "Contratos HTTP", tarea 12.1). Mismo body
// que consume `POST /procesos/padron` y, embebido dentro de `CrearProcesoDto`, `POST /procesos`
// (D4). `nivel_id`/`grado_ids`/`aula_ids` son mutuamente excluyentes según `alcance` (D3):
// validados a mano en `PadronService`/`ProcesosService`, sin `class-validator` (mismo idioma que
// #7/#8/#10).
export class SegmentacionDto {
  @ApiProperty({ description: 'Público objetivo del proceso', enum: ['estudiantes', 'padres', 'comunidad'] })
  publico_objetivo!: 'estudiantes' | 'padres' | 'comunidad';

  @ApiProperty({ description: 'Alcance de la segmentación', enum: ['institucion', 'nivel', 'grados', 'aulas'] })
  alcance!: 'institucion' | 'nivel' | 'grados' | 'aulas';

  @ApiPropertyOptional({ description: 'ID de Nivel, requerido cuando alcance = nivel', type: String })
  nivel_id?: string;

  @ApiPropertyOptional({ description: 'IDs de Grado, requeridos cuando alcance = grados', type: [String] })
  grado_ids?: string[];

  @ApiPropertyOptional({ description: 'IDs de Aula, requeridos cuando alcance = aulas', type: [String] })
  aula_ids?: string[];
}
