import { ApiPropertyOptional } from '@nestjs/swagger';

// configuracion-general, PR2 (design.md "Interfaces / Contracts", tarea 2.6). Todos los campos
// opcionales (merge parcial, `PUT` que se comporta como `PATCH` — mismo criterio de
// `ActualizarAnioEscolarDto`): un campo ausente no se toca; `dominios_google: []` es un valor
// explícito distinto de "ausente" (fail-closed, spec "Arreglo vacío se acepta").
export class ActualizarConfiguracionDto {
  @ApiPropertyOptional({ description: 'Nombre de la institución', type: String })
  nombre?: string;

  @ApiPropertyOptional({ description: 'Nombre del director o directora', type: String })
  director?: string;

  @ApiPropertyOptional({
    description: 'Color primario en formato hex (#RGB o #RRGGBB)',
    type: String,
  })
  color_primario?: string;

  @ApiPropertyOptional({
    description: 'Color secundario en formato hex (#RGB o #RRGGBB)',
    type: String,
  })
  color_secundario?: string;

  @ApiPropertyOptional({ description: 'Zona horaria IANA, p. ej. America/Lima', type: String })
  zona_horaria?: string;

  @ApiPropertyOptional({
    description: 'Dominios Google Workspace permitidos para login (arreglo vacío = fail-closed)',
    type: [String],
  })
  dominios_google?: string[];

  // configuracion-general, PR4 (design.md D3, tarea 4.7; spec envio-correo "Cambio de
  // configuración SMTP no requiere redeploy"). Escribibles vía PUT /configuracion — la contraseña
  // SMTP nunca es un campo de este DTO (D4/D8): sigue viniendo exclusivamente de
  // SMTP_USER/SMTP_PASSWORD en variable de entorno.
  @ApiPropertyOptional({ description: 'Host SMTP', type: String })
  smtp_host?: string;

  @ApiPropertyOptional({ description: 'Puerto SMTP', type: Number })
  smtp_puerto?: number;

  @ApiPropertyOptional({ description: 'Remitente SMTP (From)', type: String })
  smtp_remitente?: string;
}
