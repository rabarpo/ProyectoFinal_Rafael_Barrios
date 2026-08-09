import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR6 (design.md D3, tarea 19.1). `grado_id`, `seccion_id` y
// `anio_escolar_id` son obligatorios en la creación (cada `Aula` está acotada a un `Grado`, una
// `Seccion` y un `AnioEscolar` existentes) pero deliberadamente ausentes de `ActualizarAulaDto` —
// mover un `Aula` de padre exige un endpoint dedicado que este change no define (D3, "sin
// re-parentado"). `grado_id`/`anio_escolar_id` DEBEN coincidir con los de la `Seccion` referenciada
// (D6, "Coherencia jerárquica"), verificado por `AulasService.crear()`.
export class CrearAulaDto {
  @ApiProperty({ description: 'Turno del aula', enum: ['manana', 'tarde'] })
  turno!: string;

  @ApiProperty({ description: 'ID del Grado al que pertenece el aula (debe coincidir con el de la Seccion)', type: String })
  grado_id!: string;

  @ApiProperty({ description: 'ID de la Seccion a la que pertenece el aula', type: String })
  seccion_id!: string;

  @ApiProperty({ description: 'ID del AnioEscolar al que pertenece el aula (debe coincidir con el de la Seccion)', type: String })
  anio_escolar_id!: string;
}
