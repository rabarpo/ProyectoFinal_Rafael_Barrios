import { ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR2 (design.md D5, tarea 4.3). Deliberadamente SIN
// `proceso_id`: el DTO no lo declara, así que ni siquiera compila re-parentar una `Lista` por este
// camino (mismo criterio D3 de `ActualizarAulaDto`). `numero` sigue siendo editable (no hay
// decisión de diseño que lo excluya) — la colisión con otra lista del mismo proceso se traduce a
// `409 RESTRICCION_UNICA` igual que en la creación.
export class ActualizarListaDto {
  @ApiPropertyOptional({ description: 'Nombre de la lista', type: String })
  nombre?: string;

  @ApiPropertyOptional({ description: 'Número de lista, único dentro del proceso', type: Number })
  numero?: number;

  @ApiPropertyOptional({ description: 'Símbolo de la lista', type: String })
  simbolo?: string;

  @ApiPropertyOptional({ description: 'Lema de la lista', type: String })
  lema?: string;

  @ApiPropertyOptional({ description: 'Propuesta de la lista', type: String })
  propuesta?: string;
}
