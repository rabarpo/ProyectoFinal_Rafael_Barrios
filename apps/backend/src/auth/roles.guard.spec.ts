import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

/**
 * auth-server-sessions, PR2 (design.md D8): RolesGuard (403) compone después de AuthGuard.
 * Sin `@Roles()` deja pasar; con `@Roles()` y sin `req.usuario` lanza 401 (orden D8, AuthGuard
 * debió correr primero); con `@Roles()` y rol no permitido lanza 403.
 */
describe('RolesGuard', () => {
  function crearContexto(usuario: { rol: string } | undefined) {
    const request = { usuario };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
    return context;
  }

  function crearReflector(roles: string[] | undefined): Reflector {
    return { getAllAndOverride: jest.fn().mockReturnValue(roles) } as unknown as Reflector;
  }

  // 5.5 RED [R7]: ruta con @Roles('ROL_X') y sesión con rol distinto es rechazada.
  it('[R7] rechaza cuando el rol de la sesión no está entre los roles requeridos', () => {
    const reflector = crearReflector(['administrador']);
    const guard = new RolesGuard(reflector);
    const context = crearContexto({ rol: 'estudiante' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  // GREEN: ruta con @Roles() y rol de sesión permitido deja pasar.
  it('permite continuar cuando el rol de la sesión está entre los roles requeridos', () => {
    const reflector = crearReflector(['administrador', 'director']);
    const guard = new RolesGuard(reflector);
    const context = crearContexto({ rol: 'director' });

    expect(guard.canActivate(context)).toBe(true);
  });

  // D8: sin metadata @Roles(), deja pasar sin mirar req.usuario.
  it('[D8] sin metadata @Roles() deja pasar, incluso sin req.usuario', () => {
    const reflector = crearReflector(undefined);
    const guard = new RolesGuard(reflector);
    const context = crearContexto(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  // D8: con metadata @Roles() y sin req.usuario (AuthGuard no corrió), lanza 401.
  it('[D8] con metadata @Roles() y sin req.usuario lanza 401', () => {
    const reflector = crearReflector(['administrador']);
    const guard = new RolesGuard(reflector);
    const context = crearContexto(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  // rediseno-boleta-votacion, PR2 (design.md D4, tarea 9.1). `SinRestriccionDeRol()` produce
  // `SetMetadata(ROLES_KEY, [])`: `getAllAndOverride` devuelve `[]` (definido, gana sobre la
  // clase) y el guard entra por la rama ya existente `rolesRequeridos.length === 0` -> deja pasar
  // a cualquier usuario autenticado, sin mirar su rol.
  it('[9.1] handler con metadata [] (SinRestriccionDeRol) anula el @Roles de clase -> deja pasar a cualquier rol autenticado', () => {
    const reflector = crearReflector([]);
    const guard = new RolesGuard(reflector);
    const context = crearContexto({ rol: 'estudiante' });

    expect(guard.canActivate(context)).toBe(true);
  });

  // rediseno-boleta-votacion, PR2 (design.md D4, tarea 9.2). Regresión explícita: un handler SIN
  // metadata propia sigue heredando el @Roles de la clase (getAllAndOverride devuelve ese valor,
  // no []) -> 403 para un rol no listado, comportamiento sin cambios respecto de hoy.
  it('[9.2] handler sin metadata propia sigue heredando el @Roles de la clase -> 403 para un rol no listado', () => {
    const reflector = crearReflector(['administrador', 'director']);
    const guard = new RolesGuard(reflector);
    const context = crearContexto({ rol: 'estudiante' });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
