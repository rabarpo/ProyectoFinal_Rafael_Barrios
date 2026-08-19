/**
 * cierre-escrutinio-actas (#17, PR5; design.md D10). Estructuralmente idéntico a
 * `outbox-correo.processor.ts` (D8 de `#15`): función PURA sobre dos PUERTOS
 * (`ActasRepo`, `RendererActa`), sin `PrismaClient` ni `bullmq` — ambos viven exclusivamente en
 * `../actas/actas.repo.ts` (adaptador) y en `main.ts`.
 *
 * A diferencia de `procesarCorreoComprobante`, acá no hay un `reclamar()` separado: el CAS real
 * vive dentro de `repo.finalizar()`, que hace en una sola transacción el `UPDATE … WHERE
 * estado='borrador'` + auditoría + conteo + transición del proceso (D11). `leer()` sólo descarta
 * jobs que ya no están en `borrador` (reentrega de BullMQ, doble render at-least-once — ADR-0012).
 *
 * Sin try/catch: un fallo de `render()` DEBE propagar para que BullMQ reintente. El estado
 * terminal `fallido` lo escribe SÓLO el listener `worker.on('failed')` de `main.ts`, nunca este
 * processor (D11).
 */

export interface ActaPendiente {
  id: string;
  proceso_id: string;
  tipo: string;
  estado: string;
  contenido: unknown;
}

/** Puerto de render — `pdfkit-renderer.ts` es el único adaptador concreto (D12). */
export interface RendererActa {
  render(contenido: unknown, tipo: string): Promise<Buffer>;
}

export interface ActasRepo {
  leer(id: string): Promise<ActaPendiente | null>;
  /** Transacción terminal completa de D11: CAS + auditoría + conteo + transición del proceso. */
  finalizar(id: string, pdf: Buffer): Promise<'emitida' | 'no-op'>;
  /** Escrito exclusivamente por `worker.on('failed')` en `main.ts`, nunca desde este processor. */
  marcarFallido(id: string): Promise<void>;
  pendientes(limite: number): Promise<string[]>;
}

export async function procesarActa(
  repo: ActasRepo,
  renderer: RendererActa,
  actaId: string,
): Promise<'emitida' | 'no-op'> {
  const acta = await repo.leer(actaId);
  if (!acta || acta.estado !== 'borrador') {
    return 'no-op';
  }

  // Sin try/catch: un fallo de render debe propagar para que BullMQ reintente (D11). Capturarlo
  // acá marcaría el job como si el processor decidiera el estado terminal.
  const pdf = await renderer.render(acta.contenido, acta.tipo);

  return repo.finalizar(actaId, pdf);
}
