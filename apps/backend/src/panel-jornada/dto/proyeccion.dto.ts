import { ApiProperty } from '@nestjs/swagger';
import { AulaAvanceDto } from './avance-aulas.dto';
import { FranjaVotosPorHoraDto } from './votos-por-hora.dto';

// dashboard-panel-jornada (Backlog #20, PR1; design.md "Endpoints"/D8, tarea 2.1). SIN
// `desglose`/`blancos`/`dimension` bajo NINGUNA circunstancia — estructural, no un filtro (D8,
// threat: Fuga de desglose por la puerta de proyección). Este DTO no tiene ni puede tener esos
// campos: el servicio de proyección nunca importa `calcularEscrutinio`.
export class ProyeccionDto {
  @ApiProperty({ description: 'Instante del cálculo (now() de Postgres), ISO', type: String })
  hora_servidor!: string;

  @ApiProperty({ description: 'count(DerechoVoto) del proceso (padrón congelado)', type: Number })
  padron_total!: number;

  @ApiProperty({ description: 'count(Voto) del proceso', type: Number })
  votos_emitidos!: number;

  @ApiProperty({ description: 'Serie cronológica de votos por hora', type: () => [FranjaVotosPorHoraDto] })
  franjas!: FranjaVotosPorHoraDto[];

  @ApiProperty({ description: 'Avance por aula, sólo participación', type: () => [AulaAvanceDto] })
  aulas!: AulaAvanceDto[];
}
