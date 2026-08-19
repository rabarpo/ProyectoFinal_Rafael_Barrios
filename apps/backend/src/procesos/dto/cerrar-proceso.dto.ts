import { ApiProperty } from '@nestjs/swagger';

// cierre-escrutinio-actas (#17, PR3; design.md D9). Body de `POST /procesos/:id/cerrar`: mismo
// criterio de `AbrirProcesoDto` — validación manual, sin `class-validator`, ANTES de abrir la
// transacción. `firmantes` congela el comité que firma las 4 actas en el mismo acto (decisión 5 de
// la propuesta): mínimo 1, máximo 10 (layout del PDF de D12), `nombre`/`cargo` no vacíos tras
// `trim()` y de hasta 120 caracteres.
export class FirmanteDto {
  @ApiProperty({ description: 'Nombre completo del firmante', type: String })
  nombre!: string;

  @ApiProperty({ description: 'Cargo del firmante dentro del comité', type: String })
  cargo!: string;
}

export class CerrarProcesoDto {
  @ApiProperty({ description: 'Confirmación explícita del usuario; debe ser exactamente `true`', type: Boolean })
  confirmar!: boolean;

  @ApiProperty({ description: 'Firmantes del acta (mínimo 1, máximo 10)', type: [FirmanteDto] })
  firmantes!: FirmanteDto[];
}
