import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR4 (design.md "Contratos HTTP", tarea 12.2). Expone `nivel_id`, nunca
// el objeto `Nivel` anidado (design.md "Contratos HTTP", "Los DTO de respuesta exponen los ids de
// las FK, nunca objetos anidados expandidos").
export class GradoRespuestaDto {
  @ApiProperty({ description: 'ID del grado', type: String })
  id!: string;

  @ApiProperty({ description: "Nombre del grado, único dentro de su Nivel", type: String })
  nombre!: string;

  @ApiProperty({ description: 'ID del Nivel al que pertenece el grado', type: String })
  nivel_id!: string;
}
