import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR3 (design.md "Contratos HTTP", tarea 8.1).
// `OpcionConsulta` no tiene `estado`/`baja_en` en el schema (design.md "Contratos HTTP") — sin
// baja lógica, respuesta plana.
export class OpcionRespuestaDto {
  @ApiProperty({ description: 'ID de la opción', type: String })
  id!: string;

  @ApiProperty({ description: 'ID del ProcesoElectoral al que pertenece', type: String })
  proceso_id!: string;

  @ApiProperty({ description: 'Etiqueta de la opción', type: String })
  etiqueta!: string;

  @ApiPropertyOptional({ description: 'Descripción de la opción', type: String })
  descripcion?: string;
}
