import { ApiProperty } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR2 (design.md D6, tarea 4.3). `PATCH /listas/:id/estado`
// espeja literalmente `PATCH /usuarios/:id/estado` (#7): `destino` expresa el ESTADO DESTINO,
// nunca una acción. `estado='baja'` fija `baja_en=now()`; `estado='activo'` (reactivación) lo
// limpia. Permitido en cualquier `Proceso.estado`, incluido `abierto` (D6).
export class ActualizarEstadoListaDto {
  @ApiProperty({ description: 'Estado destino de la lista', enum: ['activo', 'baja'] })
  estado!: string;
}
