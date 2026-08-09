import { BadRequestException, ConflictException } from '@nestjs/common';
import type { AcademicoErrorCode } from '../academico/academico.errors';
import type { MatriculasService } from '../academico/matriculas.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UsersErrorCode } from '../users/users.errors';
import type { UsersService } from '../users/users.service';
import { CABECERA_PADRON } from './padron-csv';
import { ImportacionService } from './importacion.service';

/**
 * importacion-excel, PR2 (design.md "Data Flow"/D2/D7, tarea 2.4, spec `importacion-excel`).
 * `UsersService`/`MatriculasService`/`PrismaService` mockeados — la orquestación fila a fila se
 * prueba aquí; la persistencia real de cada uno ya está cubierta por sus propios unit tests
 * (`users.service.spec.ts`, `matriculas.service.spec.ts`). `exceljs` corre real sobre buffers
 * `.csv` construidos a mano — cubre el parseo real, sin mockear la librería.
 *
 * "Tx compartida + excepción puntual" (corrección PR2, spec "Idempotencia por fila reutilizando
 * los servicios existentes"): `prisma.$transaction` se mockea devolviendo un `tx` sentinela fijo
 * (`'tx-fake'`) que se propaga al `callback`; las aserciones de atomicidad comprueban que
 * `UsersService.crearIdempotente()` y `MatriculasService.crearIdempotente()` reciben ESE MISMO
 * tercer argumento (`tx`) en el camino normal — evidencia de que un fallo de Matricula, en una
 * transacción Prisma real, revertiría también al Usuario. La excepción puntual (Aula/AnioEscolar
 * inexistente) invoca `UsersService.crearIdempotente()` con solo dos argumentos (sin `tx`) y nunca
 * llama a `prisma.$transaction`.
 */

function construirServicio(overrides: {
  usersCrearIdempotente?: jest.Mock;
  matriculasCrearIdempotente?: jest.Mock;
  resolverReferenciasAula?: jest.Mock;
}) {
  const usersService = {
    crearIdempotente:
      overrides.usersCrearIdempotente ??
      jest.fn().mockResolvedValue({ usuario: { id: 'u1' }, creado: true }),
  };
  const matriculasService = {
    crearIdempotente:
      overrides.matriculasCrearIdempotente ??
      jest.fn().mockResolvedValue({ matricula: { id: 'm1' }, creado: true }),
    resolverReferenciasAula: overrides.resolverReferenciasAula ?? jest.fn().mockResolvedValue({ ok: true }),
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback('tx-fake')),
  };

  const servicio = new ImportacionService(
    usersService as unknown as UsersService,
    matriculasService as unknown as MatriculasService,
    prisma as unknown as PrismaService,
  );

  return { servicio, usersService, matriculasService, prisma };
}

function construirCsv(filas: string[][]): { buffer: Buffer; originalname: string; mimetype: string } {
  const contenido = filas.map((fila) => fila.join(',')).join('\n');
  return { buffer: Buffer.from(contenido, 'utf-8'), originalname: 'padron.csv', mimetype: 'text/csv' };
}

const CABECERA = [...CABECERA_PADRON];
const FILA_VALIDA_1 = ['Ana Pérez', '12345678', 'COD-1', 'ana@example.com', '1°', 'A', 'manana', '2026'];
const FILA_VALIDA_2 = ['Luis Gómez', '87654321', 'COD-2', 'luis@example.com', '1°', 'A', 'manana', '2026'];

describe('ImportacionService.importar() (spec "importacion-excel")', () => {
  it('cabecera inválida rechaza con 400 y no invoca ningún servicio de dominio', async () => {
    const { servicio, usersService } = construirServicio({});
    const archivo = construirCsv([['nombre', 'dni'], FILA_VALIDA_1]);

    await expect(servicio.importar(archivo, 'actor-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(usersService.crearIdempotente).not.toHaveBeenCalled();
  });

  it('archivo con más de 2000 filas de datos rechaza con 400 y no invoca ningún servicio de dominio', async () => {
    const { servicio, usersService } = construirServicio({});
    const filasDeMas = Array.from({ length: 2001 }, () => FILA_VALIDA_1);
    const archivo = construirCsv([CABECERA, ...filasDeMas]);

    await expect(servicio.importar(archivo, 'actor-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(usersService.crearIdempotente).not.toHaveBeenCalled();
  });

  it('fila vacía entre filas válidas se reporta con motivo fila_vacia sin abortar el archivo', async () => {
    const { servicio } = construirServicio({});
    const filaVacia = ['', '', '', '', '', '', '', ''];
    const archivo = construirCsv([CABECERA, FILA_VALIDA_1, filaVacia, FILA_VALIDA_2]);

    const resultado = await servicio.importar(archivo, 'actor-1');

    expect(resultado.filas_totales).toBe(3);
    expect(resultado.filas_invalidas).toBe(1);
    expect(resultado.errores).toEqual([{ fila: 2, campo: '', motivo: 'fila_vacia', valor_recibido: '' }]);
    expect(resultado.filas_creadas).toBe(2);
  });

  it('correo con formato inválido reporta campo=correo, motivo=formato y no cuenta como creada', async () => {
    const usersCrearIdempotente = jest.fn().mockRejectedValue(
      new BadRequestException({ codigo: 'CAMPO_INVALIDO' as UsersErrorCode, campo: 'correo', motivo: 'formato' }),
    );
    const { servicio, matriculasService } = construirServicio({ usersCrearIdempotente });
    const filaCorreoInvalido = ['Ana Pérez', '12345678', 'COD-1', 'no-es-un-correo', '1°', 'A', 'manana', '2026'];
    const archivo = construirCsv([CABECERA, filaCorreoInvalido]);

    const resultado = await servicio.importar(archivo, 'actor-1');

    expect(resultado.errores).toEqual([
      { fila: 1, campo: 'correo', motivo: 'formato', valor_recibido: 'no-es-un-correo' },
    ]);
    expect(resultado.filas_invalidas).toBe(1);
    expect(resultado.filas_creadas).toBe(0);
    expect(matriculasService.crearIdempotente).not.toHaveBeenCalled();
  });

  it('clave compuesta de Aula inexistente reporta campo=aula, motivo=referencia_inexistente; el Usuario válido igual se crea, SIN transacción compartida', async () => {
    const usersCrearIdempotente = jest.fn().mockResolvedValue({ usuario: { id: 'u1' }, creado: true });
    const matriculasCrearIdempotente = jest.fn();
    const resolverReferenciasAula = jest.fn().mockResolvedValue({
      ok: false,
      entidad: 'Aula',
      campo: 'aula',
      valor: '1°/A/manana',
    });
    const { servicio, prisma } = construirServicio({
      usersCrearIdempotente,
      matriculasCrearIdempotente,
      resolverReferenciasAula,
    });
    const archivo = construirCsv([CABECERA, FILA_VALIDA_1]);

    const resultado = await servicio.importar(archivo, 'actor-1');

    expect(resultado.errores).toEqual([
      { fila: 1, campo: 'aula', motivo: 'referencia_inexistente', valor_recibido: '1°/A/manana' },
    ]);
    expect(resultado.filas_invalidas).toBe(1);
    // Usuario sí se creó (invocado), aunque la fila cuente como inválida por la Matricula fallida.
    expect(usersCrearIdempotente).toHaveBeenCalledTimes(1);
    // Excepción puntual: el Usuario se crea SIN tx compartido (solo dos argumentos, sin `tx`).
    expect(usersCrearIdempotente).toHaveBeenCalledWith(
      { nombres: 'Ana Pérez', dni: '12345678', codigo: 'COD-1', correo: 'ana@example.com', rol: 'estudiante' },
      'actor-1',
    );
    // La Matricula ni siquiera se intenta, y no se abre ninguna transacción compartida.
    expect(matriculasCrearIdempotente).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rol de Usuario inválido (USUARIO_NO_ES_ESTUDIANTE) es atómico: Usuario y Matricula comparten la MISMA transacción y ambos cuentan como no creados', async () => {
    const usersCrearIdempotente = jest.fn().mockResolvedValue({ usuario: { id: 'u1' }, creado: true });
    const matriculasCrearIdempotente = jest.fn().mockRejectedValue(
      new ConflictException({ codigo: 'USUARIO_NO_ES_ESTUDIANTE' as AcademicoErrorCode, rol_actual: 'docente' }),
    );
    const { servicio, prisma } = construirServicio({ usersCrearIdempotente, matriculasCrearIdempotente });
    const archivo = construirCsv([CABECERA, FILA_VALIDA_1]);

    const resultado = await servicio.importar(archivo, 'actor-1');

    expect(resultado.filas_invalidas).toBe(1);
    expect(resultado.filas_creadas).toBe(0);
    expect(resultado.filas_existentes).toBe(0);
    expect(resultado.errores).toEqual([
      { fila: 1, campo: '', motivo: 'referencia_inexistente', valor_recibido: '' },
    ]);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Usuario y Matricula recibieron el MISMO tx compartido (tercer argumento): en una transacción
    // Prisma real, el fallo de Matricula revierte también al Usuario recién creado.
    const txUsuario = usersCrearIdempotente.mock.calls[0][2];
    const txMatricula = matriculasCrearIdempotente.mock.calls[0][2];
    expect(txUsuario).toBeDefined();
    expect(txUsuario).toBe(txMatricula);
  });

  it('incoherencia jerárquica (Aula/AnioEscolar) es atómica: Usuario y Matricula comparten la MISMA transacción y ambos cuentan como no creados', async () => {
    const usersCrearIdempotente = jest.fn().mockResolvedValue({ usuario: { id: 'u1' }, creado: true });
    const matriculasCrearIdempotente = jest.fn().mockRejectedValue(
      new ConflictException({
        codigo: 'COHERENCIA_JERARQUICA' as AcademicoErrorCode,
        campo: 'anio_escolar_id',
        esperado: 'a-otro',
        recibido: 'a1',
      }),
    );
    const { servicio, prisma } = construirServicio({ usersCrearIdempotente, matriculasCrearIdempotente });
    const archivo = construirCsv([CABECERA, FILA_VALIDA_1]);

    const resultado = await servicio.importar(archivo, 'actor-1');

    expect(resultado.filas_invalidas).toBe(1);
    expect(resultado.filas_creadas).toBe(0);
    expect(resultado.filas_existentes).toBe(0);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const txUsuario = usersCrearIdempotente.mock.calls[0][2];
    const txMatricula = matriculasCrearIdempotente.mock.calls[0][2];
    expect(txUsuario).toBeDefined();
    expect(txUsuario).toBe(txMatricula);
  });

  it('reimportar el mismo archivo no duplica: ambos creado:false cuentan como filas_existentes, no como error', async () => {
    const usersCrearIdempotente = jest.fn().mockResolvedValue({ usuario: { id: 'u1' }, creado: false });
    const matriculasCrearIdempotente = jest.fn().mockResolvedValue({ matricula: { id: 'm1' }, creado: false });
    const { servicio } = construirServicio({ usersCrearIdempotente, matriculasCrearIdempotente });
    const archivo = construirCsv([CABECERA, FILA_VALIDA_1]);

    const resultado = await servicio.importar(archivo, 'actor-1');

    expect(resultado.filas_existentes).toBe(1);
    expect(resultado.filas_creadas).toBe(0);
    expect(resultado.filas_invalidas).toBe(0);
    expect(resultado.errores).toEqual([]);
  });

  it('filas válidas e inválidas mezcladas: importa todas las válidas y reporta cada inválida con fila y motivo', async () => {
    const usersCrearIdempotente = jest.fn().mockImplementation(async (datos: { correo: string }) => {
      if (datos.correo === 'invalido') {
        throw new BadRequestException({ codigo: 'CAMPO_INVALIDO', campo: 'correo', motivo: 'formato' });
      }
      return { usuario: { id: 'u1' }, creado: true };
    });
    const matriculasCrearIdempotente = jest.fn().mockResolvedValue({ matricula: { id: 'm1' }, creado: true });
    const { servicio } = construirServicio({ usersCrearIdempotente, matriculasCrearIdempotente });

    const filaInvalida = ['Rota', '1', 'COD-X', 'invalido', '1°', 'A', 'manana', '2026'];
    const archivo = construirCsv([CABECERA, FILA_VALIDA_1, filaInvalida, FILA_VALIDA_2]);

    const resultado = await servicio.importar(archivo, 'actor-1');

    expect(resultado.filas_totales).toBe(3);
    expect(resultado.filas_creadas).toBe(2);
    expect(resultado.filas_invalidas).toBe(1);
    expect(resultado.errores).toEqual([
      { fila: 2, campo: 'correo', motivo: 'formato', valor_recibido: 'invalido' },
    ]);
    // La fila válida posterior a la inválida también se procesó (FILA_VALIDA_2, fila 3).
    expect(usersCrearIdempotente).toHaveBeenCalledTimes(3);
  });

  it('cada fila válida invoca UsersService.crearIdempotente con rol estudiante y MatriculasService.crearIdempotente con el usuario_id resuelto, ambos con el mismo tx compartido', async () => {
    const usersCrearIdempotente = jest.fn().mockResolvedValue({ usuario: { id: 'u-resuelto' }, creado: true });
    const matriculasCrearIdempotente = jest.fn().mockResolvedValue({ matricula: { id: 'm1' }, creado: true });
    const { servicio, prisma } = construirServicio({ usersCrearIdempotente, matriculasCrearIdempotente });
    const archivo = construirCsv([CABECERA, FILA_VALIDA_1]);

    await servicio.importar(archivo, 'actor-1');

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(usersCrearIdempotente).toHaveBeenCalledWith(
      { nombres: 'Ana Pérez', dni: '12345678', codigo: 'COD-1', correo: 'ana@example.com', rol: 'estudiante' },
      'actor-1',
      'tx-fake',
    );
    expect(matriculasCrearIdempotente).toHaveBeenCalledWith(
      {
        usuario_id: 'u-resuelto',
        grado_nombre: '1°',
        seccion_nombre: 'A',
        turno: 'manana',
        anio_escolar_codigo: '2026',
      },
      'actor-1',
      'tx-fake',
    );
  });
});
