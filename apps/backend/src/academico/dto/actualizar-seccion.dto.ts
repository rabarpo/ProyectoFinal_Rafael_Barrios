import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR5 (design.md D3, tarea 16.1). Deliberadamente SIN los campos
// `grado_id`/`anio_escolar_id`: mover una `Seccion` de `Grado`/`AnioEscolar` reasignaría en
// silencio todo un subárbol de aulas (design.md D3, "sin re-parentado") — el DTO no los declara,
// así que ni siquiera compila pasarlos por este camino.
export class ActualizarSeccionDto {
  @ApiPropertyOptional({ description: 'Nombre de la sección', type: String })
  nombre?: string;
}
