import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Apoderado, Prisma, Usuario } from '@prisma/client';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { PrismaService } from '../prisma/prisma.service';
import { ApoderadosService, type DatosApoderado } from './apoderados.service';

/**
 * administracion-usuarios-apoderados, PR3 (design.md D3/D5, tareas 11.1-11.8). Unit tests con
 * `PrismaService`/`AuditoriaService` mockeados — mismo criterio de PR1/PR2 (Postgres real queda
 * reservado para la suite e2e; sin daemon Docker en este entorno, ver DESVIACIÓN declarada en
 * `test/users/apoderados.e2e-spec.ts`).
 */

function crearUsuarioFixture(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: 'usuario-1',
    nombres: 'Estudiante Uno',
    dni: '12345678',
    codigo: 'COD-1',
    correo: 'estudiante@example.com',
    rol: 'estudiante',
    estado: 'activo',
    creado_en: new Date('2026-01-01T00:00:00.000Z'),
    password_hash: null,
    google_id: null,
    bloqueado_hasta: null,
    ...overrides,
  } as Usuario;
}

function crearApoderadoFixture(overrides: Partial<Apoderado> = {}): Apoderado {
  return {
    id: 'apoderado-1',
    nombres: 'Apoderado Uno',
    dni: '87654321',
    correo: null,
    usuario_id: 'usuario-1',
    ...overrides,
  } as Apoderado;
}

const datosBase: DatosApoderado = { nombres: 'Apoderado Uno', dni: '87654321' };

function crearServicio(overrides: {
  usuario?: Usuario | null;
  apoderadoExistente?: Apoderado | null;
  apoderados?: Apoderado[];
}) {
  const usuario = overrides.usuario === undefined ? crearUsuarioFixture() : overrides.usuario;
  const apoderadoCreado = crearApoderadoFixture();

  const findUniqueUsuario = jest.fn().mockResolvedValue(usuario);
  const createApoderado = jest.fn().mockResolvedValue(apoderadoCreado);
  const findFirstApoderado = jest.fn().mockResolvedValue(
    overrides.apoderadoExistente === undefined ? crearApoderadoFixture() : overrides.apoderadoExistente,
  );
  const findManyApoderado = jest.fn().mockResolvedValue(overrides.apoderados ?? []);
  const updateApoderado = jest.fn().mockImplementation(({ data }: { data: Partial<Apoderado> }) =>
    Promise.resolve({ ...crearApoderadoFixture(), ...data }),
  );
  const deleteApoderado = jest.fn().mockResolvedValue(crearApoderadoFixture());

  const txClient = {
    usuario: { findUnique: findUniqueUsuario },
    apoderado: {
      create: createApoderado,
      findFirst: findFirstApoderado,
      update: updateApoderado,
      delete: deleteApoderado,
    },
  } as unknown as Prisma.TransactionClient;

  const prisma = {
    usuario: { findUnique: findUniqueUsuario },
    apoderado: { findMany: findManyApoderado },
    $transaction: jest.fn((callback: (tx: Prisma.TransactionClient) => unknown) => callback(txClient)),
  };
  const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

  const service = new ApoderadosService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
  );

  return {
    service,
    prisma,
    auditoria,
    findUniqueUsuario,
    createApoderado,
    findFirstApoderado,
    findManyApoderado,
    updateApoderado,
    deleteApoderado,
  };
}

describe('ApoderadosService.crear() (R11)', () => {
  // 11.1 RED [R11]
  it('[R11] crea un Apoderado sobre un Usuario estudiante y audita APODERADO_CREADO', async () => {
    const { service, createApoderado, auditoria } = crearServicio({});

    const resultado = await service.crear('usuario-1', datosBase, 'actor-1');

    expect(createApoderado).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nombres: 'Apoderado Uno', dni: '87654321', usuario_id: 'usuario-1' }),
      }),
    );
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.APODERADO_CREADO,
      'actor-1',
      'Apoderado',
      resultado.id,
      expect.objectContaining({ usuario_id: 'usuario-1' }),
    );
  });

  // 11.3 RED adversarial [R11]
  it('[R11] rechaza con 409 USUARIO_NO_ES_ESTUDIANTE sin escritura cuando el rol no es estudiante', async () => {
    const usuarioDocente = crearUsuarioFixture({ rol: 'docente' });
    const { service, createApoderado, auditoria } = crearServicio({ usuario: usuarioDocente });

    let error: unknown;
    try {
      await service.crear('usuario-1', datosBase, 'actor-1');
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      codigo: 'USUARIO_NO_ES_ESTUDIANTE',
      rol_actual: 'docente',
    });
    expect(createApoderado).not.toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  it('404 cuando el Usuario no existe', async () => {
    const { service, createApoderado } = crearServicio({ usuario: null });

    await expect(service.crear('inexistente', datosBase, 'actor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(createApoderado).not.toHaveBeenCalled();
  });
});

describe('ApoderadosService.listar() (R11)', () => {
  // 11.2/11.4 RED [R11]
  it('[R11] lista los apoderados de un estudiante; arreglo vacío es válido', async () => {
    const { service, findManyApoderado } = crearServicio({ apoderados: [] });

    const resultado = await service.listar('usuario-1');

    expect(resultado).toEqual([]);
    expect(findManyApoderado).toHaveBeenCalledWith({ where: { usuario_id: 'usuario-1' } });
  });

  it('[R11] un estudiante puede tener varios apoderados registrados', async () => {
    const varios = [
      crearApoderadoFixture({ id: 'apoderado-1' }),
      crearApoderadoFixture({ id: 'apoderado-2' }),
    ];
    const { service } = crearServicio({ apoderados: varios });

    const resultado = await service.listar('usuario-1');

    expect(resultado).toHaveLength(2);
  });

  // 11.3 RED adversarial [R11]
  it('[R11] rechaza el listado con 409 cuando el Usuario no es estudiante', async () => {
    const usuarioDocente = crearUsuarioFixture({ rol: 'docente' });
    const { service } = crearServicio({ usuario: usuarioDocente });

    await expect(service.listar('usuario-1')).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('ApoderadosService.actualizar() (R11)', () => {
  // 11.5 RED [R11]
  it('[R11] actualiza datos básicos y audita exactamente una fila APODERADO_ACTUALIZADO', async () => {
    const { service, updateApoderado, auditoria } = crearServicio({});

    const resultado = await service.actualizar(
      'usuario-1',
      'apoderado-1',
      { nombres: 'Nuevo Nombre' },
      'actor-1',
    );

    expect(resultado.nombres).toBe('Nuevo Nombre');
    expect(updateApoderado).toHaveBeenCalledTimes(1);
    expect(auditoria.log).toHaveBeenCalledTimes(1);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.APODERADO_ACTUALIZADO,
      'actor-1',
      'Apoderado',
      'apoderado-1',
      expect.objectContaining({ usuario_id: 'usuario-1', campos: ['nombres'] }),
    );
  });

  // 11.3 RED adversarial [R11]
  it('[R11] rechaza con 409 cuando el Usuario no es estudiante, sin actualizar', async () => {
    const usuarioDocente = crearUsuarioFixture({ rol: 'docente' });
    const { service, updateApoderado } = crearServicio({ usuario: usuarioDocente });

    await expect(
      service.actualizar('usuario-1', 'apoderado-1', { nombres: 'X' }, 'actor-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(updateApoderado).not.toHaveBeenCalled();
  });

  it('404 cuando el Apoderado no existe para ese Usuario', async () => {
    const { service, updateApoderado } = crearServicio({ apoderadoExistente: null });

    await expect(
      service.actualizar('usuario-1', 'apoderado-inexistente', { nombres: 'X' }, 'actor-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(updateApoderado).not.toHaveBeenCalled();
  });
});

describe('ApoderadosService.eliminar() (R11)', () => {
  // 11.6 RED [R11]
  it('[R11] elimina físicamente y audita exactamente una fila APODERADO_ELIMINADO', async () => {
    const { service, deleteApoderado, auditoria } = crearServicio({});

    await service.eliminar('usuario-1', 'apoderado-1', 'actor-1');

    expect(deleteApoderado).toHaveBeenCalledWith({ where: { id: 'apoderado-1' } });
    expect(auditoria.log).toHaveBeenCalledTimes(1);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      AUDIT_EVENT_TYPES.APODERADO_ELIMINADO,
      'actor-1',
      'Apoderado',
      'apoderado-1',
      expect.objectContaining({ usuario_id: 'usuario-1', nombres: 'Apoderado Uno', dni: '87654321' }),
    );
  });

  // 11.3 RED adversarial [R11]
  it('[R11] rechaza con 409 cuando el Usuario no es estudiante, sin eliminar', async () => {
    const usuarioDocente = crearUsuarioFixture({ rol: 'docente' });
    const { service, deleteApoderado } = crearServicio({ usuario: usuarioDocente });

    await expect(service.eliminar('usuario-1', 'apoderado-1', 'actor-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(deleteApoderado).not.toHaveBeenCalled();
  });

  it('404 cuando el Apoderado no existe para ese Usuario', async () => {
    const { service, deleteApoderado } = crearServicio({ apoderadoExistente: null });

    await expect(
      service.eliminar('usuario-1', 'apoderado-inexistente', 'actor-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteApoderado).not.toHaveBeenCalled();
  });
});
