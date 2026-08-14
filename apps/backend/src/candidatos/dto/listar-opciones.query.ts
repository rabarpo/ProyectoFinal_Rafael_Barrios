import { ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR3 (design.md "Contratos HTTP", tarea 8.1). Query params de
// `GET /opciones`: `proceso_id` no-UUID es `400 CAMPO_INVALIDO`, validado a mano en
// `OpcionesService` (sin `class-validator`, mismo criterio que `ListarListasQuery`).
export class ListarOpcionesQuery {
  @ApiPropertyOptional({ description: 'Filtra por ID de ProcesoElectoral', type: String })
  proceso_id?: string;
}
