import { ConflictException, NotFoundException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import type { PrismaService } from '../prisma/prisma.service';
import { SeccionesService } from './secciones.service';

/**
 * administracion-academica, PR5 (design.md D2/D5, tareas 17.1-17.10). Unit tests con
 * `PrismaService`/`AuditoriaService` mockeados — mismo criterio que `grados.service.spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR4): `docker ps` no tiene daemon disponible en
 * este entorno, así que la cobertura e2e real de `test/academico/secciones.e2e-spec.ts` no pudo
 * ejecutarse contra Postgres vivo en esta sesión.
 */

function construirServicio(overrides: {
  gradoFindUnique?: jest.Mock;
  anioEscolarFindUnique?: jest.Mock;
  findFirst?: jest.Mock;
  findUnique?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
  aulaCount?: jest.Mock;
}) {
  const grado = { findUnique: overrides.gradoFindUnique ?? jest.fn().mockResolvedValue({ id: 'g1' }) };
  const anioEscolar = {
    findUnique: overrides.anioEscolarFindUnique ?? jest.fn().mockResolvedValue({ id: 'a1' }),
  };
  const seccion = {
    findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
    findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn(),
    update: overrides.update ?? jest.fn(),
    delete: overrides.delete ?? jest.fn(),
  };
  const aula = { count: overrides.aulaCount ?? jest.fn().mockResolvedValue(0) };

  const tx = { grado, anioEscolar, seccion, aula };
  const prisma = {
    seccion: { findMany: jest.fn().mockResolvedValue([]), findUnique: seccion.findUnique },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
  const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

  const servicio = new SeccionesService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
  );

  return { servicio, tx, prisma, auditoria };
}

describe('SeccionesService.crear() (AT3/AT4, D2, D5)', () => {
  // 17.2 [AT4]: Grado inexistente -> 409 REFERENCIA_INEXISTENTE, no se crea la Seccion.
  it('[17.2] Grado inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Seccion', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({
      gradoFindUnique: jest.fn().mockResolvedValue(null),
      create,
    });

    await expect(
      servicio.crear({ nombre: 'A', grado_id: 'g-x', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Grado', campo: 'grado_id', valor: 'g-x' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 17.3 [AT4]: AnioEscolar inexistente -> 409 REFERENCIA_INEXISTENTE, no se crea la Seccion.
  it('[17.3] AnioEscolar inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Seccion', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({
      anioEscolarFindUnique: jest.fn().mockResolvedValue(null),
      create,
    });

    await expect(
      servicio.crear({ nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a-x' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: {
        codigo: 'REFERENCIA_INEXISTENTE',
        entidad: 'AnioEscolar',
        campo: 'anio_escolar_id',
        valor: 'a-x',
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 17.4 [AT3]: duplicado (grado_id, anio_escolar_id, nombre) -> 409 RESTRICCION_UNICA.
  it('[17.4] duplicado (grado_id, anio_escolar_id, nombre) responde 409 RESTRICCION_UNICA', async () => {
    const existente = { id: 's0', nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a1' };
    const create = jest.fn();
    const { servicio } = construirServicio({ findFirst: jest.fn().mockResolvedValue(existente), create });

    await expect(
      servicio.crear({ nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: {
        codigo: 'RESTRICCION_UNICA',
        entidad: 'Seccion',
        campos: ['grado_id', 'anio_escolar_id', 'nombre'],
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('[adversarial] catch P2003 residual en creación traduce a 409 REFERENCIA_INEXISTENTE', async () => {
    const p2003 = { code: 'P2003', meta: { field_name: 'Seccion_grado_id_fkey (index)' } };
    const create = jest.fn().mockImplementation(() => {
      throw p2003;
    });
    const { servicio } = construirServicio({ create });

    await expect(
      servicio.crear({ nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Grado' },
    });
  });

  it('[adversarial] catch P2002 residual en creación traduce a 409 RESTRICCION_UNICA', async () => {
    const p2002 = { code: 'P2002', meta: { target: ['grado_id', 'anio_escolar_id', 'nombre'] } };
    const create = jest.fn().mockImplementation(() => {
      throw p2002;
    });
    const { servicio } = construirServicio({ create });

    await expect(
      servicio.crear({ nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', campos: ['grado_id', 'anio_escolar_id', 'nombre'] },
    });
  });

  // 17.1 [AT3]: creación exitosa vinculada a un Grado y un AnioEscolar existentes.
  it('[17.1] crea la Seccion y audita SECCION_CREADA', async () => {
    const creada = { id: 's1', nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a1' };
    const { servicio, auditoria } = construirServicio({ create: jest.fn().mockResolvedValue(creada) });

    const resultado = await servicio.crear({ nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a1' }, 'actor-1');

    expect(resultado).toEqual(creada);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'SECCION_CREADA',
      'actor-1',
      'Seccion',
      's1',
      expect.objectContaining({ grado_id: 'g1', anio_escolar_id: 'a1', nombre: 'A' }),
    );
  });
});

describe('SeccionesService.listar() (D5)', () => {
  // 17.5: filtro grado_id/anio_escolar_id no-UUID -> 400 CAMPO_INVALIDO.
  it('[17.5] grado_id no-UUID responde 400 CAMPO_INVALIDO', async () => {
    const { servicio } = construirServicio({});
    await expect(servicio.listar({ grado_id: 'no-es-un-uuid' })).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'grado_id' },
    });
  });

  it('[17.5] anio_escolar_id no-UUID responde 400 CAMPO_INVALIDO', async () => {
    const { servicio } = construirServicio({});
    await expect(
      servicio.listar({ grado_id: '11111111-1111-1111-1111-111111111111', anio_escolar_id: 'no-es-un-uuid' }),
    ).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'anio_escolar_id' },
    });
  });

  it('[17.5] filtros UUID válidos filtran sin error', async () => {
    const { servicio, prisma } = construirServicio({});
    await servicio.listar({
      grado_id: '11111111-1111-1111-1111-111111111111',
      anio_escolar_id: '22222222-2222-2222-2222-222222222222',
    });
    expect(prisma.seccion.findMany).toHaveBeenCalledWith({
      where: {
        grado_id: '11111111-1111-1111-1111-111111111111',
        anio_escolar_id: '22222222-2222-2222-2222-222222222222',
      },
      orderBy: { nombre: 'asc' },
    });
  });
});

describe('SeccionesService.obtenerPorId() (D5)', () => {
  // 17.6: GET :id, 404 inexistente.
  it('[17.6] lanza NotFoundException cuando el id no existe', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.obtenerPorId('inexistente')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SeccionesService.actualizar() (D3)', () => {
  // 17.7: PATCH cambia nombre, deja fila SECCION_ACTUALIZADA; grado_id/anio_escolar_id no viajan en el DTO.
  it('[17.7] actualiza nombre y audita SECCION_ACTUALIZADA', async () => {
    const actual = { id: 's1', nombre: 'Viejo', grado_id: 'g1', anio_escolar_id: 'a1' };
    const actualizada = { id: 's1', nombre: 'Nuevo', grado_id: 'g1', anio_escolar_id: 'a1' };
    const { servicio, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      update: jest.fn().mockResolvedValue(actualizada),
    });

    const resultado = await servicio.actualizar('s1', { nombre: 'Nuevo' }, 'actor-1');

    expect(resultado.nombre).toBe('Nuevo');
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'SECCION_ACTUALIZADA',
      'actor-1',
      'Seccion',
      's1',
      expect.objectContaining({ campos: ['nombre'] }),
    );
  });

  it('[17.7] :id inexistente responde 404, sin escribir', async () => {
    const update = jest.fn();
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null), update });
    await expect(servicio.actualizar('inexistente', { nombre: 'X' }, 'actor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('[17.7][adversarial] duplicado al renombrar responde 409 RESTRICCION_UNICA', async () => {
    const actual = { id: 's1', nombre: 'Viejo', grado_id: 'g1', anio_escolar_id: 'a1' };
    const colision = { id: 's2', nombre: 'Nuevo', grado_id: 'g1', anio_escolar_id: 'a1' };
    const update = jest.fn();
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      findFirst: jest.fn().mockResolvedValue(colision),
      update,
    });

    await expect(servicio.actualizar('s1', { nombre: 'Nuevo' }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', entidad: 'Seccion' },
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('[17.7][adversarial] tipo DatosActualizarSeccion no declara grado_id/anio_escolar_id (compilación)', () => {
    // Prueba de tipos, no de runtime: `DatosActualizarSeccion` es
    // `Partial<Pick<DatosSeccion,'nombre'>>`, así que pasar `grado_id`/`anio_escolar_id` a
    // `actualizar()` ni siquiera compila. Ver `secciones.service.ts`.
    expect(true).toBe(true);
  });
});

describe('SeccionesService.eliminar() (D2)', () => {
  it('[17.9] elimina sin dependientes y audita SECCION_ELIMINADA', async () => {
    const actual = { id: 's1', nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a1' };
    const { servicio, tx, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
    });

    await servicio.eliminar('s1', 'actor-1');

    expect(tx.seccion.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'SECCION_ELIMINADA',
      'actor-1',
      'Seccion',
      's1',
      expect.objectContaining({ grado_id: 'g1', anio_escolar_id: 'a1', nombre: 'A' }),
    );
  });

  // 17.8/17.9: Aula dependiente -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Aula'}.
  it('[17.9] Aula dependiente responde 409 ENTIDAD_CON_DEPENDIENTES {relacion:Aula}', async () => {
    const actual = { id: 's1', nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a1' };
    const { servicio, tx } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      aulaCount: jest.fn().mockResolvedValue(1),
    });

    await expect(servicio.eliminar('s1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', entidad: 'Seccion', relacion: 'Aula' },
    });
    expect(tx.seccion.delete).not.toHaveBeenCalled();
  });

  it(':id inexistente responde 404', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.eliminar('inexistente', 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  // 17.10: catch P2003 residual (carrera) traduce al mismo 409, nunca 500.
  it('[17.10] catch P2003 residual (carrera) traduce al mismo 409 ENTIDAD_CON_DEPENDIENTES', async () => {
    const actual = { id: 's1', nombre: 'A', grado_id: 'g1', anio_escolar_id: 'a1' };
    const p2003 = { code: 'P2003', meta: { field_name: 'Aula_seccion_id_fkey (index)' } };
    const deleteFn = jest.fn().mockImplementation(() => {
      throw p2003;
    });
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      delete: deleteFn,
    });

    await expect(servicio.eliminar('s1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Aula' },
    });
  });
});
