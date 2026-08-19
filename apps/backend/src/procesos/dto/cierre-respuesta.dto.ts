import { ApiProperty } from '@nestjs/swagger';

// cierre-escrutinio-actas (#17, PR3; design.md D4). Respuesta de `POST /procesos/:id/cerrar`:
// describe el ESTADO VIGENTE del proceso (mismo criterio silencioso de `AperturaRespuestaDto`) —
// el 200 no-op idempotente y el 200 del cierre real tienen exactamente la misma forma.
export class CierreRespuestaDto {
  @ApiProperty({ description: 'ID del proceso electoral', type: String })
  id!: string;

  @ApiProperty({ description: 'Estado del proceso tras el cierre', enum: ['cerrado', 'acta_emitida'] })
  estado!: 'cerrado' | 'acta_emitida';

  @ApiProperty({ description: 'Momento de cierre sellado con el reloj de Postgres (ISO-8601)', type: String })
  cierre_real!: string;

  @ApiProperty({ description: 'Cantidad de actas creadas en borrador (siempre 4)', type: Number })
  actas_creadas!: number;
}
