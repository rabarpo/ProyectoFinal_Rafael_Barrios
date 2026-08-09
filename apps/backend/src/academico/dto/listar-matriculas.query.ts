import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR7 (design.md "Contratos HTTP", tarea 24.1). Query params de
// `GET /matriculas`: `usuario_id`/`aula_id`/`anio_escolar_id` viajan como string (un valor que no
// sea un UUID válido es `400 CAMPO_INVALIDO`, validado a mano en `MatriculasService`, sin
// `class-validator`) — mismo criterio que `ListarAulasQuery`.
export class ListarMatriculasQuery {
  @ApiPropertyOptional({ description: 'Filtra por ID de Usuario', type: String })
  usuario_id?: string;

  @ApiPropertyOptional({ description: 'Filtra por ID de Aula', type: String })
  aula_id?: string;

  @ApiPropertyOptional({ description: 'Filtra por ID de AnioEscolar', type: String })
  anio_escolar_id?: string;
}
