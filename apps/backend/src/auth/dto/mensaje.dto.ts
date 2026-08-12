import { ApiProperty } from '@nestjs/swagger';

// administracion-procesos-electorales, PR1 (design.md D9, tarea 1.1). DTO de respuesta genérico
// para las rutas de `/auth` que hoy devuelven `{ mensaje: string }` a mano (login, loginGoogle),
// sin `class-validator` — mismo criterio que el resto de los DTO de `auth` (esta clase describe el
// shape de la respuesta, no valida entrada).
export class MensajeDto {
  @ApiProperty({ description: 'Mensaje descriptivo del resultado de la operación', example: 'Login exitoso', type: String })
  mensaje!: string;
}
