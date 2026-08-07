import type { Client } from 'pg';

// Aserciones de catálogo por nombre (design.md, D2 — "Deriva del lado SQL raw"). El SQL raw
// anexado a mano a una migración (índice parcial, `CHECK`) no aparece en `schema.prisma`, así que
// su presencia real en la base se verifica consultando `pg_constraint`/`pg_indexes` directamente.

export interface ConstraintRow {
  conname: string;
  definition: string;
}

export async function getConstraintDef(
  client: Client,
  constraintName: string,
): Promise<ConstraintRow | null> {
  const result = await client.query<{ conname: string; definition: string }>(
    `SELECT conname, pg_get_constraintdef(oid) AS definition
     FROM pg_constraint
     WHERE conname = $1`,
    [constraintName],
  );
  return result.rows[0] ?? null;
}

export interface IndexRow {
  indexname: string;
  indexdef: string;
}

export async function getIndexDef(
  client: Client,
  indexName: string,
): Promise<IndexRow | null> {
  const result = await client.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes WHERE indexname = $1`,
    [indexName],
  );
  return result.rows[0] ?? null;
}

export async function countPublicViews(client: Client): Promise<number> {
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM pg_views WHERE schemaname = 'public'`,
  );
  return Number(result.rows[0]?.count ?? '0');
}
