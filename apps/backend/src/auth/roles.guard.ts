import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RolUsuario } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';
import type { SesionUsuario } from './sesion-usuario';

/**
 * auth-server-sessions, PR2 (design.md D8). Se compone después de `AuthGuard`
 * (`@UseGuards(AuthGuard, RolesGuard)`), a nivel de ruta, nunca global. Sin `@Roles()` deja
 * pasar (rutas sin restricción de rol); con `@Roles()` y sin `req.usuario` lanza 401 en vez de
 * 403 — indica que `AuthGuard` no corrió antes, no que el rol esté mal.
 */
interface RequestConUsuario {
  usuario?: SesionUsuario;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rolesRequeridos = this.reflector.getAllAndOverride<RolUsuario[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!rolesRequeridos || rolesRequeridos.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestConUsuario>();
    if (!request.usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!rolesRequeridos.includes(request.usuario.rol)) {
      throw new ForbiddenException('No autorizado');
    }

    return true;
  }
}
