import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ResultadoOpcionDto } from '../../procesos/dto/resultados-respuesta.dto';

// dashboard-panel-jornada (Backlog #20, PR1; design.md "Endpoints"/D6/D11, tarea 2.1). UN solo
// DTO: en modo oculto, `dimension`/`desglose`/`blancos` quedan AUSENTES (`undefined`), nunca
// `null` ni `[]` — mismo idioma que `ResultadosRespuestaDto` (#16, D5). El panel respeta
// `ocultar_resultados` SIN excepción (D6, cerrado por el usuario, sin excepción tipo
// `ActasController`).
export class ResumenJornadaDto {
  @ApiProperty({ description: 'ID del ProcesoElectoral', type: String })
  proceso_id!: string;

  @ApiProperty({ description: 'Estado actual del proceso', enum: ['abierto', 'cerrado', 'acta_emitida'] })
  estado!: 'abierto' | 'cerrado' | 'acta_emitida';

  @ApiProperty({ description: 'count(DerechoVoto) del proceso (padrón congelado)', type: Number })
  padron_total!: number;

  @ApiProperty({ description: 'count(Voto) del proceso', type: Number })
  votos_emitidos!: number;

  @ApiProperty({ description: 'count(JobCorreo WHERE proceso_id=id AND estado=fallido)', type: Number })
  correos_fallidos!: number;

  @ApiProperty({ description: 'visible | oculto, según ProcesoElectoral.ocultar_resultados (D6)', enum: ['visible', 'oculto'] })
  estado_visibilidad!: 'visible' | 'oculto';

  @ApiProperty({ description: 'Instante del cálculo (now() de Postgres), ISO', type: String })
  hora_servidor!: string;

  @ApiPropertyOptional({ description: 'Sólo en modo visible', enum: ['lista', 'candidato', 'opcion'] })
  dimension?: 'lista' | 'candidato' | 'opcion';

  @ApiPropertyOptional({ description: 'Sólo en modo visible', type: () => [ResultadoOpcionDto] })
  desglose?: ResultadoOpcionDto[];

  @ApiPropertyOptional({ description: 'Sólo en modo visible: count(Voto WHERE blanco = true)', type: Number })
  blancos?: number;
}
