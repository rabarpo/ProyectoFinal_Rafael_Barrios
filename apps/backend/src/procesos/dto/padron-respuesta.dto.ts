import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// administracion-procesos-electorales, PR5 (design.md D2/D3, "Contratos HTTP", tarea 12.1).
// Desglose por aula del padrón en vivo — nunca se materializa como fila de `DerechoVoto`.
export class PadronAulaDto {
  @ApiProperty({ description: 'ID del Aula', type: String })
  aula_id!: string;

  @ApiProperty({ description: 'Cuenta de estudiantes con matrícula activa en el aula', type: Number })
  estudiantes!: number;

  @ApiProperty({ description: 'Cuenta de estudiantes con Apoderado registrado en el aula (ADR-0011)', type: Number })
  padres!: number;

  @ApiProperty({ description: 'Derechos de voto derivados del aula según publico_objetivo', type: Number })
  derechos!: number;
}

// design.md D2/D4: el conteo es de DERECHOS, no de personas ni de cuentas (ADR-0011). `aviso`
// aparece cuando `estudiantes !== cuentas_distintas` (un estudiante con dos matrículas activas
// del mismo año escolar, no impedido por el schema).
export class PadronRespuestaDto {
  @ApiProperty({ description: 'Total de derechos de voto (con doble derecho de comunidad ya sumado)', type: Number })
  derechos_totales!: number;

  @ApiProperty({ description: 'Total de estudiantes elegibles', type: Number })
  estudiantes!: number;

  @ApiProperty({ description: 'Total de cuentas de estudiante con Apoderado registrado', type: Number })
  padres!: number;

  @ApiProperty({ description: 'Cuentas de Usuario distintas involucradas en el conteo', type: Number })
  cuentas_distintas!: number;

  @ApiProperty({ description: 'Desglose por aula elegible', type: [PadronAulaDto] })
  aulas!: PadronAulaDto[];

  @ApiProperty({ description: 'Aulas del alcance resuelto excluidas por no tener matrícula activa', type: [String] })
  aulas_excluidas!: string[];

  @ApiPropertyOptional({
    description: 'Presente cuando cuentas_distintas < estudiantes (matrícula duplicada del mismo año escolar)',
    enum: ['MATRICULA_DUPLICADA'],
  })
  aviso?: 'MATRICULA_DUPLICADA';
}
