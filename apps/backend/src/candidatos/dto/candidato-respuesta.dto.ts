import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR4 (design.md "Contratos HTTP", tarea 11.2, spec "GET
// /candidatos nunca expone bytes"). `foto_presente`/`foto_mime` reemplazan los bytes de la foto —
// el binario solo viaja por `GET /candidatos/:id/foto` (`StreamableFile`, PR5).
export class CandidatoRespuestaDto {
  @ApiProperty({ description: 'ID del candidato', type: String })
  id!: string;

  @ApiProperty({ description: 'ID del ProcesoElectoral al que pertenece', type: String })
  proceso_id!: string;

  @ApiPropertyOptional({ description: 'ID de la Lista a la que pertenece, si aplica', type: String })
  lista_id?: string;

  @ApiProperty({ description: 'Nombres completos del candidato', type: String })
  nombres!: string;

  @ApiPropertyOptional({ description: 'Grado al que pertenece el candidato', type: String })
  grado?: string;

  @ApiPropertyOptional({ description: 'Aula a la que pertenece el candidato', type: String })
  aula?: string;

  @ApiPropertyOptional({ description: 'Cargo postulado', type: String })
  cargo?: string;

  @ApiProperty({ description: 'true si el candidato tiene una foto almacenada', type: Boolean })
  foto_presente!: boolean;

  @ApiPropertyOptional({ description: 'MIME de la foto almacenada, si existe', type: String })
  foto_mime?: string;

  @ApiProperty({ description: 'Estado de participación del candidato', enum: ['activo', 'baja'] })
  estado!: string;

  @ApiPropertyOptional({ description: 'Fecha/hora de la baja (ISO 8601), ausente si está activo', type: String })
  baja_en?: string;
}
