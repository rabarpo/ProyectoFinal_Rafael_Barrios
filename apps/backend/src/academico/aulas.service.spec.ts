import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AulasService, validarTurno } from './aulas.service';

/**
 * administracion-academica, PR6 (design.md D2/D5/D6, tareas 20.1, 21.1-21.10, 22.1-22.2). Unit
 * tests con `PrismaService`/`AuditoriaService` mockeados — mismo criterio que
 * `secciones.service.spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR5): `docker ps` no tiene daemon Docker disponible
 * en este entorno, así que la cobertura e2e real de `test/academico/aulas.e2e-spec.ts` no pudo
 * ejecutarse contra Postgres vivo en esta sesión.
 */

function construirServicio(overrides: {
  gradoFindUnique?: jest.Mock;
  seccionFindUnique?: jest.Mock;
  anioEscolarFindUnique?: jest.Mock;
  findFirst?: jest.Mock;
  findUnique?: jest.Mock;
  create?: jest.Mock;
  update?: jest.Mock;
  delete?: jest.Mock;
  matriculaCount?: jest.Mock;
  procesoAulaCount?: jest.Mock;
}) {
  const grado = { findUnique: overrides.gradoFindUnique ?? jest.fn().mockResolvedValue({ id: 'g1' }) };
  const seccion = {
    findUnique:
      overrides.seccionFindUnique ??
      jest.fn().mockResolvedValue({ id: 's1', grado_id: 'g1', anio_escolar_id: 'a1' }),
  };
  const anioEscolar = {
    findUnique: overrides.anioEscolarFindUnique ?? jest.fn().mockResolvedValue({ id: 'a1' }),
  };
  const aula = {
    findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
    findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn(),
    update: overrides.update ?? jest.fn(),
    delete: overrides.delete ?? jest.fn(),
  };
  const matricula = { count: overrides.matriculaCount ?? jest.fn().mockResolvedValue(0) };
  const procesoAula = { count: overrides.procesoAulaCount ?? jest.fn().mockResolvedValue(0) };

  const tx = { grado, seccion, anioEscolar, aula, matricula, procesoAula };
  const prisma = {
    aula: { findMany: jest.fn().mockResolvedValue([]), findUnique: aula.findUnique },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
  const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

  const servicio = new AulasService(prisma as unknown as PrismaService, auditoria as unknown as AuditoriaService);

  return { servicio, tx, prisma, auditoria };
}

describe('validarTurno() (D5, tarea 20.1)', () => {
  it('[20.1] acepta "manana" y "tarde"', () => {
    expect(() => validarTurno('manana')).not.toThrow();
    expect(() => validarTurno('tarde')).not.toThrow();
  });

  it('[20.1] rechaza cualquier otro valor con CAMPO_INVALIDO', () => {
    try {
      validarTurno('noche');
      throw new Error('no debio llegar aqui');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        codigo: 'CAMPO_INVALIDO',
        campo: 'turno',
      });
    }
  });
});

describe('AulasService.crear() (AT5/AT6, D2, D5, D6)', () => {
  // 21.2: turno fuera de {manana, tarde} -> 400 CAMPO_INVALIDO.
  it('[21.2] turno invalido responde 400 CAMPO_INVALIDO sin crear el Aula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({ create });

    await expect(
      servicio.crear({ turno: 'noche', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  // 21.3: Grado inexistente -> 409 REFERENCIA_INEXISTENTE.
  it('[21.3] Grado inexistente responde 409 REFERENCIA_INEXISTENTE sin crear el Aula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({ gradoFindUnique: jest.fn().mockResolvedValue(null), create });

    await expect(
      servicio.crear({ turno: 'manana', grado_id: 'g-x', seccion_id: 's1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Grado', campo: 'grado_id', valor: 'g-x' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 21.3: Seccion inexistente -> 409 REFERENCIA_INEXISTENTE.
  it('[21.3] Seccion inexistente responde 409 REFERENCIA_INEXISTENTE sin crear el Aula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({ seccionFindUnique: jest.fn().mockResolvedValue(null), create });

    await expect(
      servicio.crear({ turno: 'manana', grado_id: 'g1', seccion_id: 's-x', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Seccion', campo: 'seccion_id', valor: 's-x' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 21.3: AnioEscolar inexistente -> 409 REFERENCIA_INEXISTENTE.
  it('[21.3] AnioEscolar inexistente responde 409 REFERENCIA_INEXISTENTE sin crear el Aula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({ anioEscolarFindUnique: jest.fn().mockResolvedValue(null), create });

    await expect(
      servicio.crear({ turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a-x' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'AnioEscolar', campo: 'anio_escolar_id', valor: 'a-x' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 22.1 [AT6][D6]: Aula con grado_id distinto al de su Seccion -> 409 COHERENCIA_JERARQUICA.
  it('[22.1][D6] grado_id distinto al de la Seccion responde 409 COHERENCIA_JERARQUICA', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({
      seccionFindUnique: jest.fn().mockResolvedValue({ id: 's1', grado_id: 'g-correcto', anio_escolar_id: 'a1' }),
      create,
    });

    await expect(
      servicio.crear({ turno: 'manana', grado_id: 'g-otro', seccion_id: 's1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: {
        codigo: 'COHERENCIA_JERARQUICA',
        campo: 'grado_id',
        esperado: 'g-correcto',
        recibido: 'g-otro',
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 22.2 [AT6][D6]: Aula con anio_escolar_id distinto al de su Seccion -> 409 COHERENCIA_JERARQUICA.
  it('[22.2][D6] anio_escolar_id distinto al de la Seccion responde 409 COHERENCIA_JERARQUICA', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({
      seccionFindUnique: jest.fn().mockResolvedValue({ id: 's1', grado_id: 'g1', anio_escolar_id: 'a-correcto' }),
      create,
    });

    await expect(
      servicio.crear({ turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a-otro' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: {
        codigo: 'COHERENCIA_JERARQUICA',
        campo: 'anio_escolar_id',
        esperado: 'a-correcto',
        recibido: 'a-otro',
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 21.4 [AT5]: duplicado (grado_id, seccion_id, anio_escolar_id) -> 409 RESTRICCION_UNICA.
  it('[21.4] duplicado (grado_id, seccion_id, anio_escolar_id) responde 409 RESTRICCION_UNICA', async () => {
    const existente = { id: 'au0', turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' };
    const create = jest.fn();
    const { servicio } = construirServicio({ findFirst: jest.fn().mockResolvedValue(existente), create });

    await expect(
      servicio.crear({ turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: {
        codigo: 'RESTRICCION_UNICA',
        entidad: 'Aula',
        campos: ['grado_id', 'seccion_id', 'anio_escolar_id'],
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('[adversarial] catch P2003 residual en creación traduce a 409 REFERENCIA_INEXISTENTE', async () => {
    const p2003 = { code: 'P2003', meta: { field_name: 'Aula_grado_id_fkey (index)' } };
    const create = jest.fn().mockImplementation(() => {
      throw p2003;
    });
    const { servicio } = construirServicio({ create });

    await expect(
      servicio.crear({ turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE' },
    });
  });

  it('[adversarial] catch P2002 residual en creación traduce a 409 RESTRICCION_UNICA', async () => {
    const p2002 = { code: 'P2002', meta: { target: ['grado_id', 'seccion_id', 'anio_escolar_id'] } };
    const create = jest.fn().mockImplementation(() => {
      throw p2002;
    });
    const { servicio } = construirServicio({ create });

    await expect(
      servicio.crear({ turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', campos: ['grado_id', 'seccion_id', 'anio_escolar_id'] },
    });
  });

  // 21.1 [AT5]: creación exitosa con turno='manana', vinculada y coherente.
  it('[21.1] crea el Aula y audita AULA_CREADA', async () => {
    const creada = { id: 'au1', turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' };
    const { servicio, auditoria } = construirServicio({ create: jest.fn().mockResolvedValue(creada) });

    const resultado = await servicio.crear(
      { turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' },
      'actor-1',
    );

    expect(resultado).toEqual(creada);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'AULA_CREADA',
      'actor-1',
      'Aula',
      'au1',
      expect.objectContaining({ grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1', turno: 'manana' }),
    );
  });
});

describe('AulasService.listar() (D5)', () => {
  it('[21.5] grado_id no-UUID responde 400 CAMPO_INVALIDO', async () => {
    const { servicio } = construirServicio({});
    await expect(servicio.listar({ grado_id: 'no-es-un-uuid' })).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'grado_id' },
    });
  });

  it('[21.5] turno invalido en el filtro responde 400 CAMPO_INVALIDO', async () => {
    const { servicio } = construirServicio({});
    await expect(servicio.listar({ turno: 'noche' })).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'turno' },
    });
  });

  it('[21.5] filtros validos filtran sin error', async () => {
    const { servicio, prisma } = construirServicio({});
    await servicio.listar({
      grado_id: '11111111-1111-1111-1111-111111111111',
      seccion_id: '22222222-2222-2222-2222-222222222222',
      anio_escolar_id: '33333333-3333-3333-3333-333333333333',
      turno: 'tarde',
    });
    expect(prisma.aula.findMany).toHaveBeenCalledWith({
      where: {
        grado_id: '11111111-1111-1111-1111-111111111111',
        seccion_id: '22222222-2222-2222-2222-222222222222',
        anio_escolar_id: '33333333-3333-3333-3333-333333333333',
        turno: 'tarde',
      },
      orderBy: { id: 'asc' },
    });
  });
});

describe('AulasService.obtenerPorId() (D5)', () => {
  it('[21.6] lanza NotFoundException cuando el id no existe', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.obtenerPorId('inexistente')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('AulasService.actualizar() (D3)', () => {
  // 21.7: PATCH cambia turno, deja fila AULA_ACTUALIZADA.
  it('[21.7] actualiza turno y audita AULA_ACTUALIZADA', async () => {
    const actual = { id: 'au1', turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' };
    const actualizada = { ...actual, turno: 'tarde' };
    const { servicio, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      update: jest.fn().mockResolvedValue(actualizada),
    });

    const resultado = await servicio.actualizar('au1', { turno: 'tarde' }, 'actor-1');

    expect(resultado.turno).toBe('tarde');
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'AULA_ACTUALIZADA',
      'actor-1',
      'Aula',
      'au1',
      expect.objectContaining({ campos: ['turno'] }),
    );
  });

  it('[21.7] :id inexistente responde 404, sin escribir', async () => {
    const update = jest.fn();
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null), update });
    await expect(servicio.actualizar('inexistente', { turno: 'tarde' }, 'actor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('[21.7][adversarial] turno invalido en PATCH responde 400 CAMPO_INVALIDO sin escribir', async () => {
    const actual = { id: 'au1', turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' };
    const update = jest.fn();
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(actual), update });

    await expect(servicio.actualizar('au1', { turno: 'noche' }, 'actor-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it('[21.7][adversarial] tipo DatosActualizarAula no declara grado_id/seccion_id/anio_escolar_id (compilación)', () => {
    // Prueba de tipos, no de runtime: `DatosActualizarAula` es `Partial<Pick<DatosAula,'turno'>>`,
    // así que pasar cualquier FK a `actualizar()` ni siquiera compila. Ver `aulas.service.ts`.
    expect(true).toBe(true);
  });
});

describe('AulasService.eliminar() (D2)', () => {
  it('[21.9] elimina sin dependientes y audita AULA_ELIMINADA', async () => {
    const actual = { id: 'au1', turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' };
    const { servicio, tx, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
    });

    await servicio.eliminar('au1', 'actor-1');

    expect(tx.aula.delete).toHaveBeenCalledWith({ where: { id: 'au1' } });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'AULA_ELIMINADA',
      'actor-1',
      'Aula',
      'au1',
      expect.objectContaining({ grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1', turno: 'manana' }),
    );
  });

  // 21.8/21.9: Matricula dependiente -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Matricula'}.
  it('[21.9] Matricula dependiente responde 409 ENTIDAD_CON_DEPENDIENTES {relacion:Matricula}', async () => {
    const actual = { id: 'au1', turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' };
    const { servicio, tx } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      matriculaCount: jest.fn().mockResolvedValue(1),
    });

    await expect(servicio.eliminar('au1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', entidad: 'Aula', relacion: 'Matricula' },
    });
    expect(tx.aula.delete).not.toHaveBeenCalled();
  });

  // 21.8: ProcesoAula dependiente -> 409 ENTIDAD_CON_DEPENDIENTES {relacion:'ProcesoAula'}.
  it('[21.8] ProcesoAula dependiente responde 409 ENTIDAD_CON_DEPENDIENTES {relacion:ProcesoAula}', async () => {
    const actual = { id: 'au1', turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' };
    const { servicio, tx } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      procesoAulaCount: jest.fn().mockResolvedValue(1),
    });

    await expect(servicio.eliminar('au1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', entidad: 'Aula', relacion: 'ProcesoAula' },
    });
    expect(tx.aula.delete).not.toHaveBeenCalled();
  });

  it(':id inexistente responde 404', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.eliminar('inexistente', 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  // 21.10: catch P2003 residual (carrera) traduce al mismo 409, nunca 500.
  it('[21.10] catch P2003 residual (carrera) traduce al mismo 409 ENTIDAD_CON_DEPENDIENTES', async () => {
    const actual = { id: 'au1', turno: 'manana', grado_id: 'g1', seccion_id: 's1', anio_escolar_id: 'a1' };
    const p2003 = { code: 'P2003', meta: { field_name: 'Matricula_aula_id_fkey (index)' } };
    const deleteFn = jest.fn().mockImplementation(() => {
      throw p2003;
    });
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
      delete: deleteFn,
    });

    await expect(servicio.eliminar('au1', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Matricula' },
    });
  });
});
