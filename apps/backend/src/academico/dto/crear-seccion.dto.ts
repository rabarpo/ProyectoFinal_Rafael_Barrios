import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR5 (design.md D3, tarea 16.1). `grado_id` y `anio_escolar_id` son
// obligatorios en la creación (cada `Seccion` está acotada a un `Grado` y un `AnioEscolar`
// existentes) pero deliberadamente ausentes de `ActualizarSeccionDto` — mover una `Seccion` de
// `Grado`/`AnioEscolar` exige un endpoint dedicado que este change no define (D3, "sin
// re-parentado").
export class CrearSeccionDto {
  @ApiProperty({ description: 'Nombre de la sección, único dentro de (grado_id, anio_escolar_id)', type: String })
  nombre!: string;

  @ApiProperty({ description: 'ID del Grado al que pertenece la sección', type: String })
  grado_id!: string;

  @ApiProperty({ description: 'ID del AnioEscolar al que pertenece la sección', type: String })
  anio_escolar_id!: string;
}
