import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-academica, PR4 (design.md D3, tarea 12.1).
export class ActualizarNivelDto {
  @ApiPropertyOptional({ description: 'Nombre único del nivel', type: String })
  nombre?: string;
}
