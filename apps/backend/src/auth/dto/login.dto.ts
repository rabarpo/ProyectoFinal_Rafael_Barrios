import { ApiProperty } from '@nestjs/swagger';

// auth-server-sessions, PR3 (design.md, tarea 6.1). `codigo` es el identificador de login
// (`Usuario.codigo`, único e institucional); aceptar `correo` queda para un change posterior.
export class LoginDto {
  @ApiProperty({ description: 'Código institucional único del usuario', example: 'seed-comite' })
  codigo!: string;

  @ApiProperty({ description: 'Contraseña en texto plano (nunca persistida ni auditada)' })
  password!: string;
}
