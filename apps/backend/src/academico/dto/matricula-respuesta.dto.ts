import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR7 (design.md "Contratos HTTP", tarea 24.1). Expone `usuario_id`,
// `aula_id` y `anio_escolar_id`, nunca los objetos `Usuario`/`Aula`/`AnioEscolar` anidados (mismo
// criterio que `AulaRespuestaDto` — "Los DTO de respuesta exponen los ids de las FK, nunca objetos
// anidados expandidos"; evita filtrar campos de `Usuario` a través de `Matricula`).
export class MatriculaRespuestaDto {
  @ApiProperty({ description: 'ID de la matrícula', type: String })
  id!: string;

  @ApiProperty({ description: 'ID del Usuario (estudiante) matriculado', type: String })
  usuario_id!: string;

  @ApiProperty({ description: 'ID del Aula en la que está matriculado', type: String })
  aula_id!: string;

  @ApiProperty({ description: 'ID del AnioEscolar de la matrícula', type: String })
  anio_escolar_id!: string;
}
