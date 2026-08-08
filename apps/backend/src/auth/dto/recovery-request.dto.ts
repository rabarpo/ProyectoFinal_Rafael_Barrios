import { ApiProperty } from '@nestjs/swagger';

// google-oauth-y-recuperacion, PR3 (design.md, tarea 11.1). Validación manual (no hay
// `class-validator` instalado en el proyecto).
export class RecoveryRequestDto {
  @ApiProperty({ description: 'Correo de la cuenta a recuperar', example: 'usuario@colegio.edu.ar' })
  correo!: string;
}
