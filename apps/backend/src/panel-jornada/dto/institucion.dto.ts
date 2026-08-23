import { ApiProperty } from '@nestjs/swagger';

// dashboard-panel-jornada (Backlog #20, PR1; design.md "Endpoints"/tarea 2.1). Institucional
// (sin proceso_id): `vinculos_apoderado` cuenta filas `Apoderado` crudas, SIN dedup por DNI
// (decisión 3 de la propuesta, cerrada — nunca se implementa la deduplicación).
export class InstitucionDto {
  @ApiProperty({ description: 'count(Usuario WHERE rol=estudiante AND estado=activo)', type: Number })
  estudiantes!: number;

  @ApiProperty({ description: 'count(Apoderado), filas crudas sin dedup por DNI', type: Number })
  vinculos_apoderado!: number;

  @ApiProperty({ description: 'Instante del cálculo (now() de Postgres), ISO', type: String })
  hora_servidor!: string;
}
