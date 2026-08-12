import { ApiPropertyOptional } from '@nestjs/swagger';

// administracion-procesos-electorales, PR7 (design.md "Contratos HTTP", tarea 19.1). Query params
// de `GET /procesos` (`?estado=&tipo=`, D5): ambos opcionales, validados a mano en
// `ProcesosService.listar()` contra los enums de `EstadoProceso`/`TipoProceso` — valor desconocido
// -> `400 CAMPO_INVALIDO` (D5), mismo idioma sin `class-validator` que el resto del módulo.
export class ListarProcesosQueryDto {
  @ApiPropertyOptional({
    description: 'Filtra por estado; valor fuera del enum -> 400 CAMPO_INVALIDO',
    enum: ['borrador', 'abierto', 'cerrado', 'acta_emitida'],
  })
  estado?: string;

  @ApiPropertyOptional({
    description: 'Filtra por tipo de proceso; valor fuera del enum -> 400 CAMPO_INVALIDO',
    enum: ['municipio', 'representante_aula', 'padres', 'consulta'],
  })
  tipo?: string;
}
