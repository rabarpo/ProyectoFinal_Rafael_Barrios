import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR4 (design.md D4, "Contratos HTTP", tarea 11.2). Transporte
// `multipart/form-data` (D4): todos los escalares de `Candidato` son `String`, sin coerción manual
// — la foto viaja en el mismo request como el campo de archivo `foto` (fuera de este DTO, leído vía
// `@UploadedFile()`). `lista_id` es opcional (`representante_aula` puede no tener `Lista`, D1).
export class CrearCandidatoDto {
  @ApiProperty({ description: 'ID del ProcesoElectoral al que pertenece el candidato', type: String })
  proceso_id!: string;

  @ApiProperty({ description: 'Nombres completos del candidato', type: String })
  nombres!: string;

  @ApiPropertyOptional({ description: 'Grado al que pertenece el candidato', type: String })
  grado?: string;

  @ApiPropertyOptional({ description: 'Aula a la que pertenece el candidato', type: String })
  aula?: string;

  @ApiPropertyOptional({ description: 'Cargo postulado, texto libre sin restricción de unicidad', type: String })
  cargo?: string;

  @ApiPropertyOptional({ description: 'ID de la Lista a la que pertenece el candidato', type: String })
  lista_id?: string;

  @ApiProperty({ description: 'Foto del candidato (PNG/JPG, máximo 2MB), obligatoria al crear', type: 'string', format: 'binary' })
  foto!: unknown;
}
