import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// configuracion-general, PR2 (design.md "Interfaces / Contracts", tarea 2.6). `logo_presente`/
// `logo_mime` viajaron desde PR2 con la forma final del contrato, fijos en `false`/`null` hasta
// que la migración propia de PR3 (tarea 3.0) agregara `logo`/`logo_mime`/`logo_actualizado_en`.
// PR3 (tarea 3.5): `ConfiguracionService` ahora lee los valores reales de la fila.
export class ConfiguracionRespuestaDto {
  @ApiProperty({ description: 'ID de la fila de configuración', type: String })
  id!: string;

  @ApiPropertyOptional({ description: 'Nombre de la institución', type: String, nullable: true })
  nombre!: string | null;

  @ApiPropertyOptional({
    description: 'Nombre del director o directora',
    type: String,
    nullable: true,
  })
  director!: string | null;

  @ApiPropertyOptional({
    description: 'Color primario en formato hex',
    type: String,
    nullable: true,
  })
  color_primario!: string | null;

  @ApiPropertyOptional({
    description: 'Color secundario en formato hex',
    type: String,
    nullable: true,
  })
  color_secundario!: string | null;

  @ApiPropertyOptional({
    description: 'Zona horaria IANA',
    type: String,
    nullable: true,
  })
  zona_horaria!: string | null;

  @ApiProperty({ description: 'Dominios Google Workspace permitidos', type: [String] })
  dominios_google!: string[];

  @ApiProperty({ description: 'Si hay un logo institucional persistido', type: Boolean })
  logo_presente!: boolean;

  @ApiPropertyOptional({
    description: 'MIME type del logo persistido, si existe',
    type: String,
    nullable: true,
  })
  logo_mime!: string | null;
}
