import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR2 (design.md D3, tarea 6.1). Deliberadamente SIN el campo `activo`:
// mover el estado de activación exige el endpoint dedicado `PATCH :id/activar` de PR3 (tarea 7.7,
// adversarial) — el DTO no lo declara, así que ni siquiera compila pasarlo por este camino.
export class ActualizarAnioEscolarDto {
  @ApiPropertyOptional({ description: 'Nombre único del año escolar', type: String })
  nombre?: string;
}
