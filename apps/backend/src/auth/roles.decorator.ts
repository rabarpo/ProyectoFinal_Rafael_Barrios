import { SetMetadata } from '@nestjs/common';
import type { RolUsuario } from '@prisma/client';

/**
 * auth-server-sessions, PR2 (design.md D2/D8). `RolesGuard` lee esta metadata con `Reflector`;
 * ausencia de `@Roles()` en una ruta significa "sin restricción de rol" (D8).
 */
export const ROLES_KEY = 'roles';

export const Roles = (...roles: RolUsuario[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);
