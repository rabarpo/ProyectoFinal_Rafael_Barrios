import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR2 (design.md "Contratos HTTP", tarea 6.1). Query param de
// `GET /anios-escolares`: `activo` viaja como string ('true'/'false') porque los query params HTTP
// siempre son texto; cualquier otro valor es `400 CAMPO_INVALIDO` (validado a mano en
// `AniosEscolaresService`, sin `class-validator`, mismo criterio que `ListarUsuariosQuery`).
export class ListarAniosEscolaresQuery {
  @ApiPropertyOptional({ description: "Filtra por 'true'/'false'", type: String })
  activo?: string;
}
