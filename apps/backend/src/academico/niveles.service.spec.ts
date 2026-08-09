import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import type { PrismaService } from '../prisma/prisma.service';
import { NivelesService } from './niveles.service';

/**
 * administracion-academica, PR4 (design.md D2/D5, tareas 13.1-13.9). Unit tests con
 * `PrismaService`/`AuditoriaService` mockeados — mismo criterio que
 * `anios-escolares.service.spec.ts` de PR2.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR3): `docker ps` no tiene daemon disponible en
 * este entorno, así que la cobertura e2e real de `test/academico/niveles.e2e-spec.ts` no pudo
 * ejecutarse contra Postgres vivo en esta sesión. La suite queda escrita y type-checkeada. Esta
 * suite unit cubre la lógica de negocio equivalente con mocks.
 */

function construirServicio(overrides: {
  findFirst?: jest.Mock;
  findUnique?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
  gradoCount?: jest.Mock;
}) {
  const nivel = {
    findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
    findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn(),
    update: overrides.update ?? jest.fn(),
    delete: overrides.delete ?? jest.fn(),
  };
  const grado = { count: overrides.gradoCount ?? jest.fn().mockResolvedValue(0) };

  const tx = { nivel, grado };
  const prisma = {
    nivel: { findMany: jest.fn().mockResolvedValue([]), findUnique: nivel.findUnique },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
  const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

  const servicio = new NivelesService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
  );

  return { servicio, tx, prisma, auditoria };
}

describe('NivelesService.crear() (AT1, D5)', () => {
  // 13.1: creación exitosa con nombre no usado.
  it('[13.1] crea el Nivel y audita NIVEL_CREADO', async () => {
    const creado = { id: 'n1', nombre: 'Inicial' };
    const { servicio, auditoria } = construirServicio({
      create: jest.fn().mockResolvedValue(creado),
    });

    const resultado = await servicio.crear({ nombre: 'Inicial' }, 'actor-1');

    expect(resultado).toEqual({ id: 'n1', nombre: 'Inicial' });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'NIVEL_CREADO',
      'actor-1',
      'Nivel',
      'n1',
      expect.objectContaining({ nombre: 'Inicial' }),
    );
  });

  // 13.2: nombre duplicado -> 409 RESTRICCION_UNICA.
  it('[13.2] nombre duplicado (precheck) responde 409 RESTRICCION_UNICA sin crear fila', async () => {
    const existente = { id: 'n0', nombre: 'Inicial' };
    const create = jest.fn();
    const { servicio } = construirServicio({ findFirst: jest.fn().mockResolvedValue(existente), create });

    await expect(servicio.crear({ nombre: 'Inicial' }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', entidad: 'Nivel', campos: ['nombre'] },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('[adversarial] catch P2002 residual (carrera) traduce a 409 RESTRICCION_UNICA', async () => {
    const p2002 = { code: 'P2002', meta: { target: ['nombre'] } };
    const create = jest.fn().mockImplementation(() => {
      throw p2002;
    });
    const { servicio } = construirServicio({ create });

    await expect(servicio.crear({ nombre: 'Inicial' }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', campos: ['nombre'] },
    });
  });
});

describe('NivelesService.obtenerPorId() (D5)', () => {
  // 13.4: GET :id, 404 inexistente.
  it('[13.4] lanza NotFoundException cuando el id no existe', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.obtenerPorId('inexistente')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('[13.4] devuelve el Nivel mapeado cuando existe', async () => {
    const fila = { id: 'n1', nombre: 'Inicial' };
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(fila) });
    await expect(servicio.obtenerPorId('n1')).resolves.toEqual(fila);
  });
});

describe('NivelesService.actualizar() (D5)', () => {
  // 13.5: PATCH cambia nombre, 1 fila NIVEL_ACTUALIZADO.
  it('[13.5] actualiza nombre y audita NIVEL_ACTUALIZADO', async () => {
    const actual = { id: 'n1', nombre: 'Viejo' };
    const actualizado = { id: 'n1', nombre: 'Nuevo' };
    const { servicio, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      update: jest.fn().mockResolvedValue(actualizado),
    });

    const resultado = await servicio.actualizar('n1', { nombre: 'Nuevo' }, 'actor-1');

    expect(resultado.nombre).toBe('Nuevo');
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'NIVEL_ACTUALIZADO',
      'actor-1',
      'Nivel',
      'n1',
      expect.objectContaining({ campos: ['nombre'] }),
    );
  });

  it('[13.5] :id inexistente responde 404, sin escribir', async () => {
    const update = jest.fn();
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null), update });
    await expect(servicio.actualizar('inexistente', { nombre: 'X' }, 'actor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('NivelesService.eliminar() (AT1, D2)', () => {
  // 13.7: DELETE exitoso sin dependientes.
  it('[13.7] elimina sin dependientes y audita NIVEL_ELIMINADO', async () => {
    const actual = { id: 'n1', nombre: 'Inicial' };
    const { servicio, tx, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
    });

    await servicio.eliminar('n1', 'actor-1');

    expect(tx.nivel.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'NIVEL_ELIMINADO',
      'actor-1',
      'Nivel',
      'n1',
      expect.objectContaining({ nombre: 'Inicial' }),
    );
  });

  // 13.6/13.8: precomprobación de Grado dependiente -> 409 ENTIDAD_CON_DEPENDIENTES.
  it('[13.8] Grado dependiente responde 409 ENTIDAD_CON_DEPENDIENTES sin borrar la fila', async () => {
    const actual = { id: 'n1', nombre: 'Inicial' };
    const { servicio, tx } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      gradoCount: jest.fn().mockResolvedValue(1),
    });

    await expect(servicio.eliminar('n1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', entidad: 'Nivel', relacion: 'Grado' },
    });
    expect(tx.nivel.delete).not.toHaveBeenCalled();
  });

  it(':id inexistente responde 404', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.eliminar('inexistente', 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  // 13.9: catch P2003 residual (carrera) traduce al mismo 409, nunca 500.
  it('[13.9] catch P2003 residual (carrera) traduce al mismo 409 ENTIDAD_CON_DEPENDIENTES', async () => {
    const actual = { id: 'n1', nombre: 'Inicial' };
    const p2003 = { code: 'P2003', meta: { field_name: 'Grado_nivel_id_fkey (index)' } };
    const deleteFn = jest.fn().mockImplementation(() => {
      throw p2003;
    });
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      delete: deleteFn,
    });

    await expect(servicio.eliminar('n1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Grado' },
    });
  });
});
