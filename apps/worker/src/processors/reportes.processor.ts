/**
 * reportes-y-exportaciones (#18, PR4; design.md D9/D10/D7.2). Estructuralmente idéntico a
 * `actas.processor.ts`: función PURA sobre dos PUERTOS (`ReportesRepo`, un `RendererReporte` por
 * formato), sin `PrismaClient` ni `bullmq` — ambos viven exclusivamente en `../reportes/reportes.repo.ts`
 * (adaptador) y en `main.ts`.
 *
 * D7.2 — capa 2 del gate: el gate se releé AHORA con `ocultar_resultados` vigente (no el congelado
 * en la solicitud, que es una política, no un dato) y se aplica `podar()` (D5) antes de renderizar.
 *
 * Sin try/catch: un fallo de `render()` DEBE propagar para que BullMQ reintente. El estado
 * terminal `fallido` lo escribe SÓLO el listener `worker.on('failed')` de `main.ts`, nunca este
 * processor (D13).
 */

import { esSensible, podar, type ModeloReporte } from '../reportes/modelo-reporte';

export interface ReportePendiente {
  id: string;
  proceso_id: string;
  dimension: string;
  formato: string;
  estado: string;
  contenido: unknown;
  /** D7.2: leído AHORA, no congelado en la solicitud — la visibilidad es política vigente. */
  ocultar_resultados: boolean;
}

/** Puerto de render — un adaptador concreto por `FormatoReporte` (D10). */
export interface RendererReporte {
  readonly mime: string;
  readonly extension: string;
  render(modelo: ModeloReporte): Promise<Buffer>;
}

export interface ReportesRepo {
  leer(id: string): Promise<ReportePendiente | null>;
  /**
   * D12: CAS + auditoría con actor leído de la fila. Sin FOR UPDATE (no hay agregación).
   * `filas` (D13): cardinalidad real del `ModeloReporte` ya podado que se renderizó — suma de
   * `seccion.filas.length` de todas las secciones que sobrevivieron al gate, nunca un valor fijo.
   */
  finalizar(
    id: string,
    archivo: Buffer,
    mime: string,
    nombre: string,
    gateAplicado: boolean,
    filas: number,
  ): Promise<'emitida' | 'no-op'>;
  /** Escrito exclusivamente por `worker.on('failed')` en `main.ts`, nunca desde este processor. */
  marcarFallido(id: string): Promise<void>;
  pendientes(limite: number): Promise<string[]>;
}

export async function procesarReporte(
  repo: ReportesRepo,
  renderers: Record<string, RendererReporte>,
  reporteId: string,
): Promise<'emitida' | 'no-op'> {
  const reporte = await repo.leer(reporteId);
  if (!reporte || reporte.estado !== 'borrador') {
    return 'no-op';
  }

  const renderer = renderers[reporte.formato];
  if (!renderer) {
    throw new Error(`Sin renderizador registrado para el formato: ${reporte.formato}`);
  }

  const gate = esSensible(reporte.dimension) && reporte.ocultar_resultados;
  const modelo = podar(reporte.contenido as ModeloReporte, gate);
  // D13: cardinalidad real del reporte generado — suma de filas de las secciones que sobrevivieron
  // al gate, es decir, exactamente lo que se renderizó.
  const filas = modelo.secciones.reduce((total, seccion) => total + seccion.filas.length, 0);

  // Sin try/catch: un fallo de render debe propagar para que BullMQ reintente (D9). Capturarlo
  // acá marcaría el job como si el processor decidiera el estado terminal.
  const archivo = await renderer.render(modelo);
  const nombre = `reporte-${reporte.dimension}-${reporte.id}${renderer.extension}`;

  return repo.finalizar(reporteId, archivo, renderer.mime, nombre, gate, filas);
}
