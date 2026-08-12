import { ApiProperty } from '@nestjs/swagger';

// google-oauth-y-recuperacion, PR2 (design.md D3, tarea 8.1). `password` es opcional: solo se
// exige cuando el Usuario ya tiene `password_hash` y aún no tiene `google_id` (D3, estados 5-7).
// Validación manual (no hay `class-validator` instalado en el proyecto).
export class GoogleLoginDto {
  // administracion-procesos-electorales, PR1 (design.md D9). `type: String` explícito por el
  // mismo motivo documentado en `login.dto.ts`: `tsx`/esbuild no emite `design:type` completo para
  // que `@nestjs/swagger` infiera el tipo al explorar el modelo desde `@ApiBody`.
  @ApiProperty({ description: 'ID token de Google emitido tras el login OAuth en el cliente', type: String })
  idToken!: string;

  @ApiProperty({
    description:
      'Contraseña actual, requerida solo para confirmar la vinculación de una cuenta existente con password_hash',
    required: false,
    type: String,
  })
  password?: string;
}
