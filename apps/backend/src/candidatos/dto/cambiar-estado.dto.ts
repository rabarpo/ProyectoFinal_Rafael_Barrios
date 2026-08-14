import { ApiProperty } from '@nestjs/swagger';

// candidatos-listas-opciones-consulta, PR4 (design.md D6, tarea 11.2). `PATCH
// /candidatos/:id/estado` espeja literalmente `ActualizarEstadoListaDto`/`PATCH
// /usuarios/:id/estado` (#7): `estado` expresa el ESTADO DESTINO, nunca una acción.
// `estado='baja'` fija `baja_en=now()`; `estado='activo'` (reactivación) lo limpia. Permitido en
// cualquier `Proceso.estado`, incluido `abierto` (D6).
export class CambiarEstadoDto {
  @ApiProperty({ description: 'Estado destino del candidato', enum: ['activo', 'baja'] })
  estado!: string;
}
