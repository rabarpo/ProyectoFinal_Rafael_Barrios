import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR4 (design.md D3, tarea 12.1). Sin `class-validator` — mismo criterio
// que `CrearAnioEscolarDto`, toda validación de negocio vive en `NivelesService`.
export class CrearNivelDto {
  @ApiProperty({ description: 'Nombre único del nivel', type: String })
  nombre!: string;
}
