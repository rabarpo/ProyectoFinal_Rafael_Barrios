import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR6 (design.md "Contratos HTTP", tarea 19.1). Expone `grado_id`,
// `seccion_id` y `anio_escolar_id`, nunca los objetos `Grado`/`Seccion`/`AnioEscolar` anidados
// (design.md "Contratos HTTP", "Los DTO de respuesta exponen los ids de las FK, nunca objetos
// anidados expandidos").
export class AulaRespuestaDto {
  @ApiProperty({ description: 'ID del aula', type: String })
  id!: string;

  @ApiProperty({ description: 'Turno del aula', enum: ['manana', 'tarde'] })
  turno!: string;

  @ApiProperty({ description: 'ID del Grado al que pertenece el aula', type: String })
  grado_id!: string;

  @ApiProperty({ description: 'ID de la Seccion a la que pertenece el aula', type: String })
  seccion_id!: string;

  @ApiProperty({ description: 'ID del AnioEscolar al que pertenece el aula', type: String })
  anio_escolar_id!: string;
}
