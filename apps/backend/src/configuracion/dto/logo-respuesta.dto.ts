import { ApiProperty } from '@nestjs/swagger';

// configuracion-general, PR3 (design.md "Interfaces / Contracts", tarea 3.5). Respuesta de
// `POST /configuracion/logo` — nunca incluye los bytes (esos solo viajan por
// `GET /configuracion/logo`, con `Content-Type` exacto y cabeceras restrictivas).
export class LogoRespuestaDto {
  @ApiProperty({
    description: 'MIME type persistido del logo (image/png, image/jpeg o image/svg+xml)',
    type: String,
  })
  logo_mime!: string;

  @ApiProperty({ description: 'Fecha/hora en que se persistió el logo (ISO 8601)', type: String })
  logo_actualizado_en!: string;
}
