import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR6 (design.md D3, tarea 19.1). Deliberadamente SIN los campos
// `grado_id`/`seccion_id`/`anio_escolar_id`: mover un `Aula` de padre reasignaría en silencio su
// jerarquía (design.md D3, "sin re-parentado") — el DTO no los declara, así que ni siquiera compila
// pasarlos por este camino.
export class ActualizarAulaDto {
  @ApiPropertyOptional({ description: 'Turno del aula', enum: ['manana', 'tarde'] })
  turno?: string;
}
