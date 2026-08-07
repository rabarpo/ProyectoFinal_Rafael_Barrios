import { UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';

/**
 * auth-server-sessions, PR3 (design.md D3/D7). Unit test sobre mocks: `PrismaService` se mockea
 * al nivel de `usuario.findUnique` + `$transaction` (que aquí ejecuta el callback directamente,
 * sin abrir Postgres real — coherente con la tabla de pruebas del design, que reserva Postgres
 * real para `test/auditoria-transaccional.e2e-spec.ts` y los e2e de #4). El foco de este test es
 * la ORQUESTACIÓN: qué se llama, en qué orden y con qué payload — no la persistencia real.
 */
describe('AuthService.login — orquestación D3/D7', () => {
  interface UsuarioFixture {
    id: string;
    codigo: string;
    password_hash: string | null;
    estado: 'activo' | 'inactivo' | 'bloqueado';
    rol: 'comite';
  }

  const usuarioActivo: UsuarioFixture = {
    id: 'usuario-1',
    codigo: 'seed-comite',
    password_hash: 'hash-real',
    estado: 'activo',
    rol: 'comite',
  };

  function crearServicio(overrides: {
    usuario?: UsuarioFixture | null;
    passwordValida?: boolean;
    transactionThrows?: boolean;
  }) {
    const prisma = {
      usuario: {
        findUnique: jest.fn().mockResolvedValue(overrides.usuario ?? null),
      },
      $transaction: jest.fn(async (callback: (tx: Prisma.TransactionClient) => Promise<void>) => {
        if (overrides.transactionThrows) {
          throw new Error('fallo simulado de auditoría');
        }
        return callback({} as Prisma.TransactionClient);
      }),
    };

    const passwordService = {
      verificar: jest.fn().mockResolvedValue(overrides.passwordValida ?? false),
    };

    const sessionService = {
      crear: jest.fn().mockResolvedValue('session-generada'),
      obtener: jest.fn(),
      revocar: jest.fn(),
    };

    const auditoria = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const service = new AuthService(
      prisma as never,
      passwordService as unknown as PasswordService,
      sessionService as unknown as SessionService,
      auditoria as unknown as AuditoriaService,
    );

    return { service, prisma, passwordService, sessionService, auditoria };
  }

  // 7.1 RED [R9][D7]: si la transacción de auditoría falla, NO se llega a crear la sesión.
  it('[R9][D7] fallo de la transacción de auditoría no crea sesión en Redis', async () => {
    const { service, sessionService } = crearServicio({
      usuario: usuarioActivo,
      passwordValida: true,
      transactionThrows: true,
    });

    await expect(service.login({ codigo: 'seed-comite', password: 'correcta' })).rejects.toThrow();
    expect(sessionService.crear).not.toHaveBeenCalled();
  });

  // 7.3 [R2]: credenciales válidas + estado !== 'bloqueado' crean sesión y devuelven sessionId/rol.
  it('[R2] credenciales válidas crean una sesión y registran LOGIN_EXITOSO', async () => {
    const { service, sessionService, auditoria } = crearServicio({
      usuario: usuarioActivo,
      passwordValida: true,
    });

    const resultado = await service.login({ codigo: 'seed-comite', password: 'correcta' });

    expect(resultado.rol).toBe('comite');
    expect(sessionService.crear).toHaveBeenCalledWith('usuario-1', 'comite', resultado.sessionId);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_EXITOSO,
      'usuario-1',
      'Usuario',
      'usuario-1',
      expect.objectContaining({ session_id: resultado.sessionId, rol: 'comite' }),
    );
  });

  // 7.4 [R3a][R3b]: contraseña incorrecta no crea sesión y audita exactamente un LOGIN_FALLIDO.
  it('[R3a][R3b] contraseña incorrecta no crea sesión y audita LOGIN_FALLIDO con motivo password_incorrecta', async () => {
    const { service, sessionService, auditoria } = crearServicio({
      usuario: usuarioActivo,
      passwordValida: false,
    });

    await expect(service.login({ codigo: 'seed-comite', password: 'incorrecta' })).rejects.toThrow(
      UnauthorizedException,
    );

    expect(sessionService.crear).not.toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledTimes(1);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_FALLIDO,
      'usuario-1',
      'Usuario',
      'usuario-1',
      expect.objectContaining({ motivo: 'password_incorrecta' }),
    );
  });

  // 7.5 [R4]: usuario bloqueado con contraseña correcta es rechazado, sin crear sesión.
  it('[R4] estado bloqueado con contraseña correcta es rechazado y no crea sesión', async () => {
    const usuarioBloqueado = { ...usuarioActivo, estado: 'bloqueado' as const };
    const { service, sessionService, auditoria } = crearServicio({
      usuario: usuarioBloqueado,
      passwordValida: true,
    });

    await expect(service.login({ codigo: 'seed-comite', password: 'correcta' })).rejects.toThrow(
      UnauthorizedException,
    );

    expect(sessionService.crear).not.toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_FALLIDO,
      'usuario-1',
      'Usuario',
      'usuario-1',
      expect.objectContaining({ motivo: 'usuario_bloqueado' }),
    );
  });

  // 9.1 [D3][adversarial]: usuario inexistente y usuario sin password_hash producen el mismo
  // resultado observable (401 + motivo interno distinto solo en auditoría).
  it('[D3][adversarial] usuario inexistente es rechazado con UnauthorizedException y motivo usuario_inexistente', async () => {
    const { service, auditoria } = crearServicio({ usuario: null, passwordValida: false });

    await expect(service.login({ codigo: 'no-existe', password: 'cualquiera' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_FALLIDO,
      null,
      'Usuario',
      null,
      expect.objectContaining({ motivo: 'usuario_inexistente', identificador: 'no-existe' }),
    );
  });

  it('[D3][adversarial] usuario sin password_hash es rechazado con motivo password_ausente', async () => {
    const usuarioSinCredencial = { ...usuarioActivo, password_hash: null };
    const { service, auditoria } = crearServicio({
      usuario: usuarioSinCredencial,
      passwordValida: false,
    });

    await expect(
      service.login({ codigo: 'seed-comite', password: 'cualquiera' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_FALLIDO,
      'usuario-1',
      'Usuario',
      'usuario-1',
      expect.objectContaining({ motivo: 'password_ausente' }),
    );
  });

  // adversarial: ningún payload de auditoría contiene la contraseña enviada.
  it('[adversarial] ningún payload de auditoría contiene la contraseña enviada', async () => {
    const { service, auditoria } = crearServicio({ usuario: usuarioActivo, passwordValida: false });

    await expect(
      service.login({ codigo: 'seed-comite', password: 'secreta-no-debe-aparecer' }),
    ).rejects.toThrow();

    const llamada = auditoria.log.mock.calls[0];
    expect(JSON.stringify(llamada)).not.toContain('secreta-no-debe-aparecer');
  });
});

describe('AuthService.logout — D7 (auditoría antes de revocar en Redis)', () => {
  function crearServicio(sesionExistente: { userId: string; rol: string; creadoEn: number } | null) {
    const prisma = {
      usuario: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: Prisma.TransactionClient) => Promise<void>) =>
        callback({} as Prisma.TransactionClient),
      ),
    };
    const passwordService = { verificar: jest.fn() };
    const sessionService = {
      crear: jest.fn(),
      obtener: jest.fn().mockResolvedValue(sesionExistente),
      revocar: jest.fn().mockResolvedValue(undefined),
    };
    const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

    const service = new AuthService(
      prisma as never,
      passwordService as unknown as PasswordService,
      sessionService as unknown as SessionService,
      auditoria as unknown as AuditoriaService,
    );

    return { service, sessionService, auditoria };
  }

  // 7.6 [R5]: logout() borra session:{id}, hace SREM (vía revocar()) y audita exactamente un LOGOUT.
  it('[R5] logout() revoca la sesión y audita exactamente un LOGOUT', async () => {
    const { service, sessionService, auditoria } = crearServicio({
      userId: 'usuario-1',
      rol: 'comite',
      creadoEn: 1000,
    });

    await service.logout('session-activa');

    expect(auditoria.log).toHaveBeenCalledTimes(1);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGOUT,
      'usuario-1',
      'Usuario',
      'usuario-1',
      expect.objectContaining({ session_id: 'session-activa' }),
    );
    expect(sessionService.revocar).toHaveBeenCalledWith('session-activa');
  });

  it('logout() de una sesión inexistente es idempotente: no audita ni intenta revocar', async () => {
    const { service, sessionService, auditoria } = crearServicio(null);

    await service.logout('session-ya-borrada');

    expect(auditoria.log).not.toHaveBeenCalled();
    expect(sessionService.revocar).not.toHaveBeenCalled();
  });
});
