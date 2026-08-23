import { ApiProperty } from '@nestjs/swagger';

// dashboard-panel-jornada (Backlog #20, PR1; design.md "Endpoints"/D4, tarea 2.1). Serie sobre
// `Voto.hora_servidor` (D4 — `Voto.creado_en` NO existe en `schema.prisma`, corrección de la
// exploración). Franjas rellenas desde `apertura_real` hasta `min(now, cierre_real)`, sin huecos.
export class FranjaVotosPorHoraDto {
  @ApiProperty({ description: 'Inicio de la franja horaria (truncada a la hora), ISO', type: String })
  hora_inicio!: string;

  @ApiProperty({ description: 'count(Voto) emitidos en esa franja', type: Number })
  votos!: number;
}

export class VotosPorHoraDto {
  @ApiProperty({ description: 'Instante del cálculo (now() de Postgres), ISO', type: String })
  hora_servidor!: string;

  @ApiProperty({ description: 'Serie cronológica, sin franjas vacías omitidas', type: () => [FranjaVotosPorHoraDto] })
  franjas!: FranjaVotosPorHoraDto[];
}
