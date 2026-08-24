import { ApiProperty } from '@nestjs/swagger';

// descubrimiento-derechos-voto, PR1 (design.md D4/D6, "Contratos"). Respuesta de
// `GET /votos/mis-derechos`: mismo criterio de DTOs planos con `@ApiProperty({ type })` explícito
// que `papeleta.dto.ts` (evita el bug de metadata circular de `@nestjs/swagger` con `tsx`/esbuild).
//
// D6/ADR-0010: este DTO NUNCA declara `lista_id`/`opcion_id`/`candidato_id`/`blanco`/
// `codigo_comprobante`, ni siquiera el `voto.id` — sólo `ya_voto: boolean`. Secreto del voto.
export class ProcesoDerechoDto {
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  nombre!: string;

  @ApiProperty({
    description: 'Tipo de proceso electoral',
    enum: ['municipio', 'representante_aula', 'padres', 'consulta'],
  })
  tipo!: 'municipio' | 'representante_aula' | 'padres' | 'consulta';

  @ApiProperty({ type: String })
  fecha_cierre_prevista!: string;
}

export class MiDerechoVotoDto {
  @ApiProperty({ type: String })
  derecho_voto_id!: string;

  // D4/ADR-0011: `estudiante`/`padre` se emiten como entradas separadas 1:1, nunca agrupadas.
  @ApiProperty({ type: String })
  en_calidad_de!: string;

  @ApiProperty({ type: Boolean })
  ya_voto!: boolean;

  @ApiProperty({ type: () => ProcesoDerechoDto })
  proceso!: ProcesoDerechoDto;
}
