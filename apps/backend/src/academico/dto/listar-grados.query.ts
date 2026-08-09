import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR4 (design.md "Contratos HTTP", tarea 12.2). Query param de
// `GET /grados`: `nivel_id` viaja como string; un valor que no sea un UUID válido es
// `400 CAMPO_INVALIDO` (validado a mano en `GradosService`, sin `class-validator`, mismo criterio
// que `ListarAniosEscolaresQuery`).
export class ListarGradosQuery {
  @ApiPropertyOptional({ description: 'Filtra por ID de Nivel', type: String })
  nivel_id?: string;
}
