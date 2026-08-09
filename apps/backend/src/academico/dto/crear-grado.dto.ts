import { ApiProperty } from '@nestjs/swagger';

// administracion-academica, PR4 (design.md D3, tarea 12.2). `nivel_id` es obligatorio en la
// creación (cada `Grado` está acotado a un `Nivel` existente) pero deliberadamente ausente de
// `ActualizarGradoDto` — mover un `Grado` de `Nivel` exige el endpoint dedicado que este change no
// define (D3, "sin re-parentado").
export class CrearGradoDto {
  @ApiProperty({ description: "Nombre del grado, único dentro de su Nivel (par (nivel_id, nombre))", type: String })
  nombre!: string;

  @ApiProperty({ description: 'ID del Nivel al que pertenece el grado', type: String })
  nivel_id!: string;
}
