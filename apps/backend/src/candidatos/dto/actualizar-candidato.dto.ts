import { ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR4 (design.md D4/D5, tarea 11.2). Deliberadamente SIN
// `proceso_id`: sin re-parentado, mismo criterio que `ActualizarListaDto`/`ActualizarOpcionDto`.
// `lista_id` sí es editable (mover un candidato entre listas de un mismo proceso queda cubierto por
// la validación de `COHERENCIA_JERARQUICA` en el servicio). `foto` es opcional en edición (D4): si
// se omite, la foto persistida no cambia.
export class ActualizarCandidatoDto {
  @ApiPropertyOptional({ description: 'Nombres completos del candidato', type: String })
  nombres?: string;

  @ApiPropertyOptional({ description: 'Grado al que pertenece el candidato', type: String })
  grado?: string;

  @ApiPropertyOptional({ description: 'Aula a la que pertenece el candidato', type: String })
  aula?: string;

  @ApiPropertyOptional({ description: 'Cargo postulado, texto libre sin restricción de unicidad', type: String })
  cargo?: string;

  @ApiPropertyOptional({ description: 'ID de la Lista a la que pertenece el candidato', type: String })
  lista_id?: string;

  @ApiPropertyOptional({ description: 'Nueva foto del candidato (PNG/JPG, máximo 2MB); si se omite, la foto actual no cambia', type: 'string', format: 'binary' })
  foto?: unknown;
}
