import { SetMetadata } from '@nestjs/common';
import type { RolUsuario } from '@prisma/client';

/**
 * auth-server-sessions, PR2 (design.md D2/D8). `RolesGuard` lee esta metadata con `Reflector`;
 * ausencia de `@Roles()` en una ruta significa "sin restricción de rol" (D8).
 */
export const ROLES_KEY = 'roles';

export const Roles = (...roles: RolUsuario[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);

/**
 * rediseno-boleta-votacion, PR2 (design.md D4). Anula un `@Roles` de CLASE a nivel de método:
 * `RolesGuard` usa `reflector.getAllAndOverride(ROLES_KEY, [handler, class])`, que devuelve el
 * primer valor `!== undefined` en ese orden — un método sin `@Roles()` propio HEREDA el de la
 * clase, y `@UseGuards` a nivel de método es aditivo (no reemplaza los guards de clase). Definir
 * metadata VACÍA (`[]`, en vez de dejarla ausente) en el handler es la única forma de que
 * `getAllAndOverride` la encuentre y entre por la rama ya existente de `RolesGuard`
 * (`rolesRequeridos.length === 0` -> deja pasar a cualquier usuario autenticado). `AuthGuard` de
 * clase sigue corriendo, así que un usuario anónimo sigue recibiendo `401` (D8 de
 * auth-server-sessions).
 */
export const SinRestriccionDeRol = (): ReturnType<typeof SetMetadata> => SetMetadata(ROLES_KEY, []);
