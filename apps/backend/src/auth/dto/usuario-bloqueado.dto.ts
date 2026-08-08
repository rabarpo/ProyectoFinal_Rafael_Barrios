import { ApiProperty } from '@nestjs/swagger';

// bloqueo-desbloqueo-cuentas, PR3 (design.md "Contratos"). Sin `class-validator` — mismo criterio
// que el resto de los DTO de `auth` (no hay `ValidationPipe` en el proyecto, esta clase describe
// el shape de la respuesta, no valida entrada).
export class UsuarioBloqueadoDto {
  @ApiProperty({ description: 'ID del usuario bloqueado', type: String })
  id!: string;

  @ApiProperty({ description: 'Nombres completos del usuario', type: String })
  nombres!: string;

  @ApiProperty({ description: 'DNI del usuario', type: String })
  dni!: string;

  @ApiProperty({ description: 'Código institucional único del usuario', type: String })
  codigo!: string;

  @ApiProperty({
    description: 'Fin del bloqueo (ISO 8601); null si el bloqueo es indefinido',
    type: String,
    nullable: true,
  })
  bloqueado_hasta!: string | null;
}
