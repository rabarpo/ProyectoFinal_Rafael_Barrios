/**
 * outbox-correo-comprobante-autenticado (#15, PR2; design.md D6/D8, "Forma del processor").
 *
 * ESTRUCTURALMENTE DISTINTO de `system-ping.processor.ts` a propósito: ese walking skeleton vive
 * únicamente en Redis y su propio comentario prohíbe usarlo como base y prohíbe importar
 * `PrismaClient`. Acá la fuente de verdad ES PostgreSQL (ADR-0012) y BullMQ es sólo el motor de
 * ejecución/reintentos — pero el processor sigue sin conocer ni Prisma ni BullMQ: es una función
 * PURA sobre dos PUERTOS (`OutboxCorreoRepo`, `EmailSenderPuerto`). `PrismaClient` vive
 * exclusivamente en `../outbox/outbox-correo.repo.ts` (adaptador) y en `main.ts`.
 *
 * Idempotencia (D6): dos capas, ambas derivadas del `id` de la fila. La capa de Redis
 * (`jobId: 'jobcorreo:'+id` en `addBulk`, ver `outbox-dispatcher.ts`) vive fuera de este módulo.
 * La barrera REAL vive acá: `repo.leer()` descarta cualquier job que no esté `pendiente`, y
 * `repo.reclamar()` es el compare-and-set atómico (`UPDATE … WHERE estado='pendiente'`) que hace
 * el reintento de un job ya tomado un no-op seguro sin lectura-luego-escritura.
 *
 * Reintentos (D7): BullMQ decide CUÁNDO reintentar (`attempts`/`backoff`, ver `main.ts`). Este
 * processor NUNCA marca `fallido` — si `sender.send()` lanza, el error propaga sin capturarse y
 * BullMQ reentrega el job. El estado terminal `fallido` lo escribe el listener `worker.on('failed')`
 * de `main.ts`, sólo cuando la cola agota los reintentos configurados.
 */

export interface JobCorreoPendiente {
  id: string;
  estado: 'pendiente' | 'enviado' | 'fallido';
  asunto: string;
  cuerpo: string;
  /** Resuelto vía JOIN a `Usuario.correo` por el adaptador (D3) — no persiste en `JobCorreo`. */
  destinatario: string;
}

/**
 * Puerto mínimo requerido por este processor — estructuralmente idéntico a `EmailSender` de
 * `@seei/backend/src/email/email-sender.ts` (D9), pero declarado localmente para que este módulo
 * no dependa en tiempo de compilación de ningún paquete concreto: sólo del contrato.
 */
export interface EmailSenderPuerto {
  send(destinatario: string, asunto: string, cuerpo: string): Promise<void>;
}

export interface OutboxCorreoRepo {
  leer(id: string): Promise<JobCorreoPendiente | null>;
  /** CAS atómico: `true` si esta llamada reclamó el job, `false` si otro intento ya lo tomó. */
  reclamar(id: string): Promise<boolean>;
  marcarEnviado(id: string): Promise<void>;
  marcarFallido(id: string): Promise<void>;
  /** Usado por el despachador (`outbox-dispatcher.ts`), no por este processor. */
  pendientes(limite: number): Promise<string[]>;
}

export async function procesarCorreoComprobante(
  repo: OutboxCorreoRepo,
  sender: EmailSenderPuerto,
  jobCorreoId: string,
): Promise<'enviado' | 'no-op'> {
  const job = await repo.leer(jobCorreoId);
  if (!job || job.estado !== 'pendiente') {
    return 'no-op';
  }

  const reclamado = await repo.reclamar(jobCorreoId);
  if (!reclamado) {
    return 'no-op';
  }

  // Sin try/catch: un fallo de envío debe propagar para que BullMQ reintente (D7). Capturarlo acá
  // marcaría el job como si el processor decidiera el estado terminal, rompiendo la separación de
  // responsabilidades de D8.
  await sender.send(job.destinatario, job.asunto, job.cuerpo);
  await repo.marcarEnviado(jobCorreoId);
  return 'enviado';
}
