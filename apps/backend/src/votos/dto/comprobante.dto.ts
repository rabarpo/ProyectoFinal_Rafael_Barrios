import { ApiProperty } from '@nestjs/swagger';

// vote-casting, PR3 (design.md D6/D13, "Contratos HTTP", tarea 10.1). Respuesta de `POST /votos`:
// idéntica en `201` (creado) y `200` (reintento o colisión, D6) — el cliente nunca distingue el
// camino por el cuerpo, solo por el status. `eleccion_resumen` SÍ viaja al votante ([ADR-0006] §2,
// design.md "Contratos HTTP"): es su propio voto, distinto del payload de auditoría (D11), que
// nunca lleva la elección.
//
// Mismo idioma de `@ApiProperty({ type })` explícito que `papeleta.dto.ts` (PR1) — evita el
// "circular dependency" de `@nestjs/swagger` con metadata de tipos primitivos anidados bajo `tsx`.
export class ComprobanteProcesoDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  nombre!: string;
}

export class ComprobanteDto {
  @ApiProperty({ type: String })
  codigo_comprobante!: string;

  @ApiProperty({ type: String })
  hora_servidor!: string;

  @ApiProperty({ type: () => ComprobanteProcesoDto })
  proceso!: ComprobanteProcesoDto;

  @ApiProperty({ type: String })
  en_calidad_de!: string;

  @ApiProperty({ type: String })
  eleccion_resumen!: string;
}
