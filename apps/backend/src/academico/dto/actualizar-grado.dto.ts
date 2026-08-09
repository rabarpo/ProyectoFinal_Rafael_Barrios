import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR4 (design.md D3, tarea 12.2). Deliberadamente SIN el campo
// `nivel_id`: mover un `Grado` de `Nivel` reasignaría en silencio todo un subárbol de secciones y
// aulas (design.md D3, "sin re-parentado") — el DTO no lo declara, así que ni siquiera compila
// pasarlo por este camino.
export class ActualizarGradoDto {
  @ApiPropertyOptional({ description: 'Nombre del grado', type: String })
  nombre?: string;
}
