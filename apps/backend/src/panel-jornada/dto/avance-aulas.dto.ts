import { ApiProperty } from '@nestjs/swagger';

// dashboard-panel-jornada (Backlog #20, PR1; design.md "Endpoints"/D3/D7, tarea 2.1). `rezagada`
// se evalúa SIEMPRE en el servidor (ADR-0005) — nunca en el cliente. Nunca se emite desglose por
// candidato a nivel de aula, sólo participación (mitigación de inferencia en aulas pequeñas).
export class AulaAvanceDto {
  @ApiProperty({ description: 'ID del Aula (vía DerechoVoto.aula_snapshot, D3)', type: String })
  aula_id!: string;

  @ApiProperty({ description: 'Etiqueta legible: turno + grado + sección', type: String })
  etiqueta!: string;

  @ApiProperty({ description: 'count(DerechoVoto) del aula (padrón congelado)', type: Number })
  padron!: number;

  @ApiProperty({ description: 'count(Voto) del aula', type: Number })
  votos!: number;

  @ApiProperty({ description: 'votos / padron * 100, 0 si padron = 0', type: Number })
  porcentaje!: number;

  @ApiProperty({ description: 'padron > 0 && porcentaje <= participacion_global_pp - UMBRAL_REZAGO_PP (D7)', type: Boolean })
  rezagada!: boolean;
}

export class AvanceAulasDto {
  @ApiProperty({ description: 'Instante del cálculo (now() de Postgres), ISO', type: String })
  hora_servidor!: string;

  @ApiProperty({ description: '% participación global del proceso, en puntos porcentuales', type: Number })
  participacion_global_pp!: number;

  @ApiProperty({ description: 'Umbral relativo aplicado (D7)', type: Number })
  umbral_rezago_pp!: number;

  @ApiProperty({ description: 'Una fila por aula del proceso', type: () => [AulaAvanceDto] })
  aulas!: AulaAvanceDto[];
}
