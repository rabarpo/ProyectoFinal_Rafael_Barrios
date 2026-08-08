import { ApiPropertyOptional } from '@nestjs/swagger';
import type { RolUsuario } from '@prisma/client';

// administracion-usuarios-apoderados, PR1 (design.md D1, tarea 4.1). Deliberadamente SIN el
// campo `estado`: "editar datos básicos no puede mover el estado" es una propiedad del tipo, no
// una validación en tiempo de ejecución (design.md D1, "el DTO no lo declara"). El cambio de
// `estado` vive exclusivamente en `CambiarEstadoUsuarioDto` / `PATCH /usuarios/:id/estado`.
export class ActualizarUsuarioDto {
  @ApiPropertyOptional({ description: 'Nombres completos del usuario', type: String })
  nombres?: string;

  @ApiPropertyOptional({ description: 'DNI, texto libre, máximo 20 caracteres', type: String })
  dni?: string;

  @ApiPropertyOptional({ description: 'Código institucional único', type: String })
  codigo?: string;

  @ApiPropertyOptional({ description: 'Correo electrónico único', type: String })
  correo?: string;

  @ApiPropertyOptional({
    description: 'Rol del usuario',
    enum: ['estudiante', 'docente', 'comite', 'administrador', 'director'],
  })
  rol?: RolUsuario;
}
