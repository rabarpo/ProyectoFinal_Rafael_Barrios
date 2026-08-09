import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AniosEscolaresService } from './anios-escolares.service';

/**
 * administracion-academica, PR2 (design.md D2/D5, tareas 7.1-7.7, 8.1-8.6). Unit tests con
 * `PrismaService`/`AuditoriaService` mockeados — cubre la orquestación de `crear()`/`actualizar()`/
 * `eliminar()` (unicidad, guarda de 4 dependientes, catch P2003 residual) sin Postgres real, mismo
 * criterio que `users.service.spec.ts` de `administracion-usuarios-apoderados`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1, tarea 6.4): `docker ps` no tiene daemon disponible
 * en este entorno, así que la cobertura e2e/integración real de `test/academico/
 * anios-escolares.e2e-spec.ts` no pudo ejecutarse contra Postgres vivo en esta sesión. La suite
 * queda escrita y type-checkeada, lista para CI/entorno con `docker-compose.test.yml`. Esta suite
 * unit cubre la lógica de negocio equivalente con mocks.
 */

function construirServicio(overrides: {
  findFirst?: jest.Mock;
  findUnique?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
  seccionCount?: jest.Mock;
  aulaCount?: jest.Mock;
  matriculaCount?: jest.Mock;
  configuracionCount?: jest.Mock;
}) {
  const anioEscolar = {
    findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
    findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn(),
    update: overrides.update ?? jest.fn(),
    delete: overrides.delete ?? jest.fn(),
  };
  const seccion = { count: overrides.seccionCount ?? jest.fn().mockResolvedValue(0) };
  const aula = { count: overrides.aulaCount ?? jest.fn().mockResolvedValue(0) };
  const matricula = { count: overrides.matriculaCount ?? jest.fn().mockResolvedValue(0) };
  const configuracion = { count: overrides.configuracionCount ?? jest.fn().mockResolvedValue(0) };

  const tx = { anioEscolar, seccion, aula, matricula, configuracion };
  const prisma = {
    anioEscolar: { findMany: jest.fn().mockResolvedValue([]), findUnique: anioEscolar.findUnique },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
  const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

  const servicio = new AniosEscolaresService(
    prisma as unknown as PrismaService,
    auditoria as unknown as AuditoriaService,
  );

  return { servicio, tx, prisma, auditoria };
}

describe('AniosEscolaresService.crear() (SY1, D5)', () => {
  // 7.1: creación exitosa -> 201, activo=false, 1 fila ANIO_ESCOLAR_CREADO.
  it('[7.1] crea con activo=false y audita ANIO_ESCOLAR_CREADO', async () => {
    const creado = { id: 'a1', nombre: 'Año 2026', activo: false };
    const { servicio, auditoria } = construirServicio({
      create: jest.fn().mockResolvedValue(creado),
    });

    const resultado = await servicio.crear({ nombre: 'Año 2026' }, 'actor-1');

    expect(resultado).toEqual({ id: 'a1', nombre: 'Año 2026', activo: false });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'ANIO_ESCOLAR_CREADO',
      'actor-1',
      'AnioEscolar',
      'a1',
      expect.objectContaining({ nombre: 'Año 2026' }),
    );
  });

  // 7.2: nombre duplicado -> 409 RESTRICCION_UNICA, sin crear fila.
  it('[7.2] nombre duplicado (precheck) responde 409 RESTRICCION_UNICA sin crear fila', async () => {
    const existente = { id: 'a0', nombre: 'Año 2026', activo: false };
    const create = jest.fn();
    const { servicio } = construirServicio({
      findFirst: jest.fn().mockResolvedValue(existente),
      create,
    });

    await expect(servicio.crear({ nombre: 'Año 2026' }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', campos: ['nombre'] },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 8.5-equivalente para crear: catch P2002 residual (carrera precheck<->create) nunca escapa 500.
  it('[adversarial] catch P2002 residual (carrera) traduce a 409 RESTRICCION_UNICA', async () => {
    const p2002 = { code: 'P2002', meta: { target: ['nombre'] } };
    const create = jest.fn().mockImplementation(() => {
      throw p2002;
    });
    const { servicio } = construirServicio({ create });

    await expect(servicio.crear({ nombre: 'Año 2026' }, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', campos: ['nombre'] },
    });
  });
});

describe('AniosEscolaresService.obtenerPorId() (D5)', () => {
  // 7.4: GET :id devuelve el AnioEscolar; inexistente -> 404.
  it('[7.4] lanza NotFoundException cuando el id no existe', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.obtenerPorId('inexistente')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('[7.4] devuelve el AnioEscolar mapeado cuando existe', async () => {
    const fila = { id: 'a1', nombre: 'Año 2026', activo: true };
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(fila) });
    await expect(servicio.obtenerPorId('a1')).resolves.toEqual(fila);
  });
});

describe('AniosEscolaresService.listar() (D5)', () => {
  // 7.5: filtro activo= filtra correctamente; valor desconocido -> 400 CAMPO_INVALIDO.
  it('[7.5] activo=maybe (valor desconocido) responde 400 CAMPO_INVALIDO', async () => {
    const { servicio } = construirServicio({});
    await expect(servicio.listar({ activo: 'maybe' })).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'activo' },
    });
  });
});

describe('AniosEscolaresService.actualizar() (SY4)', () => {
  // 7.6: PATCH cambia nombre, deja 1 fila ANIO_ESCOLAR_ACTUALIZADO.
  it('[7.6] actualiza nombre y audita ANIO_ESCOLAR_ACTUALIZADO', async () => {
    const actual = { id: 'a1', nombre: 'Viejo', activo: false };
    const actualizado = { id: 'a1', nombre: 'Nuevo', activo: false };
    const { servicio, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      update: jest.fn().mockResolvedValue(actualizado),
    });

    const resultado = await servicio.actualizar('a1', { nombre: 'Nuevo' }, 'actor-1');

    expect(resultado.nombre).toBe('Nuevo');
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'ANIO_ESCOLAR_ACTUALIZADO',
      'actor-1',
      'AnioEscolar',
      'a1',
      expect.objectContaining({ campos: ['nombre'] }),
    );
  });

  it('[7.6] :id inexistente responde 404, sin escribir', async () => {
    const update = jest.fn();
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null), update });
    await expect(servicio.actualizar('inexistente', { nombre: 'X' }, 'actor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });
});

describe('AniosEscolaresService.eliminar() (SY3, D2)', () => {
  // 8.1/8.2: precomprobación cuenta los 4 dependientes; sin dependientes borra y audita.
  it('[8.2] elimina sin dependientes y audita exactamente ANIO_ESCOLAR_ELIMINADO', async () => {
    const actual = { id: 'a1', nombre: 'Año 2026', activo: false };
    const { servicio, tx, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
    });

    await servicio.eliminar('a1', 'actor-1');

    expect(tx.anioEscolar.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'ANIO_ESCOLAR_ELIMINADO',
      'actor-1',
      'AnioEscolar',
      'a1',
      expect.objectContaining({ nombre: 'Año 2026' }),
    );
  });

  // 8.3: Seccion asociada -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Seccion'}, no borra.
  it('[8.3] Seccion dependiente responde 409 ENTIDAD_CON_DEPENDIENTES sin borrar la fila', async () => {
    const actual = { id: 'a1', nombre: 'Año 2026', activo: false };
    const { servicio, tx } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      seccionCount: jest.fn().mockResolvedValue(1),
    });

    await expect(servicio.eliminar('a1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Seccion' },
    });
    expect(tx.anioEscolar.delete).not.toHaveBeenCalled();
  });

  // 8.4: Configuracion asociada -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Configuracion'}.
  it('[8.4] Configuracion dependiente responde 409 ENTIDAD_CON_DEPENDIENTES {relacion:Configuracion}', async () => {
    const actual = { id: 'a1', nombre: 'Año 2026', activo: false };
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      configuracionCount: jest.fn().mockResolvedValue(1),
    });

    await expect(servicio.eliminar('a1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Configuracion' },
    });
  });

  it(':id inexistente responde 404', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.eliminar('inexistente', 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  // 8.5: catch P2003 residual (carrera SELECT COUNT <-> DELETE) traduce al mismo 409, nunca 500.
  it('[8.5] catch P2003 residual (carrera) traduce al mismo 409 ENTIDAD_CON_DEPENDIENTES', async () => {
    const actual = { id: 'a1', nombre: 'Año 2026', activo: false };
    const p2003 = { code: 'P2003', meta: { field_name: 'Seccion_anio_escolar_id_fkey (index)' } };
    const deleteFn = jest.fn().mockImplementation(() => {
      throw p2003;
    });
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      delete: deleteFn,
    });

    await expect(servicio.eliminar('a1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Seccion' },
    });
  });
});
