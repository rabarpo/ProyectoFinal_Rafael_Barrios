/**
 * outbox-correo-comprobante-autenticado (#15, PR5; design.md D13 — "Reconciliación / backfill").
 *
 * Utilidad de RECONCILIACIÓN, estrictamente de SÓLO LECTURA: identifica filas `Voto` que no
 * tienen un `JobCorreo` asociado (`LEFT JOIN … WHERE jc.id IS NULL`). MUST NOT insertar ninguna
 * fila `JobCorreo` — hacerlo sería reconstruir exactamente el despachador desacoplado que el
 * ADR-0018 veta de forma PERMANENTE (obligación 2: "un mecanismo que lea votos ya confirmados
 * desde fuera de la transacción original… queda vetado por este ADR, no solo desaconsejado").
 *
 * Greenfield (proposal.md/design.md D13): no existen votos reales, así que este script no
 * requiere backfill — es un diagnóstico, no una tubería de reparación. Si algún día detecta filas
 * (por ejemplo tras un incidente de infraestructura fuera de este change), la reparación es una
 * decisión humana caso por caso, nunca automática.
 *
 * Uso: pnpm --filter @seei/backend exec tsx scripts/reconciliar-outbox.ts
 * Código de salida: 0 si no hay votos huérfanos, 1 si encuentra al menos uno.
 */

import { PrismaClient } from '@prisma/client';

export interface VotoSinJobCorreo {
  id: string;
  proceso_id: string;
  codigo_comprobante: string;
  hora_servidor: Date;
}

/**
 * SÓLO LECTURA. La sentencia refleja literalmente la de design.md (sección "Interfaces /
 * Contratos", D13): un `LEFT JOIN` sin ninguna cláusula de escritura. No acepta parámetros ni
 * construye SQL dinámico — la única entrada es la conexión.
 */
export async function buscarVotosSinJobCorreo(prisma: PrismaClient): Promise<VotoSinJobCorreo[]> {
  return prisma.$queryRaw<VotoSinJobCorreo[]>`
    SELECT v.id, v.proceso_id, v.codigo_comprobante, v.hora_servidor
      FROM "Voto" v
      LEFT JOIN "JobCorreo" jc ON jc.voto_id = v.id
     WHERE jc.id IS NULL
  `;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const filas = await buscarVotosSinJobCorreo(prisma);

    if (filas.length === 0) {
      console.log('Reconciliación de outbox: 0 votos sin JobCorreo.');
      return;
    }

    console.error(`Reconciliación de outbox: ${filas.length} voto(s) sin JobCorreo asociado:`);
    for (const fila of filas) {
      console.error(
        `  voto_id=${fila.id} proceso_id=${fila.proceso_id} ` +
          `codigo_comprobante=${fila.codigo_comprobante} ` +
          `hora_servidor=${fila.hora_servidor.toISOString()}`,
      );
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Sólo corre `main()` cuando el archivo se ejecuta directamente (`tsx scripts/reconciliar-outbox.ts`),
// nunca al importar `buscarVotosSinJobCorreo` desde su prueba unitaria.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
