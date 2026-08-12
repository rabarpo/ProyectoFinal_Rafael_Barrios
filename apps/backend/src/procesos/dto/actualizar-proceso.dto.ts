import { ApiPropertyOptional } from '@nestjs/swagger';
import { SegmentacionDto } from './segmentacion.dto';

// administracion-procesos-electorales, PR7 (design.md D3/"Contratos HTTP", tarea 20.1).
// `ActualizarProcesoDto` extiende `SegmentacionDto` (la segmentación completa se revalida y
// regenera en cada `PATCH`, D3) y agrega los campos propios de `ProcesoElectoral` editables — todos
// opcionales para que un `PATCH` que solo cambia la segmentación no obligue a repetir
// nombre/fechas. Deliberadamente NO declara `tipo` ni `estado` (D3 de design.md, literal de D1 de
// #7 y D3 de #8): reinterpretar el tipo de un proceso en silencio, o su transición de estado, no
// compila porque el campo no existe en este DTO.
export class ActualizarProcesoDto extends SegmentacionDto {
  @ApiPropertyOptional({ description: 'Nombre del proceso electoral', type: String })
  nombre?: string;

  @ApiPropertyOptional({ description: 'Descripción del proceso', type: String })
  descripcion?: string;

  @ApiPropertyOptional({ description: 'Fecha/hora prevista de apertura (ISO-8601)', type: String })
  fecha_apertura_prevista?: string;

  @ApiPropertyOptional({ description: 'Fecha/hora prevista de cierre (ISO-8601)', type: String })
  fecha_cierre_prevista?: string;

  @ApiPropertyOptional({ description: 'Pre-marcado del asistente (D7)', type: Boolean })
  ocultar_resultados?: boolean;
}
