import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AuthService } from './auth.service';
import { GoogleOauthService } from './google-oauth.service';
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

    const googleOauthService = { verificar: jest.fn() };

    const service = new AuthService(
      prisma as never,
      passwordService as unknown as PasswordService,
      sessionService as unknown as SessionService,
      auditoria as unknown as AuditoriaService,
      googleOauthService as unknown as GoogleOauthService,
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
    const googleOauthService = { verificar: jest.fn() };

    const service = new AuthService(
      prisma as never,
      passwordService as unknown as PasswordService,
      sessionService as unknown as SessionService,
      auditoria as unknown as AuditoriaService,
      googleOauthService as unknown as GoogleOauthService,
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

/**
 * google-oauth-y-recuperacion, PR2 (design.md D3/D7, tareas 7.1-7.11). Unit test de orquestación
 * sobre mocks — `GoogleOauthService.verificar()` se simula directamente (su propia política
 * fail-closed ya está cubierta por `google-oauth.service.spec.ts`); acá el foco es la máquina de
 * 8 estados de D3 y el orden transaccional D7.
 */
describe('AuthService.loginConGoogle — D3 máquina de 8 estados / D7', () => {
  interface UsuarioFixture {
    id: string;
    correo: string;
    google_id: string | null;
    password_hash: string | null;
    estado: 'activo' | 'inactivo' | 'bloqueado';
    rol: 'comite';
  }

  const SUB = 'google-sub-1';
  const CORREO = 'padre@colegio.edu.ar';

  function crearServicio(overrides: {
    payload?: { sub: string; correo: string } | 'rechazado';
    usuarioPorCorreo?: UsuarioFixture | null;
    usuarioPorGoogleId?: UsuarioFixture | null;
    passwordValida?: boolean;
    transactionThrows?: boolean;
    updateThrowsP2002?: boolean;
  }) {
    const txUsuarioUpdate = jest.fn().mockImplementation(async () => {
      if (overrides.updateThrowsP2002) {
        throw Object.assign(new Error('Unique constraint failed on google_id'), { code: 'P2002' });
      }
      return {};
    });

    const prisma = {
      usuario: {
        findUnique: jest.fn(async ({ where }: { where: { correo?: string; google_id?: string } }) => {
          if (where.correo !== undefined) return overrides.usuarioPorCorreo ?? null;
          if (where.google_id !== undefined) return overrides.usuarioPorGoogleId ?? null;
          return null;
        }),
      },
      $transaction: jest.fn(async (callback: (tx: Prisma.TransactionClient) => Promise<void>) => {
        if (overrides.transactionThrows) {
          throw new Error('fallo simulado de auditoría');
        }
        const tx = { usuario: { update: txUsuarioUpdate } } as unknown as Prisma.TransactionClient;
        return callback(tx);
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

    const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

    const googleOauthService = {
      verificar: jest.fn().mockImplementation(async () => {
        if (overrides.payload === 'rechazado') {
          throw new UnauthorizedException('Credenciales inválidas');
        }
        return overrides.payload ?? { sub: SUB, correo: CORREO };
      }),
    };

    const service = new AuthService(
      prisma as never,
      passwordService as unknown as PasswordService,
      sessionService as unknown as SessionService,
      auditoria as unknown as AuditoriaService,
      googleOauthService as unknown as GoogleOauthService,
    );

    return { service, prisma, passwordService, sessionService, auditoria, googleOauthService, txUsuarioUpdate };
  }

  // 7.1 RED [R3][D3#1]
  it('[R3][D3#1] correo no registrado rechaza sin crear Usuario ni sesión, audita usuario_inexistente', async () => {
    const { service, sessionService, auditoria, prisma } = crearServicio({ usuarioPorCorreo: null });

    await expect(service.loginConGoogle('token-valido')).rejects.toThrow(UnauthorizedException);

    expect(sessionService.crear).not.toHaveBeenCalled();
    expect(prisma.usuario.findUnique).toHaveBeenCalledWith({ where: { correo: CORREO } });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_FALLIDO,
      null,
      'Usuario',
      null,
      expect.objectContaining({ correo: CORREO, motivo: 'usuario_inexistente' }),
    );
  });

  // 7.2 RED [D3#2]
  it('[D3#2] estado bloqueado rechaza y audita usuario_bloqueado', async () => {
    const usuarioBloqueado: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: null,
      password_hash: null,
      estado: 'bloqueado',
      rol: 'comite',
    };
    const { service, sessionService, auditoria } = crearServicio({ usuarioPorCorreo: usuarioBloqueado });

    await expect(service.loginConGoogle('token-valido')).rejects.toThrow(UnauthorizedException);
    expect(sessionService.crear).not.toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_FALLIDO,
      'u1',
      'Usuario',
      'u1',
      expect.objectContaining({ motivo: 'usuario_bloqueado' }),
    );
  });

  // 7.3 RED [R4][R5][D3#3]
  it('[R4][R5][D3#3] google_id ya vinculado con el mismo sub crea sesión sin exigir password', async () => {
    const usuarioVinculado: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: SUB,
      password_hash: 'hash-existente',
      estado: 'activo',
      rol: 'comite',
    };
    const { service, sessionService, auditoria, txUsuarioUpdate } = crearServicio({
      usuarioPorCorreo: usuarioVinculado,
    });

    const resultado = await service.loginConGoogle('token-valido');

    expect(resultado.rol).toBe('comite');
    expect(sessionService.crear).toHaveBeenCalledWith('u1', 'comite', resultado.sessionId);
    expect(txUsuarioUpdate).not.toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_EXITOSO,
      'u1',
      'Usuario',
      'u1',
      expect.objectContaining({ vinculacion: 'ya_vinculada', rol: 'comite', session_id: resultado.sessionId }),
    );
  });

  // 7.4 RED [R4][D3#4] TOFU
  it('[R4][D3#4] TOFU: google_id null y password_hash null vincula y crea sesión', async () => {
    const usuarioTofu: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: null,
      password_hash: null,
      estado: 'activo',
      rol: 'comite',
    };
    const { service, sessionService, auditoria, txUsuarioUpdate } = crearServicio({
      usuarioPorCorreo: usuarioTofu,
      usuarioPorGoogleId: null,
    });

    const resultado = await service.loginConGoogle('token-valido');

    expect(sessionService.crear).toHaveBeenCalledWith('u1', 'comite', resultado.sessionId);
    expect(txUsuarioUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { google_id: SUB } });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_EXITOSO,
      'u1',
      'Usuario',
      'u1',
      expect.objectContaining({ vinculacion: 'primer_uso' }),
    );
  });

  // 7.5 RED [R4][D3#5]
  it('[R4][D3#5] password_hash presente sin password en body rechaza con 409 VINCULACION_REQUERIDA', async () => {
    const usuarioConHash: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: null,
      password_hash: 'hash-existente',
      estado: 'activo',
      rol: 'comite',
    };
    const { service, sessionService, auditoria, txUsuarioUpdate } = crearServicio({
      usuarioPorCorreo: usuarioConHash,
      usuarioPorGoogleId: null,
    });

    let errorCapturado: unknown;
    try {
      await service.loginConGoogle('token-valido');
    } catch (error) {
      errorCapturado = error;
    }

    expect(errorCapturado).toBeInstanceOf(ConflictException);
    expect((errorCapturado as ConflictException).getResponse()).toMatchObject({
      codigo: 'VINCULACION_REQUERIDA',
    });
    expect(sessionService.crear).not.toHaveBeenCalled();
    expect(txUsuarioUpdate).not.toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_FALLIDO,
      'u1',
      'Usuario',
      'u1',
      expect.objectContaining({ motivo: 'vinculacion_requerida' }),
    );
  });

  // 7.6 RED [R4][D3#6]
  it('[R4][D3#6] password_hash presente con password correcta vincula y crea sesión', async () => {
    const usuarioConHash: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: null,
      password_hash: 'hash-existente',
      estado: 'activo',
      rol: 'comite',
    };
    const { service, sessionService, auditoria, txUsuarioUpdate } = crearServicio({
      usuarioPorCorreo: usuarioConHash,
      usuarioPorGoogleId: null,
      passwordValida: true,
    });

    const resultado = await service.loginConGoogle('token-valido', 'password-correcta');

    expect(sessionService.crear).toHaveBeenCalledWith('u1', 'comite', resultado.sessionId);
    expect(txUsuarioUpdate).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { google_id: SUB } });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_EXITOSO,
      'u1',
      'Usuario',
      'u1',
      expect.objectContaining({ vinculacion: 'password_confirmada' }),
    );
  });

  // 7.7 RED [D3#7]
  it('[D3#7] password_hash presente con password incorrecta rechaza sin vincular', async () => {
    const usuarioConHash: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: null,
      password_hash: 'hash-existente',
      estado: 'activo',
      rol: 'comite',
    };
    const { service, sessionService, auditoria, txUsuarioUpdate } = crearServicio({
      usuarioPorCorreo: usuarioConHash,
      usuarioPorGoogleId: null,
      passwordValida: false,
    });

    await expect(
      service.loginConGoogle('token-valido', 'password-incorrecta'),
    ).rejects.toThrow(UnauthorizedException);
    expect(sessionService.crear).not.toHaveBeenCalled();
    expect(txUsuarioUpdate).not.toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_FALLIDO,
      'u1',
      'Usuario',
      'u1',
      expect.objectContaining({ motivo: 'password_incorrecta' }),
    );
  });

  // 7.8 RED [D3#8][adversarial] — google_id del propio Usuario apunta a otro sub.
  it('[D3#8][adversarial] google_id del propio Usuario distinto del sub recibido rechaza sin 500', async () => {
    const usuarioOtroGoogleId: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: 'otro-sub-distinto',
      password_hash: null,
      estado: 'activo',
      rol: 'comite',
    };
    const { service, sessionService, auditoria } = crearServicio({ usuarioPorCorreo: usuarioOtroGoogleId });

    await expect(service.loginConGoogle('token-valido')).rejects.toThrow(UnauthorizedException);
    expect(sessionService.crear).not.toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_FALLIDO,
      'u1',
      'Usuario',
      'u1',
      expect.objectContaining({ motivo: 'google_id_conflicto' }),
    );
  });

  // 7.8 RED [D3#8][adversarial] — sub ya vinculado a OTRO Usuario distinto del encontrado por correo.
  it('[D3#8][adversarial] sub ya vinculado a otro Usuario rechaza en vez de dejar escapar P2002 como 500', async () => {
    const usuarioActual: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: null,
      password_hash: null,
      estado: 'activo',
      rol: 'comite',
    };
    const otroUsuarioConEseSub: UsuarioFixture = {
      id: 'u2',
      correo: 'otro@colegio.edu.ar',
      google_id: SUB,
      password_hash: null,
      estado: 'activo',
      rol: 'comite',
    };
    const { service, sessionService, auditoria, txUsuarioUpdate } = crearServicio({
      usuarioPorCorreo: usuarioActual,
      usuarioPorGoogleId: otroUsuarioConEseSub,
    });

    await expect(service.loginConGoogle('token-valido')).rejects.toThrow(UnauthorizedException);
    expect(sessionService.crear).not.toHaveBeenCalled();
    expect(txUsuarioUpdate).not.toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_FALLIDO,
      'u1',
      'Usuario',
      'u1',
      expect.objectContaining({ motivo: 'google_id_conflicto' }),
    );
  });

  // [adversarial] residual: una carrera que deje pasar el chequeo explícito y llegue al UPDATE con
  // P2002 tampoco debe escapar como 500.
  it('[D3#8][adversarial] P2002 residual del UPDATE (carrera) se traduce a 401, nunca 500', async () => {
    const usuarioTofu: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: null,
      password_hash: null,
      estado: 'activo',
      rol: 'comite',
    };
    const { service, sessionService } = crearServicio({
      usuarioPorCorreo: usuarioTofu,
      usuarioPorGoogleId: null,
      updateThrowsP2002: true,
    });

    await expect(service.loginConGoogle('token-valido')).rejects.toThrow(UnauthorizedException);
    expect(sessionService.crear).not.toHaveBeenCalled();
  });

  // 7.10/7.11 RED [R9][D7]
  it('[R9][D7] fallo de la transacción de auditoría en un login OAuth exitoso no crea sesión', async () => {
    const usuarioVinculado: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: SUB,
      password_hash: 'hash-existente',
      estado: 'activo',
      rol: 'comite',
    };
    const { service, sessionService } = crearServicio({
      usuarioPorCorreo: usuarioVinculado,
      transactionThrows: true,
    });

    await expect(service.loginConGoogle('token-valido')).rejects.toThrow();
    expect(sessionService.crear).not.toHaveBeenCalled();
  });

  // Requerimiento de spec.md "Verificación del ID token de Google" (dominio/firma no permitidos):
  // el rechazo del propio GoogleOauthService también audita LOGIN_OAUTH_FALLIDO.
  it('token rechazado por GoogleOauthService (dominio/firma inválida) audita LOGIN_OAUTH_FALLIDO antes de propagar 401', async () => {
    const { service, sessionService, auditoria } = crearServicio({ payload: 'rechazado' });

    await expect(service.loginConGoogle('token-invalido')).rejects.toThrow(UnauthorizedException);
    expect(sessionService.crear).not.toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.LOGIN_OAUTH_FALLIDO,
      null,
      'Usuario',
      null,
      expect.objectContaining({ motivo: 'token_invalido' }),
    );
  });

  // [adversarial] ningún payload de auditoría OAuth contiene la contraseña enviada.
  it('[adversarial] ningún payload de auditoría OAuth contiene la contraseña enviada', async () => {
    const usuarioConHash: UsuarioFixture = {
      id: 'u1',
      correo: CORREO,
      google_id: null,
      password_hash: 'hash-existente',
      estado: 'activo',
      rol: 'comite',
    };
    const { service, auditoria } = crearServicio({
      usuarioPorCorreo: usuarioConHash,
      usuarioPorGoogleId: null,
      passwordValida: false,
    });

    await expect(
      service.loginConGoogle('token-valido', 'secreta-no-debe-aparecer'),
    ).rejects.toThrow();

    const llamada = auditoria.log.mock.calls[0];
    expect(JSON.stringify(llamada)).not.toContain('secreta-no-debe-aparecer');
  });
});
