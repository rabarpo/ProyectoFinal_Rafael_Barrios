import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AuditoriaService } from '../auditoria/auditoria.service';
import type { PrismaService } from '../prisma/prisma.service';
import { MatriculasService } from './matriculas.service';

/**
 * administracion-academica, PR7 (design.md D2/D5/D6/SE1/SE2, tareas 25.1-25.6, 26.1-26.2, 27.1-27.2).
 * Unit tests con `PrismaService`/`AuditoriaService` mockeados — mismo criterio que
 * `aulas.service.spec.ts`.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1-PR6): `docker ps` no tiene daemon Docker disponible
 * en este entorno, así que la cobertura e2e real de `test/academico/matriculas.e2e-spec.ts` no pudo
 * ejecutarse contra Postgres vivo en esta sesión.
 */

function construirServicio(overrides: {
  usuarioFindUnique?: jest.Mock;
  aulaFindUnique?: jest.Mock;
  anioEscolarFindUnique?: jest.Mock;
  findFirst?: jest.Mock;
  findUnique?: jest.Mock;
  create?: jest.Mock;
  delete?: jest.Mock;
}) {
  const usuario = {
    findUnique: overrides.usuarioFindUnique ?? jest.fn().mockResolvedValue({ id: 'u1', rol: 'estudiante' }),
  };
  const aula = {
    findUnique: overrides.aulaFindUnique ?? jest.fn().mockResolvedValue({ id: 'au1', anio_escolar_id: 'a1' }),
  };
  const anioEscolar = {
    findUnique: overrides.anioEscolarFindUnique ?? jest.fn().mockResolvedValue({ id: 'a1' }),
  };
  const matricula = {
    findFirst: overrides.findFirst ?? jest.fn().mockResolvedValue(null),
    findUnique: overrides.findUnique ?? jest.fn().mockResolvedValue(null),
    create: overrides.create ?? jest.fn(),
    delete: overrides.delete ?? jest.fn(),
  };

  const tx = { usuario, aula, anioEscolar, matricula };
  const prisma = {
    matricula: { findMany: jest.fn().mockResolvedValue([]), findUnique: matricula.findUnique },
    $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
  };
  const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

  const servicio = new MatriculasService(prisma as unknown as PrismaService, auditoria as unknown as AuditoriaService);

  return { servicio, tx, prisma, auditoria };
}

describe('MatriculasService.crear() (SE1/SE2, D2, D5, D6)', () => {
  // 25.3: Usuario inexistente -> 409 REFERENCIA_INEXISTENTE.
  it('[25.3] Usuario inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Matricula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({ usuarioFindUnique: jest.fn().mockResolvedValue(null), create });

    await expect(
      servicio.crear({ usuario_id: 'u-x', aula_id: 'au1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Usuario', campo: 'usuario_id', valor: 'u-x' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 25.3: Aula inexistente -> 409 REFERENCIA_INEXISTENTE.
  it('[25.3] Aula inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Matricula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({ aulaFindUnique: jest.fn().mockResolvedValue(null), create });

    await expect(
      servicio.crear({ usuario_id: 'u1', aula_id: 'au-x', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Aula', campo: 'aula_id', valor: 'au-x' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 25.3: AnioEscolar inexistente -> 409 REFERENCIA_INEXISTENTE.
  it('[25.3] AnioEscolar inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Matricula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({ anioEscolarFindUnique: jest.fn().mockResolvedValue(null), create });

    await expect(
      servicio.crear({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a-x' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'AnioEscolar', campo: 'anio_escolar_id', valor: 'a-x' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 25.4 [SE1]: Usuario con rol != estudiante -> 409 USUARIO_NO_ES_ESTUDIANTE.
  it('[25.4] Usuario con rol docente responde 409 USUARIO_NO_ES_ESTUDIANTE sin crear la Matricula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({
      usuarioFindUnique: jest.fn().mockResolvedValue({ id: 'u1', rol: 'docente' }),
      create,
    });

    await expect(
      servicio.crear({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'USUARIO_NO_ES_ESTUDIANTE', rol_actual: 'docente' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 25.5 [SE2][D6]: Matricula con anio_escolar_id distinto al de su Aula -> 409 COHERENCIA_JERARQUICA.
  it('[25.5][D6] anio_escolar_id distinto al del Aula responde 409 COHERENCIA_JERARQUICA', async () => {
    const create = jest.fn();
    const { servicio } = construirServicio({
      aulaFindUnique: jest.fn().mockResolvedValue({ id: 'au1', anio_escolar_id: 'a-correcto' }),
      create,
    });

    await expect(
      servicio.crear({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a-otro' }, 'actor-1'),
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

  // 25.2 [SE1]: duplicado (usuario_id, aula_id, anio_escolar_id) -> 409 RESTRICCION_UNICA.
  it('[25.2] duplicado (usuario_id, aula_id, anio_escolar_id) responde 409 RESTRICCION_UNICA', async () => {
    const existente = { id: 'm0', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' };
    const create = jest.fn();
    const { servicio } = construirServicio({ findFirst: jest.fn().mockResolvedValue(existente), create });

    await expect(
      servicio.crear({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: {
        codigo: 'RESTRICCION_UNICA',
        entidad: 'Matricula',
        campos: ['usuario_id', 'aula_id', 'anio_escolar_id'],
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('[adversarial] catch P2003 residual en creación traduce a 409 REFERENCIA_INEXISTENTE', async () => {
    const p2003 = { code: 'P2003', meta: { field_name: 'Matricula_usuario_id_fkey (index)' } };
    const create = jest.fn().mockImplementation(() => {
      throw p2003;
    });
    const { servicio } = construirServicio({ create });

    await expect(
      servicio.crear({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE' },
    });
  });

  it('[adversarial] catch P2002 residual en creación traduce a 409 RESTRICCION_UNICA', async () => {
    const p2002 = { code: 'P2002', meta: { target: ['usuario_id', 'aula_id', 'anio_escolar_id'] } };
    const create = jest.fn().mockImplementation(() => {
      throw p2002;
    });
    const { servicio } = construirServicio({ create });

    await expect(
      servicio.crear({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' }, 'actor-1'),
    ).rejects.toMatchObject({
      response: { codigo: 'RESTRICCION_UNICA', campos: ['usuario_id', 'aula_id', 'anio_escolar_id'] },
    });
  });

  // 25.1 [SE1]: creación exitosa vinculando Usuario/Aula/AnioEscolar existentes y coherentes.
  it('[25.1] crea la Matricula y audita MATRICULA_CREADA', async () => {
    const creada = { id: 'm1', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' };
    const { servicio, auditoria } = construirServicio({ create: jest.fn().mockResolvedValue(creada) });

    const resultado = await servicio.crear({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' }, 'actor-1');

    expect(resultado).toEqual(creada);
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'MATRICULA_CREADA',
      'actor-1',
      'Matricula',
      'm1',
      expect.objectContaining({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' }),
    );
  });
});

describe('MatriculasService.listar() (D5, tarea 26.2)', () => {
  it('[26.2] usuario_id no-UUID responde 400 CAMPO_INVALIDO', async () => {
    const { servicio } = construirServicio({});
    await expect(servicio.listar({ usuario_id: 'no-es-un-uuid' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('[26.2] aula_id no-UUID responde 400 CAMPO_INVALIDO', async () => {
    const { servicio } = construirServicio({});
    await expect(servicio.listar({ aula_id: 'no-es-un-uuid' })).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'aula_id' },
    });
  });

  it('[26.2] anio_escolar_id no-UUID responde 400 CAMPO_INVALIDO', async () => {
    const { servicio } = construirServicio({});
    await expect(servicio.listar({ anio_escolar_id: 'no-es-un-uuid' })).rejects.toMatchObject({
      response: { codigo: 'CAMPO_INVALIDO', campo: 'anio_escolar_id' },
    });
  });

  it('[26.2] filtros validos filtran sin error', async () => {
    const { servicio, prisma } = construirServicio({});
    await servicio.listar({
      usuario_id: '11111111-1111-1111-1111-111111111111',
      aula_id: '22222222-2222-2222-2222-222222222222',
      anio_escolar_id: '33333333-3333-3333-3333-333333333333',
    });
    expect(prisma.matricula.findMany).toHaveBeenCalledWith({
      where: {
        usuario_id: '11111111-1111-1111-1111-111111111111',
        aula_id: '22222222-2222-2222-2222-222222222222',
        anio_escolar_id: '33333333-3333-3333-3333-333333333333',
      },
      orderBy: { id: 'asc' },
    });
  });
});

describe('MatriculasService.obtenerPorId() (SE3, tarea 26.1)', () => {
  it('[26.1] lanza NotFoundException cuando el id no existe', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.obtenerPorId('inexistente')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('[26.1] devuelve la Matricula cuando existe', async () => {
    const matricula = { id: 'm1', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' };
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(matricula) });
    await expect(servicio.obtenerPorId('m1')).resolves.toEqual(matricula);
  });
});

describe('MatriculasService.crearIdempotente() (importacion-excel, student-enrollment delta, tareas 1.1-1.2)', () => {
  function construirServicioIdempotente(overrides: {
    usuarioFindUnique?: jest.Mock;
    anioEscolarFindUnique?: jest.Mock;
    aulaFindFirst?: jest.Mock;
    matriculaFindFirst?: jest.Mock;
    matriculaCreate?: jest.Mock;
  }) {
    const usuario = {
      findUnique: overrides.usuarioFindUnique ?? jest.fn().mockResolvedValue({ id: 'u1', rol: 'estudiante' }),
    };
    const anioEscolar = {
      findUnique: overrides.anioEscolarFindUnique ?? jest.fn().mockResolvedValue({ id: 'a1' }),
    };
    const aula = {
      findFirst: overrides.aulaFindFirst ?? jest.fn().mockResolvedValue({ id: 'au1', anio_escolar_id: 'a1' }),
    };
    const matricula = {
      findFirst: overrides.matriculaFindFirst ?? jest.fn().mockResolvedValue(null),
      create: overrides.matriculaCreate ?? jest.fn().mockResolvedValue({ id: 'm1', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' }),
    };

    const tx = { usuario, anioEscolar, aula, matricula };
    const prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    };
    const auditoria = { log: jest.fn().mockResolvedValue(undefined) };

    const servicio = new MatriculasService(prisma as unknown as PrismaService, auditoria as unknown as AuditoriaService);

    return { servicio, tx, prisma, auditoria };
  }

  const datosBase = {
    usuario_id: 'u1',
    grado_nombre: '1°',
    seccion_nombre: 'A',
    turno: 'manana' as const,
    anio_escolar_codigo: '2026',
  };

  // 1.1: Usuario inexistente -> 409 REFERENCIA_INEXISTENTE (misma validación que crear()).
  it('Usuario inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Matricula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicioIdempotente({
      usuarioFindUnique: jest.fn().mockResolvedValue(null),
      matriculaCreate: create,
    });

    await expect(servicio.crearIdempotente(datosBase, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Usuario', campo: 'usuario_id', valor: 'u1' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 1.1: anio_escolar_codigo que no resuelve a ningún AnioEscolar -> 409 REFERENCIA_INEXISTENTE.
  it('anio_escolar_codigo inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Matricula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicioIdempotente({
      anioEscolarFindUnique: jest.fn().mockResolvedValue(null),
      matriculaCreate: create,
    });

    await expect(servicio.crearIdempotente(datosBase, 'actor-1')).rejects.toMatchObject({
      response: {
        codigo: 'REFERENCIA_INEXISTENTE',
        entidad: 'AnioEscolar',
        campo: 'anio_escolar_codigo',
        valor: '2026',
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 1.1: clave compuesta (grado_nombre, seccion_nombre, turno) que no resuelve a ningún Aula -> 409 REFERENCIA_INEXISTENTE.
  it('clave compuesta de Aula inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la Matricula', async () => {
    const create = jest.fn();
    const { servicio } = construirServicioIdempotente({
      aulaFindFirst: jest.fn().mockResolvedValue(null),
      matriculaCreate: create,
    });

    await expect(servicio.crearIdempotente(datosBase, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'REFERENCIA_INEXISTENTE', entidad: 'Aula', campo: 'aula' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 1.1 [reutiliza SE1]: Usuario con rol != estudiante -> 409 USUARIO_NO_ES_ESTUDIANTE.
  it('Usuario con rol docente responde 409 USUARIO_NO_ES_ESTUDIANTE sin crear la Matricula (reutiliza SE1)', async () => {
    const create = jest.fn();
    const { servicio } = construirServicioIdempotente({
      usuarioFindUnique: jest.fn().mockResolvedValue({ id: 'u1', rol: 'docente' }),
      matriculaCreate: create,
    });

    await expect(servicio.crearIdempotente(datosBase, 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'USUARIO_NO_ES_ESTUDIANTE', rol_actual: 'docente' },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 1.1 [reutiliza SE2/D6]: Aula resuelta con anio_escolar_id distinto al resuelto desde anio_escolar_codigo -> 409 COHERENCIA_JERARQUICA.
  it('Aula con anio_escolar_id distinto al resuelto desde anio_escolar_codigo responde 409 COHERENCIA_JERARQUICA (reutiliza SE2/D6)', async () => {
    const create = jest.fn();
    const { servicio } = construirServicioIdempotente({
      aulaFindFirst: jest.fn().mockResolvedValue({ id: 'au1', anio_escolar_id: 'a-otro' }),
      matriculaCreate: create,
    });

    await expect(servicio.crearIdempotente(datosBase, 'actor-1')).rejects.toMatchObject({
      response: {
        codigo: 'COHERENCIA_JERARQUICA',
        campo: 'anio_escolar_id',
        esperado: 'a-otro',
        recibido: 'a1',
      },
    });
    expect(create).not.toHaveBeenCalled();
  });

  // 1.1: duplicado (usuario_id, aula_id, anio_escolar_id) -> creado:false, sin crear una segunda fila.
  it('combinación (usuario_id, aula_id, anio_escolar_id) ya existente devuelve creado:false sin duplicar', async () => {
    const existente = { id: 'm0', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' };
    const create = jest.fn();
    const { servicio, auditoria } = construirServicioIdempotente({
      matriculaFindFirst: jest.fn().mockResolvedValue(existente),
      matriculaCreate: create,
    });

    const resultado = await servicio.crearIdempotente(datosBase, 'actor-1');

    expect(resultado).toEqual({ matricula: existente, creado: false });
    expect(create).not.toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  // 1.2: combinación nueva -> crea la Matricula, audita MATRICULA_CREADA y devuelve creado:true.
  it('combinación nueva crea la Matricula, audita MATRICULA_CREADA y devuelve creado:true', async () => {
    const { servicio, auditoria } = construirServicioIdempotente({});

    const resultado = await servicio.crearIdempotente(datosBase, 'actor-1');

    expect(resultado).toEqual({
      matricula: { id: 'm1', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' },
      creado: true,
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'MATRICULA_CREADA',
      'actor-1',
      'Matricula',
      'm1',
      expect.objectContaining({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' }),
    );
  });

  // 1.2 [D1]: acepta un tx externo y no abre su propia transacción cuando se le pasa uno.
  it('con tx externo no abre su propia $transaction', async () => {
    const { servicio, tx, prisma } = construirServicioIdempotente({});

    await servicio.crearIdempotente(datosBase, 'actor-1', tx as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('MatriculasService.eliminar() (SE4, tarea 27.1-27.2)', () => {
  it('[27.1] elimina la fila y audita MATRICULA_ELIMINADA', async () => {
    const actual = { id: 'm1', usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' };
    const { servicio, tx, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(actual),
    });

    await servicio.eliminar('m1', 'actor-1');

    expect(tx.matricula.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'MATRICULA_ELIMINADA',
      'actor-1',
      'Matricula',
      'm1',
      expect.objectContaining({ usuario_id: 'u1', aula_id: 'au1', anio_escolar_id: 'a1' }),
    );
  });

  it(':id inexistente responde 404, sin escribir', async () => {
    const deleteFn = jest.fn();
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null), delete: deleteFn });
    await expect(servicio.eliminar('inexistente', 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteFn).not.toHaveBeenCalled();
  });
});
