import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// resultados-en-vivo (#16, PR1; design.md D5, D12, tarea 1.1). Fila del desglose por
// candidato/lista/opción — catálogo completo, incluidos ítems con 0 votos y `estado: 'baja'`
// (D4: nunca se filtra `estado: 'activo'` en el catálogo del desglose).
export class ResultadoOpcionDto {
  @ApiProperty({ description: 'ID de Candidato/Lista/OpcionConsulta', type: String })
  id!: string;

  @ApiProperty({ description: 'Nombre/etiqueta a mostrar', type: String })
  etiqueta!: string;

  @ApiProperty({ description: 'Cantidad de votos recibidos', type: Number })
  votos!: number;

  @ApiProperty({ description: 'activo | baja. OpcionConsulta siempre activo', enum: ['activo', 'baja'] })
  estado!: 'activo' | 'baja';
}

/**
 * resultados-en-vivo (#16, PR1; design.md D5, tarea 1.1). UN solo DTO: en modo oculto,
 * `dimension`/`desglose`/`blancos` quedan AUSENTES (`undefined`), nunca `null` ni `[]` — el
 * requisito 3 de la spec cierra el conjunto de campos del modo oculto en cinco claves exactas.
 * `estado_visibilidad` y `resultados_ocultos_por_configuracion` se conservan como campos
 * distintos a propósito (ver design.md, "Interfaces / Contratos") aunque hoy sean equivalentes.
 */
export class ResultadosRespuestaDto {
  @ApiProperty({ description: 'visible | oculto, según ProcesoElectoral.ocultar_resultados', enum: ['visible', 'oculto'] })
  estado_visibilidad!: 'visible' | 'oculto';

  @ApiProperty({ description: 'Idéntico para todos los roles; no es información sensible', type: Boolean })
  resultados_ocultos_por_configuracion!: boolean;

  @ApiProperty({ description: 'count(Voto) del proceso', type: Number })
  votos_emitidos!: number;

  @ApiProperty({ description: 'count(DerechoVoto) del proceso (padrón congelado, nunca Matricula/Usuario en vivo)', type: Number })
  padron_total!: number;

  @ApiProperty({ description: 'Instante del cálculo (now() de Postgres dentro de la transacción), ISO', type: String })
  hora_servidor!: string;

  @ApiPropertyOptional({ description: 'Sólo en modo visible', enum: ['lista', 'candidato', 'opcion'] })
  dimension?: 'lista' | 'candidato' | 'opcion';

  @ApiPropertyOptional({ description: 'Sólo en modo visible', type: () => [ResultadoOpcionDto] })
  desglose?: ResultadoOpcionDto[];

  @ApiPropertyOptional({ description: 'Sólo en modo visible: count(Voto WHERE blanco = true)', type: Number })
  blancos?: number;
}
