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
  updateMany?: jest.Mock;
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
    updateMany: overrides.updateMany ?? jest.fn().mockResolvedValue({ count: 0 }),
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

describe('AniosEscolaresService.activar() (SY2, D1, tareas 10.1-10.7)', () => {
  // 10.1: activación exitosa desactiva el año previamente activo y activa el indicado, audita
  // ANIO_ESCOLAR_ACTIVADO con anio_escolar_anterior_id.
  it('[10.1] desactiva el previo, activa el objetivo y audita con anio_escolar_anterior_id', async () => {
    const objetivo = { id: 'a2', nombre: 'Año 2027', activo: false };
    const previo = { id: 'a1', nombre: 'Año 2026', activo: true };
    const activado = { id: 'a2', nombre: 'Año 2027', activo: true };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const update = jest.fn().mockResolvedValue(activado);
    const { servicio, tx, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(objetivo),
      findFirst: jest.fn().mockResolvedValue(previo),
      updateMany,
      update,
    });

    const resultado = await servicio.activar('a2', 'actor-1');

    expect(resultado).toEqual({ id: 'a2', activo: true, cambio: true });
    // Orden obligatorio (D1): desactivar (updateMany) antes de activar (update) — índice único
    // parcial no diferible.
    expect(updateMany.mock.invocationCallOrder[0]).toBeLessThan(update.mock.invocationCallOrder[0]);
    expect(tx.anioEscolar.updateMany).toHaveBeenCalledWith({
      where: { activo: true },
      data: { activo: false },
    });
    expect(auditoria.log).toHaveBeenCalledWith(
      expect.anything(),
      'ANIO_ESCOLAR_ACTIVADO',
      'actor-1',
      'AnioEscolar',
      'a2',
      expect.objectContaining({ anio_escolar_anterior_id: 'a1' }),
    );
  });

  // 10.2: activar un año ya activo es idempotente, no audita.
  it('[10.2] año ya activo es idempotente: cambio=false, sin auditar', async () => {
    const objetivo = { id: 'a1', nombre: 'Año 2026', activo: true };
    const update = jest.fn();
    const updateMany = jest.fn();
    const { servicio, auditoria } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(objetivo),
      update,
      updateMany,
    });

    const resultado = await servicio.activar('a1', 'actor-1');

    expect(resultado).toEqual({ id: 'a1', activo: true, cambio: false });
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(auditoria.log).not.toHaveBeenCalled();
  });

  // 10.3: :id inexistente responde 404.
  it('[10.3] :id inexistente responde 404', async () => {
    const { servicio } = construirServicio({ findUnique: jest.fn().mockResolvedValue(null) });
    await expect(servicio.activar('inexistente', 'actor-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  // 10.6: la colisión del índice parcial (target contiene 'activo') se distingue de un nombre
  // duplicado (target contiene 'nombre') — reutiliza objetivoContiene() de PR1. Un P2002 cuyo
  // target NO contiene 'activo' no se traduce a ACTIVACION_CONCURRENTE, escapa tal cual.
  it("[10.6] P2002 con target que NO contiene 'activo' no se traduce a ACTIVACION_CONCURRENTE", async () => {
    const objetivo = { id: 'a2', nombre: 'Año 2027', activo: false };
    const p2002Nombre = { code: 'P2002', meta: { target: ['nombre'] } };
    const update = jest.fn().mockImplementation(() => {
      throw p2002Nombre;
    });
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(objetivo),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update,
    });

    await expect(servicio.activar('a2', 'actor-1')).rejects.toBe(p2002Nombre);
  });

  it("[10.6] P2002 con target que SÍ contiene 'activo' se traduce a 409 ACTIVACION_CONCURRENTE", async () => {
    const objetivo = { id: 'a2', nombre: 'Año 2027', activo: false };
    const p2002Activo = { code: 'P2002', meta: { target: ['activo'] } };
    const update = jest.fn().mockImplementation(() => {
      throw p2002Activo;
    });
    const { servicio } = construirServicio({
      findUnique: jest.fn().mockResolvedValue(objetivo),
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      update,
    });

    await expect(servicio.activar('a2', 'actor-1')).rejects.toMatchObject({
      response: { codigo: 'ACTIVACION_CONCURRENTE' },
    });
  });
});

/**
 * Adversarial (RED obligatorio bajo Strict TDD, design.md "Estrategia de pruebas", tareas 10.4-10.5)
 * — simula, con Prisma mockeado, el comportamiento descrito en design.md D1 bajo READ COMMITTED:
 * `updateMany`/`update` compiten por un lock de fila serializado (mutex FIFO), mientras que las
 * lecturas (`findUnique`/`findFirst`) no bloquean y ven el estado vivo al momento de ejecutarse —
 * mismo criterio que el flujo de datos de D1. La prueba de concurrencia real contra Postgres queda
 * pendiente de CI (`docker ps` sin daemon disponible en este entorno, ver limitación documentada en
 * `anios-escolares.e2e-spec.ts`).
 */
describe('AniosEscolaresService.activar() — concurrencia simulada (SY2, D1, tareas 10.4-10.5)', () => {
  interface FilaSimulada {
    id: string;
    nombre: string;
    activo: boolean;
  }

  function crearPrismaConcurrenciaSimulada(filasIniciales: FilaSimulada[]) {
    const filas = new Map(filasIniciales.map((f) => [f.id, { ...f }]));
    // FIFO global: modela el lock de fila que Postgres retiene hasta el COMMIT de la transacción
    // completa (no solo durante la sentencia individual) — la primera escritura de cada
    // transacción reserva su turno; el lock se libera recién cuando el callback ENTERO de
    // `$transaction` termina (éxito o error), en el `finally` de abajo.
    let colaEscritura: Promise<void> = Promise.resolve();

    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => {
        // Wrapper mutable en vez de `let` reasignado dentro de un closure anidado: evita que el
        // analizador de flujo de TypeScript angoste el tipo a `never` en el `finally` de más abajo.
        const estadoTurno: { miTurno: Promise<void> | null; liberar: (() => void) | null } = {
          miTurno: null,
          liberar: null,
        };

        function asegurarTurno(): Promise<void> {
          if (!estadoTurno.miTurno) {
            estadoTurno.miTurno = colaEscritura;
            colaEscritura = new Promise<void>((resolve) => {
              estadoTurno.liberar = () => resolve();
            });
          }
          return estadoTurno.miTurno;
        }

        const anioEscolarTx = {
          findUnique: jest.fn(({ where: { id } }: { where: { id: string } }) =>
            Promise.resolve(filas.get(id) ? { ...filas.get(id)! } : null),
          ),
          findFirst: jest.fn(({ where }: { where: { activo?: boolean } }) => {
            if (where?.activo === true) {
              const activa = [...filas.values()].find((f) => f.activo);
              return Promise.resolve(activa ? { ...activa } : null);
            }
            return Promise.resolve(null);
          }),
          updateMany: jest.fn(
            async ({ where, data }: { where: { activo?: boolean }; data: { activo: boolean } }) => {
              // Postgres real: un `UPDATE ... WHERE activo = true` que no coincide con ninguna fila
              // no toma ningún lock y no bloquea — solo reserva turno (y por lo tanto puede
              // bloquearse) cuando, al momento de la llamada, existe una fila activa que tocar. Esta
              // comprobación es síncrona (sin `await` previo) para reservar el turno en el mismo
              // tick que la otra transacción podría estar reservando el suyo.
              const hayFilaActivaAhora = [...filas.values()].some((f) => f.activo);
              if (where?.activo === true && hayFilaActivaAhora) {
                await asegurarTurno();
              }
              let count = 0;
              for (const fila of filas.values()) {
                if (where?.activo === true && fila.activo === true) {
                  fila.activo = data.activo;
                  count += 1;
                }
              }
              return { count };
            },
          ),
          update: jest.fn(
            async ({ where: { id }, data }: { where: { id: string }; data: { activo: boolean } }) => {
              await asegurarTurno();
              const fila = filas.get(id);
              if (!fila) throw new Error('fila inexistente en el mock');
              if (data.activo === true) {
                const otroActivo = [...filas.values()].some((f) => f.id !== id && f.activo === true);
                if (otroActivo) {
                  // Simula la violación del índice único parcial anio_escolar_activo_unico_idx (D1).
                  throw { code: 'P2002', meta: { target: ['activo'] } };
                }
              }
              Object.assign(fila, data);
              return { ...fila };
            },
          ),
        };

        try {
          return await callback({ anioEscolar: anioEscolarTx });
        } finally {
          if (estadoTurno.liberar) estadoTurno.liberar();
        }
      }),
    };
    const auditoria = { log: jest.fn().mockResolvedValue(undefined) };
    const servicio = new AniosEscolaresService(
      prisma as unknown as PrismaService,
      auditoria as unknown as AuditoriaService,
    );

    return { servicio, filas };
  }

  // 10.4: dos activaciones concurrentes sobre años distintos, existiendo un año activo previo ->
  // exactamente un AnioEscolar queda activo=true, ningún 500 (gana la última transacción
  // confirmada).
  it('[10.4] con año activo previo: dos activaciones concurrentes dejan exactamente un activo, sin error', async () => {
    const { servicio, filas } = crearPrismaConcurrenciaSimulada([
      { id: 'a0', nombre: 'Año 2025', activo: true },
      { id: 'a1', nombre: 'Año 2026', activo: false },
      { id: 'a2', nombre: 'Año 2027', activo: false },
    ]);

    const [r1, r2] = await Promise.all([
      servicio.activar('a1', 'actor-1'),
      servicio.activar('a2', 'actor-2'),
    ]);

    expect(r1.activo).toBe(true);
    expect(r2.activo).toBe(true);
    const activos = [...filas.values()].filter((f) => f.activo);
    expect(activos).toHaveLength(1);
  });

  // 10.5: dos activaciones concurrentes sin ningún año activo previo -> la segunda colisiona
  // contra el índice único parcial ⇒ 409 ACTIVACION_CONCURRENTE, nunca dos activos, nunca 500.
  it('[10.5] sin año activo previo: la segunda activación colisiona con 409 ACTIVACION_CONCURRENTE, nunca dos activos', async () => {
    const { servicio, filas } = crearPrismaConcurrenciaSimulada([
      { id: 'a1', nombre: 'Año 2026', activo: false },
      { id: 'a2', nombre: 'Año 2027', activo: false },
    ]);

    const resultados = await Promise.allSettled([
      servicio.activar('a1', 'actor-1'),
      servicio.activar('a2', 'actor-2'),
    ]);

    const cumplidas = resultados.filter((r) => r.status === 'fulfilled');
    const rechazadas = resultados.filter((r) => r.status === 'rejected');
    expect(cumplidas).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect((rechazadas[0] as PromiseRejectedResult).reason).toMatchObject({
      response: { codigo: 'ACTIVACION_CONCURRENTE' },
    });
    // Ninguna otra clase de error (nunca 500): la promesa rechazada es un ConflictException con
    // el código de negocio esperado, no un error crudo de Prisma ni una excepción sin traducir.
    expect((rechazadas[0] as PromiseRejectedResult).reason.status).toBe(409);

    const activos = [...filas.values()].filter((f) => f.activo);
    expect(activos).toHaveLength(1);
  });
});
