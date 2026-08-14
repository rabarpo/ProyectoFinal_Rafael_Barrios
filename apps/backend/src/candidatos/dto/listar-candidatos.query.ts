import { ApiPropertyOptional } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR4 (design.md "Contratos HTTP", tarea 11.2). Query params
// de `GET /candidatos`: `proceso_id`/`lista_id` no-UUID o `estado` fuera de `{activo, baja}` es
// `400 CAMPO_INVALIDO`, validado a mano en `CandidatosService` (sin `class-validator`, mismo
// criterio que `ListarListasQuery`).
export class ListarCandidatosQuery {
  @ApiPropertyOptional({ description: 'Filtra por ID de ProcesoElectoral', type: String })
  proceso_id?: string;

  @ApiPropertyOptional({ description: 'Filtra por ID de Lista', type: String })
  lista_id?: string;

  @ApiPropertyOptional({ description: 'Filtra por estado de participación', enum: ['activo', 'baja'] })
  estado?: string;
}
