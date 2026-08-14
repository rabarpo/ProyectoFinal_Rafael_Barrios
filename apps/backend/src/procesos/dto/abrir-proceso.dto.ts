import { ApiProperty } from '@nestjs/swagger';

// apertura-proceso-congelamiento-padron (#13, PR2; design.md D9). Body de `POST /procesos/:id/abrir`:
// un único campo booleano de confirmación explícita. `confirmar !== true` rechaza con
// `400 CAMPO_INVALIDO` antes de abrir la transacción (mismo criterio manual de `procesos.errors.ts`,
// sin `class-validator`, igual que `CrearProcesoDto`/`ActualizarProcesoDto`).
export class AbrirProcesoDto {
  @ApiProperty({ description: 'Confirmación explícita del usuario; debe ser exactamente `true`', type: Boolean })
  confirmar!: boolean;
}
