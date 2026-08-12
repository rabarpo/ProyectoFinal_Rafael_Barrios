import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// administracion-procesos-electorales, PR6 (design.md "Contratos HTTP"/"Flujo de datos — creación
// en lote", tarea 16.1). Respuesta de `POST /procesos` (y, reusada sin cambios, de `PATCH
// /procesos/:id` en PR7 — D3 de design.md: mismo DTO, sin `tipo` ni `estado` editables en el body
// de entrada, pero sí presentes aquí porque son parte del estado persistido). `aulas`/
// `aulas_excluidas` son los ids de `Aula`: el conjunto que sí generó `ProcesoAula` y el que quedó
// fuera por no tener matrícula activa (D3) — así el asistente puede mostrar el resultado del lote
// sin una segunda consulta.
export class ProcesoRespuestaDto {
  @ApiProperty({ description: 'ID del proceso electoral', type: String })
  id!: string;

  @ApiProperty({ description: 'Nombre del proceso', type: String })
  nombre!: string;

  @ApiPropertyOptional({ description: 'Descripción del proceso', type: String })
  descripcion?: string;

  @ApiProperty({
    description: 'Tipo de proceso electoral',
    enum: ['municipio', 'representante_aula', 'padres', 'consulta'],
  })
  tipo!: 'municipio' | 'representante_aula' | 'padres' | 'consulta';

  @ApiProperty({
    description: 'Estado del proceso',
    enum: ['borrador', 'abierto', 'cerrado', 'acta_emitida'],
  })
  estado!: 'borrador' | 'abierto' | 'cerrado' | 'acta_emitida';

  @ApiProperty({ description: 'Fecha/hora prevista de apertura (ISO-8601)', type: String })
  fecha_apertura_prevista!: string;

  @ApiProperty({ description: 'Fecha/hora prevista de cierre (ISO-8601)', type: String })
  fecha_cierre_prevista!: string;

  @ApiProperty({ description: 'Pre-marcado por el asistente (D7); default del schema false', type: Boolean })
  ocultar_resultados!: boolean;

  @ApiProperty({ description: 'Público objetivo del proceso', enum: ['estudiantes', 'padres', 'comunidad'] })
  publico_objetivo!: 'estudiantes' | 'padres' | 'comunidad';

  @ApiProperty({ description: 'Alcance de la segmentación', enum: ['institucion', 'nivel', 'grados', 'aulas'] })
  alcance!: 'institucion' | 'nivel' | 'grados' | 'aulas';

  @ApiPropertyOptional({ description: 'Snapshot del Nivel elegido cuando alcance = nivel', type: String })
  nivel_id_snapshot?: string;

  @ApiProperty({ description: 'Snapshot de los Grado elegidos cuando alcance = grados', type: [String] })
  grado_ids_snapshot!: string[];

  @ApiProperty({ description: 'IDs de Aula con ProcesoAula creado', type: [String] })
  aulas!: string[];

  @ApiProperty({ description: 'IDs de Aula del alcance resuelto excluidas por no tener matrícula activa', type: [String] })
  aulas_excluidas!: string[];
}
