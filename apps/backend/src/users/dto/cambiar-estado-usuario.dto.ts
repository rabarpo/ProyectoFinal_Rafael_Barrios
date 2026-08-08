import { ApiProperty } from '@nestjs/swagger';

// administracion-usuarios-apoderados, PR1 (design.md D1, tarea 4.1). Body de
// `PATCH /usuarios/:id/estado`: expresa el ESTADO DESTINO, no una acción — repetir el request es
// idempotente (design.md D1). El servicio rechaza cualquier valor fuera de
// `{activo, inactivo}`, incluido `bloqueado` (territorio exclusivo de `bloqueo-desbloqueo-cuentas`).
export class CambiarEstadoUsuarioDto {
  @ApiProperty({ description: 'Estado destino', enum: ['activo', 'inactivo'] })
  estado!: 'activo' | 'inactivo';
}
