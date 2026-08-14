import { ApiProperty } from '@nestjs/swagger';

// apertura-proceso-congelamiento-padron (#13, PR2; design.md D10). Respuesta de
// `POST /procesos/:id/abrir`: describe el ESTADO VIGENTE del proceso (no "lo que se creó ahora"),
// así que el 200 idempotente y el 200 de la primera apertura tienen exactamente la misma forma, sin
// bandera `ya_estaba_abierto` (silencioso, D5/D10). `derechos_*` se leen con `count()` sobre
// `DerechoVoto` ya materializado — en PR2 (guarda de concurrencia, sin materialización todavía) esos
// conteos son siempre 0; PR3 los puebla al agregar `derechosPorAula()`/`createMany` (D6-D8).
export class AperturaRespuestaDto {
  @ApiProperty({ description: 'ID del proceso electoral', type: String })
  id!: string;

  @ApiProperty({ description: 'Estado del proceso tras la apertura (siempre "abierto")', enum: ['abierto'] })
  estado!: 'abierto';

  @ApiProperty({ description: 'Momento de apertura sellado con el reloj de Postgres (ISO-8601)', type: String })
  apertura_real!: string;

  @ApiProperty({ description: 'ocultar_resultados congelado al momento de la apertura', type: Boolean })
  ocultar_resultados!: boolean;

  @ApiProperty({ description: 'Cantidad de aulas del proceso (ProcesoAula)', type: Number })
  aulas!: number;

  @ApiProperty({ description: 'Total de filas DerechoVoto materializadas', type: Number })
  derechos_totales!: number;

  @ApiProperty({ description: 'Filas DerechoVoto con en_calidad_de = estudiante', type: Number })
  derechos_estudiante!: number;

  @ApiProperty({ description: 'Filas DerechoVoto con en_calidad_de = padre', type: Number })
  derechos_padre!: number;
}
