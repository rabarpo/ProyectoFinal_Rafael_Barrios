import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma, RolUsuario, Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { BloqueoService, bloqueoVigente, sanarBloqueoVencido } from './bloqueo.service';
import { GoogleOauthService } from './google-oauth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import type { LoginDto } from './dto/login.dto';

export type MotivoLoginFallido =
  | 'usuario_inexistente'
  | 'password_ausente'
  | 'password_incorrecta'
  | 'usuario_bloqueado'
  | 'usuario_inactivo';

export type MotivoLoginOAuthFallido =
  | 'token_invalido'
  | 'usuario_inexistente'
  | 'usuario_bloqueado'
  | 'usuario_inactivo'
  | 'vinculacion_requerida'
  | 'password_incorrecta'
  | 'google_id_conflicto';

export type VinculacionOAuth = 'ya_vinculada' | 'primer_uso' | 'password_confirmada';

export interface ResultadoLogin {
  sessionId: string;
  rol: RolUsuario;
}

/**
 * auth-server-sessions, PR3 (design.md D3/D7). Orquesta `login()`/`logout()`. Regla crítica D7:
 * la escritura de auditoría se confirma DENTRO de `prisma.$transaction()` ANTES de tocar Redis —
 * si la transacción falla, `SessionService.crear()` nunca se alcanza, así que no queda
 * `session:{id}` huérfana ni cookie emitida para ese intento.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly auditoria: AuditoriaService,
    private readonly googleOauthService: GoogleOauthService,
    private readonly bloqueoService: BloqueoService,
  ) {}

  /**
   * D3: las cuatro causas de rechazo (usuario inexistente, sin `password_hash`, contraseña
   * incorrecta, bloqueo vigente) terminan en el mismo `UnauthorizedException` sin cuerpo
   * distinguible. `PasswordService.verificar()` corre SIEMPRE (incluso cuando `usuario` es
   * `null` o no tiene `password_hash`, contra el hash señuelo) para no abrir un oráculo de
   * tiempo entre "usuario inexistente" y "contraseña incorrecta".
   *
   * bloqueo-desbloqueo-cuentas, PR2 (design.md D7/D8): la guarda `estado==='bloqueado'` se
   * reemplaza por `bloqueoVigente(usuario)` — un bloqueo con `bloqueado_hasta` ya vencido NO
   * rechaza por causa de bloqueo y sigue evaluando la contraseña. D8: la rama de rechazo llama
   * `registrarFallo()` con la clave real solo cuando el fallo es "contable" (motivo
   * `password_incorrecta` sobre un `Usuario` sin bloqueo vigente); toda otra rama incrementa la
   * señuelo. La rama exitosa sana el bloqueo vencido (D6) dentro de la misma transacción que
   * audita `LOGIN_EXITOSO`, y resetea el contador (`DEL`) DESPUÉS del commit y ANTES de
   * `sessionService.crear()` — así `crear()` sigue siendo el último efecto de Redis (D7 de #4).
   *
   * administracion-usuarios-apoderados, PR3 (design.md D7, tarea 12.8): `usuario.estado ===
   * 'inactivo'` se evalúa junto a `bloqueoVigente()`, nunca antes de `passwordService.verificar()`
   * — preserva el argumento anti-oráculo de D3 (la contraseña siempre se verifica, incluso contra
   * el hash señuelo, así que el timing no distingue "inactivo" de "contraseña incorrecta"). No
   * cuenta para el bloqueo por fuerza bruta de `bloqueo-desbloqueo-cuentas`: `contable` más abajo
   * ya exige `motivo === 'password_incorrecta'`, que `determinarMotivoFallo()` nunca devuelve para
   * un `Usuario` inactivo.
   */
  async login(dto: LoginDto): Promise<ResultadoLogin> {
    const usuario = await this.prisma.usuario.findUnique({ where: { codigo: dto.codigo } });
    const passwordValida = await this.passwordService.verificar(dto.password, usuario?.password_hash);

    if (
      !usuario ||
      !usuario.password_hash ||
      !passwordValida ||
      bloqueoVigente(usuario) ||
      usuario.estado === 'inactivo'
    ) {
      const motivo = this.determinarMotivoFallo(usuario, passwordValida);
      await this.auditarLoginFallido(dto.codigo, usuario, motivo);

      const contable = motivo === 'password_incorrecta' && usuario !== null && !bloqueoVigente(usuario);
      await this.bloqueoService.registrarFallo(contable ? usuario : null, dto.codigo, motivo);

      throw new UnauthorizedException('Credenciales inválidas');
    }

    // A partir de aquí, TypeScript narrowed `usuario` a no-nulo, con `password_hash` presente,
    // `passwordValida === true` y sin bloqueo vigente (el `if` de arriba cubre las 4 causas).
    const sessionId = randomBytes(32).toString('base64url');

    await this.prisma.$transaction(async (tx) => {
      await sanarBloqueoVencido(tx, usuario);
      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.LOGIN_EXITOSO,
        usuario.id,
        'Usuario',
        usuario.id,
        { session_id: sessionId, rol: usuario.rol } as Prisma.InputJsonValue,
      );
    });

    await this.bloqueoService.resetearIntentos(usuario.id);

    // D7: solo se llega aquí si la transacción de arriba confirmó. Un fallo de Redis después de
    // este punto deja una fila LOGIN_EXITOSO sin sesión (modo de falla residual aceptado en
    // design.md D7 — sobre-reporta en vez de sub-reportar).
    await this.sessionService.crear(usuario.id, usuario.rol, sessionId);

    return { sessionId, rol: usuario.rol };
  }

  /**
   * google-oauth-y-recuperacion, PR2 (design.md D2/D3/D7, ADR-0017). Máquina de 8 estados de D3:
   * el ID token se verifica primero (fail-closed, `GoogleOauthService`); a partir de ahí, sin
   * auto-provisión, un `Usuario` existente con `password_hash` y sin `google_id` exige confirmar
   * la contraseña actual antes de vincular (`409 VINCULACION_REQUERIDA`), y el chequeo explícito
   * de `google_id` en uso (estado 8) evita que una `P2002` del índice único escape como `500` y
   * filtre la existencia de otra cuenta.
   */
  async loginConGoogle(idToken: string, password?: string): Promise<ResultadoLogin> {
    let payload: { sub: string; correo: string };
    try {
      payload = await this.googleOauthService.verificar(idToken);
    } catch (error) {
      await this.auditarLoginOAuthFallido(null, null, 'token_invalido');
      throw error instanceof UnauthorizedException
        ? error
        : new UnauthorizedException('Credenciales inválidas');
    }

    const { sub, correo } = payload;
    const usuario = await this.prisma.usuario.findUnique({ where: { correo } });

    if (!usuario) {
      await this.auditarLoginOAuthFallido(correo, null, 'usuario_inexistente');
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // bloqueo-desbloqueo-cuentas, PR2 (design.md D7): mismo chequeo puro que `login()` — un
    // bloqueo con `bloqueado_hasta` ya vencido no rechaza OAuth por causa de bloqueo (dejarlo
    // solo en `login()` haría que un bloqueo vencido siguiera rechazando OAuth para siempre).
    if (bloqueoVigente(usuario)) {
      await this.auditarLoginOAuthFallido(correo, usuario.id, 'usuario_bloqueado');
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // administracion-usuarios-apoderados, PR3 (design.md D7, tarea 12.8): mismo punto que el
    // chequeo de `bloqueoVigente()` de arriba — un Usuario dado de baja rechaza OAuth igual que
    // password, sin distinguir la causa en la respuesta.
    if (usuario.estado === 'inactivo') {
      await this.auditarLoginOAuthFallido(correo, usuario.id, 'usuario_inactivo');
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Estado 3 (D3): ya vinculado con este mismo sub — login directo, sin exigir password.
    if (usuario.google_id === sub) {
      return this.crearSesionOAuth(usuario, sub, 'ya_vinculada', false);
    }

    // Estado 8a (D3): el propio Usuario ya tiene un google_id distinto vinculado.
    if (usuario.google_id !== null) {
      await this.auditarLoginOAuthFallido(correo, usuario.id, 'google_id_conflicto');
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Estado 8b (D3): el sub del token ya está vinculado a OTRO Usuario — chequeo explícito para
    // que la P2002 del índice único de `google_id` nunca escape como 500 desde el UPDATE de abajo.
    const otroUsuarioConEseSub = await this.prisma.usuario.findUnique({ where: { google_id: sub } });
    if (otroUsuarioConEseSub && otroUsuarioConEseSub.id !== usuario.id) {
      await this.auditarLoginOAuthFallido(correo, usuario.id, 'google_id_conflicto');
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Estado 4 (D3, TOFU): sin password_hash previo, la vinculación no exige confirmarla — el
    // ID token ya demostró control del mismo buzón que recibiría el correo de recuperación.
    if (usuario.password_hash === null) {
      return this.crearSesionOAuth(usuario, sub, 'primer_uso', true);
    }

    // Estados 5/6/7 (D3): hay password_hash previo, se exige confirmar la contraseña actual.
    if (!password) {
      await this.auditarLoginOAuthFallido(correo, usuario.id, 'vinculacion_requerida');
      throw new ConflictException({ codigo: 'VINCULACION_REQUERIDA' });
    }

    const passwordValida = await this.passwordService.verificar(password, usuario.password_hash);
    if (!passwordValida) {
      await this.auditarLoginOAuthFallido(correo, usuario.id, 'password_incorrecta');
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.crearSesionOAuth(usuario, sub, 'password_confirmada', true);
  }

  /**
   * D7: `$transaction(log + UPDATE google_id cuando vincula)` confirma ANTES de tocar Redis,
   * mismo orden crítico que `login()`. El chequeo de estado 8b de arriba reduce, pero no elimina
   * del todo, la ventana de carrera del UPDATE — por eso el `catch` de abajo traduce una P2002
   * residual al mismo 401 uniforme en vez de dejarla escapar como 500.
   */
  private async crearSesionOAuth(
    usuario: Usuario,
    sub: string,
    vinculacion: VinculacionOAuth,
    vincular: boolean,
  ): Promise<ResultadoLogin> {
    const sessionId = randomBytes(32).toString('base64url');

    try {
      await this.prisma.$transaction(async (tx) => {
        // D6/D7: la sanación de bloqueo vencido se replica acá — mismo criterio que `login()`.
        await sanarBloqueoVencido(tx, usuario);
        if (vincular) {
          await tx.usuario.update({ where: { id: usuario.id }, data: { google_id: sub } });
        }
        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.LOGIN_OAUTH_EXITOSO,
          usuario.id,
          'Usuario',
          usuario.id,
          {
            session_id: sessionId,
            rol: usuario.rol,
            vinculacion,
          } as Prisma.InputJsonValue,
        );
      });
    } catch (error) {
      if (this.esConflictoUnicoGoogleId(error)) {
        await this.auditarLoginOAuthFallido(usuario.correo, usuario.id, 'google_id_conflicto');
        throw new UnauthorizedException('Credenciales inválidas');
      }
      throw error;
    }

    await this.sessionService.crear(usuario.id, usuario.rol, sessionId);

    return { sessionId, rol: usuario.rol };
  }

  private esConflictoUnicoGoogleId(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private async auditarLoginOAuthFallido(
    correo: string | null,
    usuarioId: string | null,
    motivo: MotivoLoginOAuthFallido,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.LOGIN_OAUTH_FALLIDO,
        usuarioId,
        'Usuario',
        usuarioId,
        // Nunca el idToken ni la contraseña enviada — solo correo y motivo interno.
        { correo, motivo } as Prisma.InputJsonValue,
      ),
    );
  }

  /**
   * Idempotente: una sesión ya inexistente/expirada no audita ni intenta revocar de nuevo — el
   * llamador (controller) siempre puede expirar la cookie sin importar el resultado.
   */
  async logout(sessionId: string): Promise<void> {
    const sesion = await this.sessionService.obtener(sessionId);
    if (!sesion) return;

    await this.prisma.$transaction((tx) =>
      this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.LOGOUT,
        sesion.userId,
        'Usuario',
        sesion.userId,
        { session_id: sessionId } as Prisma.InputJsonValue,
      ),
    );

    await this.sessionService.revocar(sessionId);
  }

  private determinarMotivoFallo(
    usuario: Usuario | null,
    passwordValida: boolean,
  ): MotivoLoginFallido {
    if (!usuario) return 'usuario_inexistente';
    if (!usuario.password_hash) return 'password_ausente';
    if (!passwordValida) return 'password_incorrecta';
    // administracion-usuarios-apoderados, PR3 (design.md D7, tarea 12.2): nueva rama antes del
    // fallback `usuario_bloqueado` — motivo interno distinguible, nunca expuesto en la respuesta.
    if (usuario.estado === 'inactivo') return 'usuario_inactivo';
    return 'usuario_bloqueado';
  }

  private async auditarLoginFallido(
    codigo: string,
    usuario: Usuario | null,
    motivo: MotivoLoginFallido,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.LOGIN_FALLIDO,
        usuario?.id ?? null,
        'Usuario',
        usuario?.id ?? null,
        // Nunca la contraseña enviada (D3) — solo el identificador y el motivo interno.
        { identificador: codigo, motivo } as Prisma.InputJsonValue,
      ),
    );
  }
}
