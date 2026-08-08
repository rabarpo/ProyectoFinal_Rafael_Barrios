import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-usuarios-apoderados, PR1 (design.md D3, tarea 4.2). Todos los campos opcionales,
// mismo criterio que `ActualizarUsuarioDto`.
export class ActualizarApoderadoDto {
  @ApiPropertyOptional({ description: 'Nombres completos del apoderado', type: String })
  nombres?: string;

  @ApiPropertyOptional({ description: 'DNI del apoderado', type: String })
  dni?: string;

  @ApiPropertyOptional({ description: 'Correo de contacto del apoderado', type: String })
  correo?: string;
}
