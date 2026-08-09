import { ApiProperty } from '@nestjs/swagger';
import type { MotivoFila } from '../importacion.errors';

// importacion-excel, PR2 (design.md "Interfaces/Contracts", tarea 2.3, spec "Reporte de errores
// descargable en CSV"). Mismas cuatro columnas que el CSV descargable (`fila, campo, motivo,
// valor_recibido`) — el CSV de PR3 (D5) serializa exactamente estos campos.
export class ErrorFilaDto {
  @ApiProperty({ description: 'Número de fila de datos (1-based, sin contar la cabecera)', type: Number })
  fila!: number;

  @ApiProperty({ description: 'Campo afectado dentro de la fila', type: String })
  campo!: string;

  @ApiProperty({
    description: 'Motivo del error',
    enum: ['fila_vacia', 'formato', 'campo_duplicado', 'referencia_inexistente'],
  })
  motivo!: MotivoFila;

  @ApiProperty({ description: 'Valor recibido que causó el error', type: String })
  valor_recibido!: string;
}
