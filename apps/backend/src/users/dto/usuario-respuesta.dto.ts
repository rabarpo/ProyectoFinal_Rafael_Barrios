import { ApiProperty } from '@nestjs/swagger';
import type { EstadoUsuario, RolUsuario } from '@prisma/client';

// administracion-usuarios-apoderados, PR1 (design.md "Contratos HTTP", tarea 4.1). Nunca incluye
// `password_hash` ni `google_id` — material de credencial, spec "Aislamiento de rol comite" /
// adversarial 7.9-11.7. `creado_en` viaja como ISO 8601 (mismo criterio que el resto del proyecto).
export class UsuarioRespuestaDto {
  @ApiProperty({ description: 'ID del usuario', type: String })
  id!: string;

  @ApiProperty({ description: 'Nombres completos', type: String })
  nombres!: string;

  @ApiProperty({ description: 'DNI', type: String })
  dni!: string;

  @ApiProperty({ description: 'Código institucional único', type: String })
  codigo!: string;

  @ApiProperty({ description: 'Correo electrónico', type: String })
  correo!: string;

  @ApiProperty({
    description: 'Rol del usuario',
    enum: ['estudiante', 'docente', 'comite', 'administrador', 'director'],
  })
  rol!: RolUsuario;

  @ApiProperty({ description: 'Estado del usuario', enum: ['activo', 'inactivo', 'bloqueado'] })
  estado!: EstadoUsuario;

  @ApiProperty({ description: 'Fecha de creación (ISO 8601)', type: String })
  creado_en!: string;
}
