import { ApiProperty } from '@nestjs/swagger';
import type { RolUsuario } from '@prisma/client';

// administracion-procesos-electorales, PR1 (design.md D9, tarea 1.2). Espejo tipado de
// `SesionUsuario` (`../sesion-usuario.ts`) para el contrato OpenAPI de `GET /auth/whoami` — mismos
// tres campos, sin agregar ninguno: nombre y correo del usuario no están en la sesión de Redis y
// exponerlos exigiría una consulta nueva (design.md D9, "Fundamento").
export class SesionUsuarioDto {
  @ApiProperty({ description: 'ID del usuario autenticado', type: String })
  userId!: string;

  @ApiProperty({ description: 'Rol del usuario autenticado', enum: ['administrador', 'director', 'comite', 'docente', 'estudiante'] })
  rol!: RolUsuario;

  @ApiProperty({ description: 'Timestamp Unix (segundos) de creación de la sesión', type: Number })
  creadoEn!: number;
}
