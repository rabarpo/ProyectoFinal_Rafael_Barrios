import { ApiProperty } from '@nestjs/swagger';

// google-oauth-y-recuperacion, PR3 (design.md, tarea 11.1). Mismo contrato sirve tanto para
// resetear la contraseña de una cuenta existente como para establecer la primera contraseña de
// una cuenta solo-OAuth (spec "El mismo endpoint de recuperación establece la primera contraseña
// de cuentas solo-OAuth"). Validación manual (no hay `class-validator` instalado).
export class RecoveryConfirmDto {
  @ApiProperty({ description: 'Token de un solo uso recibido por correo' })
  token!: string;

  @ApiProperty({ description: 'Contraseña nueva (mínimo 8 caracteres)' })
  password!: string;
}
