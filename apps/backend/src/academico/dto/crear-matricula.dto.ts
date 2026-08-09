import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR7 (design.md D3, tarea 24.1). `usuario_id`, `aula_id` y
// `anio_escolar_id` son obligatorios en la creación (spec "Alta de Matrícula vinculando Usuario,
// Aula y AñoEscolar existentes"). `anio_escolar_id` DEBE coincidir con el `anio_escolar_id` del
// `Aula` referenciada (D6, "Coherencia jerárquica de Matrícula con su Aula"), verificado por
// `MatriculasService.crear()`. Sin `actualizar-matricula.dto.ts`: la spec no define `PATCH` para
// `Matricula` — un traslado es `DELETE` + `POST` (D3).
export class CrearMatriculaDto {
  @ApiProperty({ description: 'ID del Usuario (debe tener rol = estudiante) a matricular', type: String })
  usuario_id!: string;

  @ApiProperty({ description: 'ID del Aula en la que se matricula el Usuario', type: String })
  aula_id!: string;

  @ApiProperty({ description: 'ID del AnioEscolar (debe coincidir con el del Aula)', type: String })
  anio_escolar_id!: string;
}
