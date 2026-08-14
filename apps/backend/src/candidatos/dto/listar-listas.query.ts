import { ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR2 (design.md "Contratos HTTP", tarea 4.3). Query params
// de `GET /listas`: `proceso_id` no-UUID o `estado` fuera de `{activo, baja}` es `400
// CAMPO_INVALIDO`, validado a mano en `ListasService` (sin `class-validator`, mismo criterio que
// `ListarAulasQuery`).
export class ListarListasQuery {
  @ApiPropertyOptional({ description: 'Filtra por ID de ProcesoElectoral', type: String })
  proceso_id?: string;

  @ApiPropertyOptional({ description: 'Filtra por estado de participación', enum: ['activo', 'baja'] })
  estado?: string;
}
