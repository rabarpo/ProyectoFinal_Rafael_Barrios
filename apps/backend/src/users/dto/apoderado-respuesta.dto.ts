import { ApiProperty } from '@nestjs/swagger';

// administracion-usuarios-apoderados, PR1 (design.md "Contratos HTTP", tarea 4.2).
export class ApoderadoRespuestaDto {
  @ApiProperty({ description: 'ID del apoderado', type: String })
  id!: string;

  @ApiProperty({ description: 'Nombres completos del apoderado', type: String })
  nombres!: string;

  @ApiProperty({ description: 'DNI del apoderado', type: String })
  dni!: string;

  @ApiProperty({ description: 'Correo de contacto del apoderado', type: String, nullable: true })
  correo!: string | null;
}
