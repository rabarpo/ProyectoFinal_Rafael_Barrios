import { ApiProperty } from '@nestjs/swagger';

// reportes-y-exportaciones (#18, PR3; design.md "Contratos HTTP", D8). Body de `POST /reportes`:
// validación manual en `ReportesService.solicitar()`, sin `class-validator`, ANTES de abrir la
// transacción — mismo criterio de `CrearProcesoDto`/`AbrirProcesoDto`/`CerrarProcesoDto`.
export class SolicitarReporteDto {
  @ApiProperty({ description: 'ID del ProcesoElectoral sobre el que se solicita el reporte', type: String })
  proceso_id!: string;

  @ApiProperty({
    description: 'Dimensión del reporte',
    enum: ['participacion', 'votantes', 'abstenciones', 'resultados', 'candidatos', 'consultas'],
  })
  dimension!: string;

  @ApiProperty({ description: 'Formato de salida del reporte', enum: ['excel', 'pdf', 'csv'] })
  formato!: string;
}
