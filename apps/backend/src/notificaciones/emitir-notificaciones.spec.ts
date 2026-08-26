import type { Prisma } from '@prisma/client';
import { emitirNotificaciones, type ProcesoNotificable } from './emitir-notificaciones';

/**
 * notificaciones (#19, PR3; design.md D4). `emitirNotificaciones(tx, params)` es una función LIBRE
 * sobre `Prisma.TransactionClient` — nunca levanta Nest ni Postgres real acá. El doble de `tx` sólo
 * expone los cuatro métodos que la función usa: `$queryRaw` (INSERT … ON CONFLICT DO NOTHING
 * RETURNING), `jobCorreo.createMany`, `$executeRaw` (UPDATE batched de `job_correo_id`) y
 * `eventoAuditoria.create`.
 */
function crearDobleTx(opciones: {
  filasRetornadas?: Array<Array<{ id: string; usuario_id: string }>>;
} = {}) {
  const filas = opciones.filasRetornadas ?? [];
  let llamada = 0;

  const $queryRaw = jest.fn(async () => {
    const resultado = filas[llamada] ?? [];
    llamada += 1;
    return resultado;
  });
  const $executeRaw = jest.fn(async (..._args: unknown[]) => 1);
  const createMany = jest.fn(async (_args: { data: unknown[] }) => ({ count: 0 }));
  const create = jest.fn(async (_args: { data: Record<string, unknown> }) => ({}) as never);

  const tx = {
    $queryRaw,
    $executeRaw,
    jobCorreo: { createMany },
    eventoAuditoria: { create },
  } as unknown as Prisma.TransactionClient;

  return { tx, $queryRaw, $executeRaw, createMany, create };
}

const PROCESO: ProcesoNotificable = {
  id: 'proceso-1',
  nombre: 'Consejo Estudiantil 2026',
  fecha_cierre_prevista: new Date('2026-09-02T18:00:00.000Z'),
};

describe('emitirNotificaciones()', () => {
  // 7.1: destinatarios: [] ⇒ no ejecuta ningún INSERT.
  it('[7.1] destinatarios vacío no ejecuta ningún INSERT ni auditoría', async () => {
    const { tx, $queryRaw, createMany, create } = crearDobleTx();

    const resultado = await emitirNotificaciones(tx, {
      proceso: PROCESO,
      evento: 'inicio_votacion',
      destinatarios: [],
      actorId: 'actor-1',
    });

    expect($queryRaw).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(resultado).toEqual({ notificaciones: 0, jobs_correo: 0 });
  });

  // 7.2: troceado a 500; createMany recibe exactamente las filas del RETURNING, nunca la lista
  // completa (simula que Postgres descartó algunas por ON CONFLICT DO NOTHING).
  it('[7.2] trocea a 500 y jobCorreo.createMany recibe solo las filas realmente insertadas', async () => {
    const primerLote = Array.from({ length: 500 }, (_, i) => `usuario-${i}`);
    const segundoLote = ['usuario-500'];
    const destinatarios = [...primerLote, ...segundoLote];

    // Simula que 100 de las 500 del primer lote ya existían (ON CONFLICT DO NOTHING).
    const retornadasLote1 = primerLote
      .slice(0, 400)
      .map((usuarioId, i) => ({ id: `notif-${i}`, usuario_id: usuarioId }));
    const retornadasLote2 = [{ id: 'notif-500', usuario_id: 'usuario-500' }];

    const { tx, $queryRaw, createMany } = crearDobleTx({
      filasRetornadas: [retornadasLote1, retornadasLote2],
    });

    const resultado = await emitirNotificaciones(tx, {
      proceso: PROCESO,
      evento: 'recordatorio',
      destinatarios,
      actorId: null,
    });

    expect($queryRaw).toHaveBeenCalledTimes(2);
    expect(createMany).toHaveBeenCalledTimes(2);

    const primeraLlamada = createMany.mock.calls[0][0] as { data: unknown[] };
    const segundaLlamada = createMany.mock.calls[1][0] as { data: unknown[] };
    // Nunca la lista completa del lote (500): sólo las 400 que RETURNING confirmó.
    expect(primeraLlamada.data).toHaveLength(400);
    expect(segundaLlamada.data).toHaveLength(1);

    expect(resultado).toEqual({ notificaciones: 401, jobs_correo: 401 });
  });

  // 7.3: origen:'notificacion' en todas las filas de JobCorreo.
  it('[7.3] todas las filas de JobCorreo llevan origen:notificacion', async () => {
    const retornadas = [
      { id: 'notif-1', usuario_id: 'usuario-1' },
      { id: 'notif-2', usuario_id: 'usuario-2' },
    ];
    const { tx, createMany } = crearDobleTx({ filasRetornadas: [retornadas] });

    await emitirNotificaciones(tx, {
      proceso: PROCESO,
      evento: 'cierre_proximo',
      destinatarios: ['usuario-1', 'usuario-2'],
      actorId: 'actor-1',
    });

    const llamada = createMany.mock.calls[0][0] as { data: Array<{ origen: string }> };
    expect(llamada.data).toHaveLength(2);
    for (const fila of llamada.data) {
      expect(fila.origen).toBe('notificacion');
    }
  });

  // 7.4 [threat: secreto del voto/PII]: el payload de NOTIFICACIONES_EMITIDAS no lleva usuario_id
  // ni identidad de elección (candidato/lista/opción/blanco/ganador).
  it('[7.4][adversarial] el payload de auditoría no lleva usuario_id ni identidad de elección', async () => {
    const retornadas = [{ id: 'notif-1', usuario_id: 'usuario-1' }];
    const { tx, create } = crearDobleTx({ filasRetornadas: [retornadas] });

    await emitirNotificaciones(tx, {
      proceso: PROCESO,
      evento: 'resultados',
      destinatarios: ['usuario-1'],
      actorId: 'actor-99',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0] as {
      data: { event_type: string; entity_type: string; entity_id: string; actor_usuario_id: string | null; payload: Record<string, unknown> };
    };

    expect(args.data.event_type).toBe('NOTIFICACIONES_EMITIDAS');
    expect(args.data.entity_type).toBe('ProcesoElectoral');
    expect(args.data.entity_id).toBe(PROCESO.id);
    expect(args.data.actor_usuario_id).toBe('actor-99');
    expect(args.data.payload).toEqual({
      evento: 'resultados',
      notificaciones: 1,
      jobs_correo: 1,
    });

    const claves = Object.keys(args.data.payload);
    for (const prohibida of ['usuario_id', 'candidato_id', 'lista_id', 'opcion_id', 'blanco', 'eleccion']) {
      expect(claves).not.toContain(prohibida);
    }
  });
});
