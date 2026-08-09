import { ApiProperty } from '@nestjs/swagger';
import { ErrorFilaDto } from './error-fila.dto';

// importacion-excel, PR2 (design.md "Interfaces/Contracts", tarea 2.3). `importacion_id` identifica
// la importación para la descarga del CSV de errores (`GET /importaciones/:id/errores.csv`, PR3);
// en PR2 se genera igual (sin persistir aún en Redis) para no cambiar el contrato de respuesta en
// PR3 (cambio aditivo puro, design.md "Migration / Rollout").
export class ResultadoImportacionDto {
  @ApiProperty({ description: 'ID de la importación', type: String })
  importacion_id!: string;

  @ApiProperty({ description: 'Total de filas de datos procesadas (sin contar la cabecera)', type: Number })
  filas_totales!: number;

  @ApiProperty({ description: 'Filas cuyo Usuario y/o Matricula se crearon en esta importación', type: Number })
  filas_creadas!: number;

  @ApiProperty({ description: 'Filas cuyo Usuario y Matricula ya existían (idempotencia)', type: Number })
  filas_existentes!: number;

  @ApiProperty({ description: 'Filas inválidas (ver detalle en errores)', type: Number })
  filas_invalidas!: number;

  @ApiProperty({ description: 'Detalle de errores por fila', type: [ErrorFilaDto] })
  errores!: ErrorFilaDto[];
}
