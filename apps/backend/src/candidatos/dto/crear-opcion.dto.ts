import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR3 (design.md D5, "Contratos HTTP", tarea 8.1). FK en el
// body (D5, "Superficie de rutas"), no anidado bajo /procesos/:procesoId. `etiqueta` es texto libre
// (spec "OpciónConsulta.etiqueta como texto libre") y única junto a `proceso_id`
// (@@unique([proceso_id, etiqueta])) — la colisión se traduce a `409 RESTRICCION_UNICA` en
// `OpcionesService.crear()`.
export class CrearOpcionDto {
  @ApiProperty({ description: 'ID del ProcesoElectoral al que pertenece la opción', type: String })
  proceso_id!: string;

  @ApiProperty({ description: 'Etiqueta de la opción, texto libre sin restricción A/B/C', type: String })
  etiqueta!: string;

  @ApiPropertyOptional({ description: 'Descripción de la opción', type: String })
  descripcion?: string;
}
