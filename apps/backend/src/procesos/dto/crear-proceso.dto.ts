import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SegmentacionDto } from './segmentacion.dto';

// administracion-procesos-electorales, PR6 (design.md "Contratos HTTP", tarea 16.1). `CrearProcesoDto
// = datos + SegmentacionDto + ocultar_resultados`: extiende `SegmentacionDto` (D4, mismo body que
// `POST /procesos/padron`) y agrega los campos propios del borrador. `tipo` y `estado` de
// `ProcesoElectoral` se declaran explícitos aquí porque, a diferencia de `ActualizarProcesoDto`
// (PR7), la creación SÍ los necesita — `estado` nunca llega desde el body, `create()` siempre
// persiste `borrador` (default del schema).
export class CrearProcesoDto extends SegmentacionDto {
  @ApiProperty({ description: 'Nombre del proceso electoral', type: String })
  nombre!: string;

  @ApiPropertyOptional({ description: 'Descripción del proceso', type: String })
  descripcion?: string;

  @ApiProperty({
    description: 'Tipo de proceso electoral',
    enum: ['municipio', 'representante_aula', 'padres', 'consulta'],
  })
  tipo!: 'municipio' | 'representante_aula' | 'padres' | 'consulta';

  @ApiProperty({ description: 'Fecha/hora prevista de apertura (ISO-8601)', type: String })
  fecha_apertura_prevista!: string;

  @ApiProperty({ description: 'Fecha/hora prevista de cierre (ISO-8601), MUST ser posterior a la apertura', type: String })
  fecha_cierre_prevista!: string;

  @ApiPropertyOptional({
    description: 'Pre-marcado por el asistente (D7); si se omite, persiste el default del schema (true, ADR-0008: "activa por defecto")',
    type: Boolean,
  })
  ocultar_resultados?: boolean;
}
