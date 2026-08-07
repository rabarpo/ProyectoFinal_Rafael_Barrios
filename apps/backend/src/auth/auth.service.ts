import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { Prisma, RolUsuario, Usuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import type { LoginDto } from './dto/login.dto';

export type MotivoLoginFallido =
  | 'usuario_inexistente'
  | 'password_ausente'
  | 'password_incorrecta'
  | 'usuario_bloqueado';

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
  ) {}

  /**
   * D3: las cuatro causas de rechazo (usuario inexistente, sin `password_hash`, contraseña
   * incorrecta, `estado='bloqueado'`) terminan en el mismo `UnauthorizedException` sin cuerpo
   * distinguible. `PasswordService.verificar()` corre SIEMPRE (incluso cuando `usuario` es
   * `null` o no tiene `password_hash`, contra el hash señuelo) para no abrir un oráculo de
   * tiempo entre "usuario inexistente" y "contraseña incorrecta".
   */
  async login(dto: LoginDto): Promise<ResultadoLogin> {
    const usuario = await this.prisma.usuario.findUnique({ where: { codigo: dto.codigo } });
    const passwordValida = await this.passwordService.verificar(dto.password, usuario?.password_hash);

    if (!usuario || !usuario.password_hash || !passwordValida || usuario.estado === 'bloqueado') {
      const motivo = this.determinarMotivoFallo(usuario, passwordValida);
      await this.auditarLoginFallido(dto.codigo, usuario, motivo);
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // A partir de aquí, TypeScript narrowed `usuario` a no-nulo, con `password_hash` presente,
    // `passwordValida === true` y `estado !== 'bloqueado'` (el `if` de arriba cubre las 4 causas).
    const sessionId = randomBytes(32).toString('base64url');

    await this.prisma.$transaction((tx) =>
      this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.LOGIN_EXITOSO,
        usuario.id,
        'Usuario',
        usuario.id,
        { session_id: sessionId, rol: usuario.rol } as Prisma.InputJsonValue,
      ),
    );

    // D7: solo se llega aquí si la transacción de arriba confirmó. Un fallo de Redis después de
    // este punto deja una fila LOGIN_EXITOSO sin sesión (modo de falla residual aceptado en
    // design.md D7 — sobre-reporta en vez de sub-reportar).
    await this.sessionService.crear(usuario.id, usuario.rol, sessionId);

    return { sessionId, rol: usuario.rol };
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
