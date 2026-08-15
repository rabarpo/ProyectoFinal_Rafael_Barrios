import { ApiProperty } from '@nestjs/swagger';

// vote-casting, PR2 (design.md "Contratos HTTP"/D9, tarea 5.1). Body de `POST /votos`: DTO plano
// con `@ApiProperty` explícito (sin `class-validator`, mismo idioma que `#11`-`#13`). Los cuatro
// campos de elección son opcionales — exactamente uno de `{lista_id, opcion_id, candidato_id,
// blanco}` debe estar presente; esa validación vive en `VotosService.emitir()`
// (`validarEleccionExactamenteUna`), nunca en el DTO — acá solo se describe la forma del body para
// `@nestjs/swagger`.
export class EmitirVotoDto {
  @ApiProperty({ type: String })
  derecho_voto_id!: string;

  @ApiProperty({ type: String, required: false })
  lista_id?: string;

  @ApiProperty({ type: String, required: false })
  opcion_id?: string;

  @ApiProperty({ type: String, required: false })
  candidato_id?: string;

  @ApiProperty({ type: Boolean, required: false })
  blanco?: boolean;

  @ApiProperty({ type: String })
  clave_idempotencia!: string;
}
