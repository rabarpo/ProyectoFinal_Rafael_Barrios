import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard, type RequestConCookies } from './auth.guard';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RolesGuard } from './roles.guard';
import type { SesionUsuario } from './sesion-usuario';

const COOKIE_NAME = 'seei_session';

/**
 * `res.cookie()`/`res.clearCookie()` es API de Express (sin dependencia extra). Se tipa con un
 * shape mínimo local, no `import type { Response } from 'express'` — `express`/`@types/express`
 * no son dependencias directas resolvibles de `@seei/backend` bajo el `node_modules` aislado de
 * pnpm (mismo criterio documentado en `auth.guard.ts`/PR2: `cookie-parser` sí se agrega esta fase
 * porque hace falta para leer `request.cookies`, pero tipar el `Request`/`Response` de Express
 * completo no es necesario para esta superficie mínima).
 */
interface ResponseConCookie {
  cookie(name: string, value: string, options: Record<string, unknown>): void;
  clearCookie(name: string, options?: Record<string, unknown>): void;
}

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login con código de usuario y contraseña; emite cookie de sesión httpOnly' })
  @ApiResponse({ status: 200, description: 'Login exitoso, cookie seei_session emitida' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: ResponseConCookie,
  ): Promise<{ mensaje: string }> {
    const { sessionId } = await this.authService.login(dto);

    // D6: cookie de sesión de navegador (sin maxAge/expires), httpOnly, sameSite=lax, secure solo
    // en producción, sin firmar (el sessionId ya son 256 bits de CSPRNG y vive en Redis).
    res.cookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return { mensaje: 'Login exitoso' };
  }

  /**
   * google-oauth-y-recuperacion, PR2 (design.md D3, tarea 8.2). Misma cookie `seei_session` que
   * `login()` — el resultado observable de un login OAuth exitoso es indistinguible del login por
   * contraseña. `409 VINCULACION_REQUERIDA` es distinguible del `401` uniforme de D3/#4 a
   * propósito (design.md D3, "por qué un 409 distinguible"): quien lo recibe ya probó, con un ID
   * token firmado por Google, que controla ese buzón institucional.
   */
  @Post('google')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login con Google OAuth restringido a dominios institucionales' })
  @ApiResponse({ status: 200, description: 'Login exitoso, cookie seei_session emitida' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  @ApiResponse({
    status: 409,
    description: 'Vinculación requerida: reenviar con la contraseña actual confirmada',
  })
  async loginGoogle(
    @Body() dto: GoogleLoginDto,
    @Res({ passthrough: true }) res: ResponseConCookie,
  ): Promise<{ mensaje: string }> {
    const { sessionId } = await this.authService.loginConGoogle(dto.idToken, dto.password);

    res.cookie(COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });

    return { mensaje: 'Login exitoso' };
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Cierra la sesión activa (idempotente) y expira la cookie' })
  @ApiResponse({ status: 204, description: 'Logout procesado' })
  async logout(
    @Req() req: RequestConCookies,
    @Res({ passthrough: true }) res: ResponseConCookie,
  ): Promise<void> {
    const sessionId = req.cookies?.[COOKIE_NAME];
    if (sessionId) {
      await this.authService.logout(sessionId);
    }
    res.clearCookie(COOKIE_NAME, { path: '/' });
  }

  /**
   * D8: ejemplo de wiring `@UseGuards(AuthGuard, RolesGuard)` a nivel de ruta (nunca global), en
   * el orden exacto que fija el diseño. `RolesGuard` sin `@Roles()` deja pasar cualquier rol
   * autenticado — este endpoint sirve como ruta protegida de referencia para #6-#22 y como fixture
   * de los e2e de "ruta protegida sin cookie"/"ruta protegida con sesión eliminada" (tarea 9.3).
   */
  @Get('whoami')
  @UseGuards(AuthGuard, RolesGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Devuelve la sesión autenticada actual (ejemplo de ruta protegida)' })
  @ApiResponse({ status: 200, description: 'Sesión válida' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión o sesión inexistente/expirada' })
  whoami(@Req() req: RequestConUsuario): SesionUsuario | undefined {
    return req.usuario;
  }
}
