import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// administracion-usuarios-apoderados, PR1 (design.md D3, tarea 4.2). `correo` opcional, mismo
// campo nulable que el esquema (`Apoderado.correo String?`). Sin `class-validator`, mismo criterio
// que el resto de los DTO del módulo.
export class CrearApoderadoDto {
  @ApiProperty({ description: 'Nombres completos del apoderado', type: String })
  nombres!: string;

  @ApiProperty({ description: 'DNI del apoderado', type: String })
  dni!: string;

  @ApiPropertyOptional({ description: 'Correo de contacto del apoderado', type: String })
  correo?: string;
}
