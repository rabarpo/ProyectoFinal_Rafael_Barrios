import { ApiProperty } from '@nestjs/swagger';
import type { RolUsuario } from '@prisma/client';

// administracion-usuarios-apoderados, PR1 (design.md D3, tarea 4.1). Sin `class-validator` —
// mismo criterio que el resto de los DTO de `auth` (no hay `ValidationPipe` en el proyecto, toda
// validación de negocio vive en `UsersService`). `password_hash` no aparece: siempre se fija en
// `null` en la creación manual (spec "Creación de Usuario para cualquiera de los cinco roles").
export class CrearUsuarioDto {
  @ApiProperty({ description: 'Nombres completos del usuario', type: String })
  nombres!: string;

  @ApiProperty({ description: 'DNI, texto libre, máximo 20 caracteres', type: String })
  dni!: string;

  @ApiProperty({ description: 'Código institucional único', type: String })
  codigo!: string;

  @ApiProperty({ description: 'Correo electrónico único, sin exigencia de dominio', type: String })
  correo!: string;

  @ApiProperty({
    description: 'Rol del usuario',
    enum: ['estudiante', 'docente', 'comite', 'administrador', 'director'],
  })
  rol!: RolUsuario;
}
