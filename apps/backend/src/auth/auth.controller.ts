import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard, type RequestConCookies } from './auth.guard';
import { AuthService } from './auth.service';
import { BloqueoService } from './bloqueo.service';
import { GoogleLoginDto } from './dto/google-login.dto';
import { LoginDto } from './dto/login.dto';
import { RecoveryConfirmDto } from './dto/recovery-confirm.dto';
import { RecoveryRequestDto } from './dto/recovery-request.dto';
import { UsuarioBloqueadoDto } from './dto/usuario-bloqueado.dto';
import { RecoveryService } from './recovery.service';
import { Roles } from './roles.decorator';
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
  constructor(
    private readonly authService: AuthService,
    private readonly recoveryService: RecoveryService,
    private readonly bloqueoService: BloqueoService,
  ) {}

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

  /**
   * google-oauth-y-recuperacion, PR3 (design.md D7, tarea 11.2, spec "Solicitud de recuperación
   * no revela existencia del correo"). Respuesta uniforme SIEMPRE — el cuerpo y el código `202`
   * son idénticos exista o no el correo, y también si un cooldown de 60s ya está activo (D5).
   */
  @Post('recovery')
  @HttpCode(202)
  @ApiOperation({ summary: 'Solicita un enlace de recuperación/establecimiento de contraseña' })
  @ApiResponse({
    status: 202,
    description: 'Solicitud recibida (respuesta uniforme, no revela si el correo existe)',
  })
  async solicitarRecovery(@Body() dto: RecoveryRequestDto): Promise<{ mensaje: string }> {
    await this.recoveryService.solicitar(dto.correo);
    return { mensaje: 'Si el correo corresponde a una cuenta, se envió un enlace' };
  }

  /**
   * Mismo contrato sirve para resetear una cuenta existente y para establecer la primera
   * contraseña de una cuenta solo-OAuth (spec, tarea 11.2) — sin endpoint separado.
   */
  @Post('recovery/confirm')
  @HttpCode(204)
  @ApiOperation({ summary: 'Confirma la recuperación con el token recibido y establece la contraseña nueva' })
  @ApiResponse({ status: 204, description: 'Contraseña actualizada, sesiones revocadas' })
  @ApiResponse({ status: 400, description: 'Enlace inválido o expirado' })
  async confirmarRecovery(@Body() dto: RecoveryConfirmDto): Promise<void> {
    await this.recoveryService.confirmar(dto.token, dto.password);
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

  /**
   * bloqueo-desbloqueo-cuentas, PR3 (design.md "Contratos", D3). Sin filtros ni paginación — el
   * `estado` de la fila es la verdad durable; se listan también los bloqueos ya vencidos
   * (`bloqueado_hasta` en el pasado) porque la expiración perezosa solo sana la fila ante un login
   * exitoso.
   */
  @Get('usuarios/bloqueados')
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('comite')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Lista las cuentas actualmente bloqueadas (panel del comité)' })
  @ApiResponse({ status: 200, description: 'Listado de cuentas bloqueadas', type: [UsuarioBloqueadoDto] })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de comite' })
  async listarBloqueados(): Promise<UsuarioBloqueadoDto[]> {
    const usuarios = await this.bloqueoService.listarBloqueados();
    return usuarios.map((usuario) => ({
      ...usuario,
      bloqueado_hasta: usuario.bloqueado_hasta ? usuario.bloqueado_hasta.toISOString() : null,
    }));
  }

  /**
   * bloqueo-desbloqueo-cuentas, PR3 (design.md "Contratos", flujo "desbloqueo manual del
   * comité"). Sin body — no hay nada que validar (no existe `ValidationPipe` en el proyecto) y
   * ADR-0008 se satisface con actor + timestamp. `ParseUUIDPipe` evita que un `:id` malformado
   * escape como `500` por un `P2023` de Prisma; devuelve `400` en su lugar.
   */
  @Post('usuarios/:id/desbloquear')
  @HttpCode(200)
  @UseGuards(AuthGuard, RolesGuard)
  @Roles('comite')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Desbloquea manualmente una cuenta (panel del comité)' })
  @ApiResponse({ status: 200, description: 'Desbloqueo procesado (idempotente)' })
  @ApiResponse({ status: 400, description: 'id malformado' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Rol distinto de comite' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async desbloquear(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
  ): Promise<{ desbloqueado: boolean }> {
    const resultado = await this.bloqueoService.desbloquearManual(id, req.usuario!.userId);
    if (resultado === null) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return resultado;
  }
}
