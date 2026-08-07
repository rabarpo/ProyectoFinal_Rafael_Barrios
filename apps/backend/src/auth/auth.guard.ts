import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { SesionUsuario } from './sesion-usuario';
import { SessionService } from './session.service';

/**
 * auth-server-sessions, PR2 (design.md D6/D8). Nombre de cookie fijo por D6; `cookie-parser`
 * (middleware de `AuthModule`, PR3) es quien puebla `request.cookies`. Se tipa el request con un
 * shape mínimo local en vez de importar `express`/`@types/cookie-parser` — ninguno es
 * dependencia directa de `@seei/backend` todavía (D5-style: evitar acoplar este PR a paquetes
 * que se instalan recién en PR3).
 */
const COOKIE_NAME = 'seei_session';

interface RequestConCookies {
  cookies?: Record<string, string>;
  usuario?: SesionUsuario;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestConCookies>();

    const sessionId = request.cookies?.[COOKIE_NAME];
    if (!sessionId) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const sesion = await this.sessionService.obtener(sessionId);
    if (!sesion) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    request.usuario = sesion;
    return true;
  }
}
