import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR2 (design.md "Contratos HTTP", tarea 6.1). `AnioEscolar` no declara
// `creado_en` en el schema (base-schema-and-migrations, #2) — a diferencia de `UsuarioRespuestaDto`,
// este DTO no lleva marca de tiempo.
export class AnioEscolarRespuestaDto {
  @ApiProperty({ description: 'ID del año escolar', type: String })
  id!: string;

  @ApiProperty({ description: 'Nombre único del año escolar', type: String })
  nombre!: string;

  @ApiProperty({ description: 'Indica si es el año escolar activo', type: Boolean })
  activo!: boolean;
}
