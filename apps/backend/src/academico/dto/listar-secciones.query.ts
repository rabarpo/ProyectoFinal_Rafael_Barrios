import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR5 (design.md "Contratos HTTP", tarea 16.1). Query params de
// `GET /secciones`: `grado_id`/`anio_escolar_id` viajan como string; un valor que no sea un UUID
// válido es `400 CAMPO_INVALIDO` (validado a mano en `SeccionesService`, sin `class-validator`,
// mismo criterio que `ListarGradosQuery`).
export class ListarSeccionesQuery {
  @ApiPropertyOptional({ description: 'Filtra por ID de Grado', type: String })
  grado_id?: string;

  @ApiPropertyOptional({ description: 'Filtra por ID de AnioEscolar', type: String })
  anio_escolar_id?: string;
}
