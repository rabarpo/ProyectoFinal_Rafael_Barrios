import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR4 (design.md "Contratos HTTP", tarea 12.1).
export class NivelRespuestaDto {
  @ApiProperty({ description: 'ID del nivel', type: String })
  id!: string;

  @ApiProperty({ description: 'Nombre único del nivel', type: String })
  nombre!: string;
}
