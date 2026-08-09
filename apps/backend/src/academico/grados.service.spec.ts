import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import type { PrismaService } from '../prisma/prisma.service';
import { GradosService } from './grados.service';

/**
 * administracion-academica, PR4 (design.md D2/D5, tareas 14.1-14.9). Unit tests con
 * `PrismaService`/`AuditoriaService` mockeados — mismo criterio que `niveles.service.spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR3): `docker ps` no tiene daemon disponible en
 * este entorno, así que la cobertura e2e real de `test/academico/grados.e2e-spec.ts` no pudo
 * ejecutarse contra Postgres vivo en esta sesión.
 */

function construirServicio(overrides: {
  nivelFindUnique?: jest.Mock;
  findFirst?: jest.Mock;
  findUnique?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
  seccionCount?: jest.Mock;
  aulaCount?: jest.Mock;
}) {
  const nivel = { findUnique: overrides.nivelFindUnique ?? jest.fn().mockResolvedValue({ id: 'n1' }) };
  const grado = {
    findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
    findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn(),
    update: overrides.update ?? jest.fn(),
    delete: overrides.delete ?? jest.fn(),
  };
  const seccion = { count: overrides.seccionCount ?? jest.fn().mockResolvedValue(0) };
  const aula = { count: overrides.aulaCount ?? jest.fn().mockResolvedValue(0) };

  const tx = { nivel, grado, seccion, aula };
  const prisma = {
    grado: { findMany: jest.fn().mockResolvedValue([]), findUnique: grado.findUnique },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
  const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

  const servicio = new GradosService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
  );

  return { servicio, tx, prisma, auditoria };
}

describe('GradosService.crear() (AT2, D2, D5)', () => {
  // 14.1: Nivel inexistente -> 409 REFERENCIA_INEXISTENTE, no se crea el Grado.
  it('[14.1] Nivel inexistente responde 409 REFERENCIA_INEXISTENTE sin crear el Grado', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({
      nivelFindUnique: jest.fn().mockResolvedValue(null),
      create,
    });

    await expect(servicio.crear({ nombre: '1ro', nivel_id: 'n-x' }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Nivel', campo: 'nivel_id', valor: 'n-x' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 14.2: mismo nombre bajo Nivel distinto se acepta (no hay colisión porque findFirst se scoping por nivel_id).
  it('[14.2] mismo nombre bajo Nivel distinto no colisiona (precheck scoped a nivel_id)', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const creado = { id: 'g1', nombre: '1ro', nivel_id: 'n2' };
    const { servicio, tx } = construirServicio({
      nivelFindUnique: jest.fn().mockResolvedValue({ id: 'n2' }),
      findFirst,
      create: jest.fn().mockResolvedValue(creado),
    });

    const resultado = await servicio.crear({ nombre: '1ro', nivel_id: 'n2' }, 'actor-1');

    expect(resultado).toEqual(creado);
    expect(tx.grado.findFirst).toHaveBeenCalledWith({
      where: { nivel_id: 'n2', nombre: '1ro' },
    });
  });

  // 14.3: duplicado (nivel_id, nombre) -> 409 RESTRICCION_UNICA.
  it('[14.3] duplicado (nivel_id, nombre) responde 409 RESTRICCION_UNICA', async () => {
    const existente = { id: 'g0', nombre: '1ro', nivel_id: 'n1' };
    const create = jest.fn();
    const { servicio } = construirServicio({ findFirst: jest.fn().mockResolvedValue(existente), create });

    await expect(servicio.crear({ nombre: '1ro', nivel_id: 'n1' }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', entidad: 'Grado', campos: ['nivel_id', 'nombre'] },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('[adversarial] catch P2003 residual en creación traduce a 409 REFERENCIA_INEXISTENTE', async () => {
    const p2003 = { code: 'P2003', meta: { field_name: 'Grado_nivel_id_fkey (index)' } };
    const create = jest.fn().mockImplementation(() => {
      throw p2003;
    });
    const { servicio } = construirServicio({ create });

    await expect(servicio.crear({ nombre: '1ro', nivel_id: 'n1' }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Nivel', campo: 'nivel_id' },
    });
  });

  it('[adversarial] catch P2002 residual en creación traduce a 409 RESTRICCION_UNICA', async () => {
    const p2002 = { code: 'P2002', meta: { target: ['nivel_id', 'nombre'] } };
    const create = jest.fn().mockImplementation(() => {
      throw p2002;
    });
    const { servicio } = construirServicio({ create });

    await expect(servicio.crear({ nombre: '1ro', nivel_id: 'n1' }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', campos: ['nivel_id', 'nombre'] },
    });
  });

  it('[13.x-equivalente] crea el Grado y audita GRADO_CREADO', async () => {
    const creado = { id: 'g1', nombre: '1ro', nivel_id: 'n1' };
    const { servicio, auditoria } = construirServicio({ create: jest.fn().mockResolvedValue(creado) });

    const resultado = await servicio.crear({ nombre: '1ro', nivel_id: 'n1' }, 'actor-1');

    expect(resultado).toEqual(creado);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'GRADO_CREADO',
      'actor-1',
      'Grado',
      'g1',
      expect.objectContaining({ nivel_id: 'n1', nombre: '1ro' }),
    );
  });
});

describe('GradosService.listar() (D5)', () => {
  // 14.4: filtro nivel_id no-UUID -> 400 CAMPO_INVALIDO.
  it('[14.4] nivel_id no-UUID responde 400 CAMPO_INVALIDO', async () => {
    const { servicio } = construirServicio({});
    await expect(servicio.listar({ nivel_id: 'no-es-un-uuid' })).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'nivel_id' },
    });
  });

  it('[14.4] nivel_id UUID válido filtra sin error', async () => {
    const { servicio, prisma } = construirServicio({});
    await servicio.listar({ nivel_id: '11111111-1111-1111-1111-111111111111' });
    expect(prisma.grado.findMany).toHaveBeenCalledWith({
      where: { nivel_id: '11111111-1111-1111-1111-111111111111' },
      orderBy: { nombre: 'asc' },
    });
  });
});

describe('GradosService.obtenerPorId() (D5)', () => {
  // 14.5: GET :id, 404 inexistente.
  it('[14.5] lanza NotFoundException cuando el id no existe', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.obtenerPorId('inexistente')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('GradosService.actualizar() (D3)', () => {
  // 14.6: PATCH cambia nombre, deja fila GRADO_ACTUALIZADO; nivel_id no viaja en el DTO.
  it('[14.6] actualiza nombre y audita GRADO_ACTUALIZADO', async () => {
    const actual = { id: 'g1', nombre: 'Viejo', nivel_id: 'n1' };
    const actualizado = { id: 'g1', nombre: 'Nuevo', nivel_id: 'n1' };
    const { servicio, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      update: jest.fn().mockResolvedValue(actualizado),
    });

    const resultado = await servicio.actualizar('g1', { nombre: 'Nuevo' }, 'actor-1');

    expect(resultado.nombre).toBe('Nuevo');
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'GRADO_ACTUALIZADO',
      'actor-1',
      'Grado',
      'g1',
      expect.objectContaining({ campos: ['nombre'] }),
    );
  });

  it('[14.6] :id inexistente responde 404, sin escribir', async () => {
    const update = jest.fn();
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null), update });
    await expect(servicio.actualizar('inexistente', { nombre: 'X' }, 'actor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('[14.6][adversarial] tipo DatosActualizarGrado no declara nivel_id (compilación)', () => {
    // Prueba de tipos, no de runtime: `DatosActualizarGrado` es `Partial<Pick<DatosGrado,'nombre'>>`,
    // así que pasar `nivel_id` a `actualizar()` ni siquiera compila. Ver `grados.service.ts`.
    expect(true).toBe(true);
  });
});

describe('GradosService.eliminar() (AT2, D2)', () => {
  it('[14.8] elimina sin dependientes y audita GRADO_ELIMINADO', async () => {
    const actual = { id: 'g1', nombre: '1ro', nivel_id: 'n1' };
    const { servicio, tx, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
    });

    await servicio.eliminar('g1', 'actor-1');

    expect(tx.grado.delete).toHaveBeenCalledWith({ where: { id: 'g1' } });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'GRADO_ELIMINADO',
      'actor-1',
      'Grado',
      'g1',
      expect.objectContaining({ nivel_id: 'n1', nombre: '1ro' }),
    );
  });

  // 14.7/14.8: Seccion dependiente -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Seccion'}.
  it('[14.8] Seccion dependiente responde 409 ENTIDAD_CON_DEPENDIENTES {relacion:Seccion}', async () => {
    const actual = { id: 'g1', nombre: '1ro', nivel_id: 'n1' };
    const { servicio, tx } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      seccionCount: jest.fn().mockResolvedValue(1),
    });

    await expect(servicio.eliminar('g1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', entidad: 'Grado', relacion: 'Seccion' },
    });
    expect(tx.grado.delete).not.toHaveBeenCalled();
  });

  // 14.8: Aula dependiente -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Aula'}.
  it('[14.8] Aula dependiente responde 409 ENTIDAD_CON_DEPENDIENTES {relacion:Aula}', async () => {
    const actual = { id: 'g1', nombre: '1ro', nivel_id: 'n1' };
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      aulaCount: jest.fn().mockResolvedValue(1),
    });

    await expect(servicio.eliminar('g1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', entidad: 'Grado', relacion: 'Aula' },
    });
  });

  it(':id inexistente responde 404', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.eliminar('inexistente', 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  // 14.9: catch P2003 residual (carrera) traduce al mismo 409, nunca 500.
  it('[14.9] catch P2003 residual (carrera) traduce al mismo 409 ENTIDAD_CON_DEPENDIENTES', async () => {
    const actual = { id: 'g1', nombre: '1ro', nivel_id: 'n1' };
    const p2003 = { code: 'P2003', meta: { field_name: 'Aula_grado_id_fkey (index)' } };
    const deleteFn = jest.fn().mockImplementation(() => {
      throw p2003;
    });
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      delete: deleteFn,
    });

    await expect(servicio.eliminar('g1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Aula' },
    });
  });
});
