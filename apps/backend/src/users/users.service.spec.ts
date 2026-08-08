import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Prisma, Usuario } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import {
  campoDesdeTarget,
  clasificarColision,
  UsersService,
  validarCorreo,
  validarDni,
  type DatosUsuario,
} from './users.service';

/**
 * administracion-usuarios-apoderados, PR1 (design.md D5, tareas 5.1-5.4 y 6.1-6.4). Unit tests
 * sobre el núcleo puro (`clasificarColision`, validadores, mapeo de `P2002`) y sobre la
 * orquestación de `crear()`/`crearIdempotente()` con `PrismaService`/`AuditoriaService` mockeados
 * — mismo criterio que `auth.service.spec.ts` (design.md, "Estrategia de pruebas": Postgres real
 * queda reservado para la suite de integración e2e de PR2/PR3; esta capa prueba orquestación, no
 * persistencia).
 *
 * Deviación declarada frente al snippet literal de design.md D5: `clasificarColision` se expone
 * como función pura exportada (no como método `private` de la clase), siguiendo el precedente ya
 * establecido por `bloqueoVigente()`/`sanarBloqueoVencido()` en `bloqueo.service.ts` — el
 * comportamiento y la firma (`tx`, `datos`, `excluirId?`) son idénticos a los deD5.
 */

function crearUsuarioFixture(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: 'usuario-1',
    nombres: 'Ana Pérez',
    dni: '12345678',
    codigo: 'COD-1',
    correo: 'ana@example.com',
    rol: 'docente',
    estado: 'activo',
    creado_en: new Date('2026-01-01T00:00:00.000Z'),
    password_hash: null,
    google_id: null,
    bloqueado_hasta: null,
    ...overrides,
  } as Usuario;
}

function crearTxMock(porDni: Usuario | null, porCodigo: Usuario | null, porCorreo: Usuario | null) {
  const findFirst = jest.fn(({ where }: { where: Record<string, unknown> }) => {
    if ('dni' in where) return Promise.resolve(porDni);
    if ('codigo' in where) return Promise.resolve(porCodigo);
    return Promise.resolve(porCorreo);
  });
  return { usuario: { findFirst } } as unknown as Prisma.TransactionClient;
}

const datosBase: DatosUsuario = {
  nombres: 'Ana Pérez',
  dni: '12345678',
  codigo: 'COD-1',
  correo: 'ana@example.com',
  rol: 'docente',
};

describe('clasificarColision() (D5)', () => {
  // 5.1 [D5]
  it('[D5] sin_colision cuando ningún campo coincide', async () => {
    const tx = crearTxMock(null, null, null);
    const resultado = await clasificarColision(tx, datosBase);
    expect(resultado).toEqual({ tipo: 'sin_colision' });
  });

  // 5.1 [D5]
  it('[D5] coincidencia_exacta cuando dni y codigo apuntan a la misma fila', async () => {
    const fila = crearUsuarioFixture();
    const tx = crearTxMock(fila, fila, fila);
    const resultado = await clasificarColision(tx, datosBase);
    expect(resultado).toEqual({ tipo: 'coincidencia_exacta', usuario: fila });
  });

  // 5.1 [D5]
  it('[D5] conflicto por dni cuando solo el dni coincide con otra fila', async () => {
    const otra = crearUsuarioFixture({ id: 'usuario-otro' });
    const tx = crearTxMock(otra, null, null);
    const resultado = await clasificarColision(tx, datosBase);
    expect(resultado).toEqual({ tipo: 'conflicto', campo: 'dni' });
  });

  // 5.1 [D5]
  it('[D5] conflicto por codigo cuando solo el codigo coincide con otra fila', async () => {
    const otra = crearUsuarioFixture({ id: 'usuario-otro' });
    const tx = crearTxMock(null, otra, null);
    const resultado = await clasificarColision(tx, datosBase);
    expect(resultado).toEqual({ tipo: 'conflicto', campo: 'codigo' });
  });

  // 5.1 [D5]
  it('[D5] conflicto por correo cuando solo el correo coincide con otra fila', async () => {
    const otra = crearUsuarioFixture({ id: 'usuario-otro' });
    const tx = crearTxMock(null, null, otra);
    const resultado = await clasificarColision(tx, datosBase);
    expect(resultado).toEqual({ tipo: 'conflicto', campo: 'correo' });
  });

  // 5.1 [D5] dni y codigo coinciden pero con filas DISTINTAS: nunca reasigna identidad.
  it('[D5] conflicto por dni cuando dni y codigo coinciden con filas distintas', async () => {
    const filaDni = crearUsuarioFixture({ id: 'usuario-a' });
    const filaCodigo = crearUsuarioFixture({ id: 'usuario-b' });
    const tx = crearTxMock(filaDni, filaCodigo, null);
    const resultado = await clasificarColision(tx, datosBase);
    expect(resultado).toEqual({ tipo: 'conflicto', campo: 'dni' });
  });

  // 5.1 [D5] excluirId en edición: la propia fila no cuenta como colisión.
  it('[D5] excluirId excluye la propia fila del chequeo de unicidad', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const tx = { usuario: { findFirst } } as unknown as Prisma.TransactionClient;

    await clasificarColision(tx, datosBase, 'usuario-1');

    for (const llamada of findFirst.mock.calls) {
      const where = llamada[0].where as { id?: { not: string } };
      expect(where.id).toEqual({ not: 'usuario-1' });
    }
  });
});

describe('validarDni() (R3)', () => {
  // 5.2 [R3]
  it('[R3] acepta un dni de 20 caracteres', () => {
    expect(() => validarDni('A'.repeat(20))).not.toThrow();
  });

  // 5.2 [R3]
  it('[R3] rechaza un dni de 21 caracteres', () => {
    expect(() => validarDni('A'.repeat(21))).toThrow(BadRequestException);
  });

  // 5.2 [R3] formato no numérico aceptado — el validador nunca chequea patrón, solo longitud.
  it('[R3] acepta formato no numérico', () => {
    expect(() => validarDni('AB-1234-XY')).not.toThrow();
  });
});

describe('validarCorreo() (R4)', () => {
  // 5.2 [R4]
  it('[R4] acepta un correo con formato válido fuera del dominio institucional', () => {
    expect(() => validarCorreo('externo@gmail.com')).not.toThrow();
  });

  // 5.2 [R4]
  it('[R4] rechaza un valor sin forma de correo', () => {
    expect(() => validarCorreo('no-es-un-correo')).toThrow(BadRequestException);
  });
});

describe('campoDesdeTarget() — mapeo P2002 (D2)', () => {
  // 5.3 [D2]
  it('[D2] deriva "dni" cuando el target incluye la columna dni', () => {
    expect(campoDesdeTarget(['dni'])).toBe('dni');
  });

  // 5.3 [D2]
  it('[D2] deriva "codigo" cuando el target incluye la columna codigo', () => {
    expect(campoDesdeTarget(['codigo'])).toBe('codigo');
  });

  // 5.3 [D2]
  it('[D2] deriva "correo" cuando el target incluye la columna correo', () => {
    expect(campoDesdeTarget(['correo'])).toBe('correo');
  });
});

describe('UsersService.crear() (R1/R2/D5)', () => {
  function crearServicio(overrides: {
    porDni?: Usuario | null;
    porCodigo?: Usuario | null;
    porCorreo?: Usuario | null;
    createThrows?: unknown;
  }) {
    const usuarioCreado = crearUsuarioFixture();
    const create = jest.fn().mockImplementation(() => {
      if (overrides.createThrows) throw overrides.createThrows;
      return Promise.resolve(usuarioCreado);
    });
    const findFirst = jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if ('dni' in where) return Promise.resolve(overrides.porDni ?? null);
      if ('codigo' in where) return Promise.resolve(overrides.porCodigo ?? null);
      return Promise.resolve(overrides.porCorreo ?? null);
    });

    const prisma = {
      $transaction: jest.fn((callback: (tx: Prisma.TransactionClient) => unknown) =>
        callback({ usuario: { findFirst, create } } as unknown as Prisma.TransactionClient),
      ),
    };
    const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

    const service = new UsersService(
      prisma as unknown as PrismaService,
      auditoria as unknown as AuditoriaService,
    );

    return { service, prisma, auditoria, create };
  }

  // 6.1 RED [R2][D5]
  it('[R2][D5] coincidencia_exacta responde 409 CAMPO_DUPLICADO en crear()', async () => {
    const fila = crearUsuarioFixture();
    const { service, create, auditoria } = crearServicio({
      porDni: fila,
      porCodigo: fila,
      porCorreo: fila,
    });

    await expect(service.crear(datosBase, 'actor-1')).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  // 6.4 [R1]
  it('[R1] crea el Usuario con password_hash null y audita USUARIO_CREADO', async () => {
    const { service, create, auditoria } = crearServicio({});

    const resultado = await service.crear(datosBase, 'actor-1');

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ password_hash: null, estado: 'activo' }),
      }),
    );
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.USUARIO_CREADO,
      'actor-1',
      'Usuario',
      resultado.id,
      expect.objectContaining({ origen: 'manual' }),
    );
    // `UsuarioRespuestaDto` no declara `password_hash` ni `google_id`: la garantía es de tipo,
    // no de valor en runtime (mismo criterio que el resto del CRUD, spec "Aislamiento de rol comite").
  });

  // 6.3 RED [D2]
  it('[D2] P2002 residual se traduce a 409 CAMPO_DUPLICADO derivando el campo de meta.target', async () => {
    const p2002 = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['dni'] },
    });
    const { service } = crearServicio({ createThrows: p2002 });

    let error: unknown;
    try {
      await service.crear(datosBase, 'actor-1');
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      codigo: 'CAMPO_DUPLICADO',
      campo: 'dni',
    });
  });
});

describe('UsersService.crearIdempotente() (R13/D5 — gancho #9)', () => {
  function crearServicio(overrides: {
    porDni?: Usuario | null;
    porCodigo?: Usuario | null;
    porCorreo?: Usuario | null;
  }) {
    const usuarioCreado = crearUsuarioFixture();
    const create = jest.fn().mockResolvedValue(usuarioCreado);
    const findFirst = jest.fn(({ where }: { where: Record<string, unknown> }) => {
      if ('dni' in where) return Promise.resolve(overrides.porDni ?? null);
      if ('codigo' in where) return Promise.resolve(overrides.porCodigo ?? null);
      return Promise.resolve(overrides.porCorreo ?? null);
    });
    const tx = { usuario: { findFirst, create } } as unknown as Prisma.TransactionClient;

    const prisma = {
      $transaction: jest.fn((callback: (tx: Prisma.TransactionClient) => unknown) => callback(tx)),
    };
    const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

    const service = new UsersService(
      prisma as unknown as PrismaService,
      auditoria as unknown as AuditoriaService,
    );

    return { service, prisma, auditoria, create, tx };
  }

  // 6.1 RED [R13][D5]
  it('[R13][D5] coincidencia_exacta responde { creado: false } sin escribir ni auditar', async () => {
    const fila = crearUsuarioFixture();
    const { service, create, auditoria } = crearServicio({
      porDni: fila,
      porCodigo: fila,
      porCorreo: fila,
    });

    const resultado = await service.crearIdempotente(datosBase, 'actor-1');

    expect(resultado.creado).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  // 6.2 RED [R13][D5]
  it('[R13][D5] con tx externo participa de la transacción del llamador y no abre una propia', async () => {
    const { service, prisma, tx } = crearServicio({});

    await service.crearIdempotente(datosBase, 'actor-1', tx);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // 6.2 RED [R13][D5]
  it('[R13][D5] con tx externo y coincidencia_exacta no audita', async () => {
    const fila = crearUsuarioFixture();
    const { service, auditoria, tx } = crearServicio({ porDni: fila, porCodigo: fila, porCorreo: fila });

    const resultado = await service.crearIdempotente(datosBase, 'actor-1', tx);

    expect(resultado.creado).toBe(false);
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  // 6.4 [R13][D5]
  it('[R13][D5] crea y audita con origen idempotente cuando no hay colisión', async () => {
    const { service, create, auditoria } = crearServicio({});

    const resultado = await service.crearIdempotente(datosBase, 'actor-1');

    expect(resultado.creado).toBe(true);
    expect(create).toHaveBeenCalled();
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.USUARIO_CREADO,
      'actor-1',
      'Usuario',
      resultado.usuario.id,
      expect.objectContaining({ origen: 'idempotente' }),
    );
  });

  // 6.1 RED [R2][D5] conflicto real (no exacto) sigue siendo 409, incluso en el camino idempotente.
  it('[D5] conflicto parcial (solo dni) responde 409 CAMPO_DUPLICADO', async () => {
    const otra = crearUsuarioFixture({ id: 'usuario-otro' });
    const { service, create } = crearServicio({ porDni: otra });

    await expect(service.crearIdempotente(datosBase, 'actor-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(create).not.toHaveBeenCalled();
  });
});
