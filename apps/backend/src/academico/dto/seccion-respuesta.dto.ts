import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR5 (design.md "Contratos HTTP", tarea 16.1). Expone `grado_id` y
// `anio_escolar_id`, nunca los objetos `Grado`/`AnioEscolar` anidados (design.md "Contratos HTTP",
// "Los DTO de respuesta exponen los ids de las FK, nunca objetos anidados expandidos").
export class SeccionRespuestaDto {
  @ApiProperty({ description: 'ID de la sección', type: String })
  id!: string;

  @ApiProperty({ description: 'Nombre de la sección, único dentro de (grado_id, anio_escolar_id)', type: String })
  nombre!: string;

  @ApiProperty({ description: 'ID del Grado al que pertenece la sección', type: String })
  grado_id!: string;

  @ApiProperty({ description: 'ID del AnioEscolar al que pertenece la sección', type: String })
  anio_escolar_id!: string;
}
