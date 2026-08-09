import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR6 (design.md "Contratos HTTP", tarea 19.1). Query params de
// `GET /aulas`: `grado_id`/`seccion_id`/`anio_escolar_id` viajan como string (un valor que no sea
// un UUID válido es `400 CAMPO_INVALIDO`, validado a mano en `AulasService`, sin
// `class-validator`); `turno` fuera de `{manana, tarde}` es también `400 CAMPO_INVALIDO` — mismo
// criterio que `ListarSeccionesQuery`.
export class ListarAulasQuery {
  @ApiPropertyOptional({ description: 'Filtra por ID de Grado', type: String })
  grado_id?: string;

  @ApiPropertyOptional({ description: 'Filtra por ID de Seccion', type: String })
  seccion_id?: string;

  @ApiPropertyOptional({ description: 'Filtra por ID de AnioEscolar', type: String })
  anio_escolar_id?: string;

  @ApiPropertyOptional({ description: 'Filtra por turno', enum: ['manana', 'tarde'] })
  turno?: string;
}
