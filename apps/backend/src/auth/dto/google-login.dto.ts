import { ApiProperty } from '@nestjs/swagger';

// google-oauth-y-recuperacion, PR2 (design.md D3, tarea 8.1). `password` es opcional: solo se
// exige cuando el Usuario ya tiene `password_hash` y aún no tiene `google_id` (D3, estados 5-7).
// Validación manual (no hay `class-validator` instalado en el proyecto).
export class GoogleLoginDto {
  @ApiProperty({ description: 'ID token de Google emitido tras el login OAuth en el cliente' })
  idToken!: string;

  @ApiProperty({
    description:
      'Contraseña actual, requerida solo para confirmar la vinculación de una cuenta existente con password_hash',
    required: false,
  })
  password?: string;
}
