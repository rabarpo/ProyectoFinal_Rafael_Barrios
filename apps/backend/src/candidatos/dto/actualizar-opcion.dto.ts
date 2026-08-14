import { ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR3 (design.md D5, tarea 8.1). Deliberadamente SIN
// `proceso_id`: el DTO no lo declara, así que ni siquiera compila re-parentar una `OpcionConsulta`
// por este camino (mismo criterio D3 de `ActualizarListaDto`/`ActualizarAulaDto`). `etiqueta` sigue
// siendo editable — la colisión con otra opción del mismo proceso se traduce a `409
// RESTRICCION_UNICA` igual que en la creación.
export class ActualizarOpcionDto {
  @ApiPropertyOptional({ description: 'Etiqueta de la opción, texto libre sin restricción A/B/C', type: String })
  etiqueta?: string;

  @ApiPropertyOptional({ description: 'Descripción de la opción', type: String })
  descripcion?: string;
}
