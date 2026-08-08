import { ApiPropertyOptional } from '@nestjs/swagger';
import type { EstadoUsuario, RolUsuario } from '@prisma/client';

// administracion-usuarios-apoderados, PR1 (design.md "Contratos HTTP", tarea 4.1). Query params
// de `GET /usuarios`: ambos opcionales, filtro combinable. Un valor fuera del enum es
// `400 CAMPO_INVALIDO` (validado a mano en `UsersController`/`UsersService`, sin `class-validator`).
export class ListarUsuariosQuery {
  @ApiPropertyOptional({
    description: 'Filtra por rol',
    enum: ['estudiante', 'docente', 'comite', 'administrador', 'director'],
  })
  rol?: RolUsuario;

  @ApiPropertyOptional({
    description: 'Filtra por estado',
    enum: ['activo', 'inactivo', 'bloqueado'],
  })
  estado?: EstadoUsuario;
}
