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

// append-only-audit-engine (design.md, tarea 4.1): aserciones de catálogo por nombre para los
// triggers de sentencia/fila y el REVOKE de EventoAuditoria — el mismo precedente que
// getConstraintDef/getIndexDef, pero sobre pg_trigger y aclexplode(relacl).

export interface TriggerRow {
  tgname: string;
  tgenabled: string;
  definition: string;
}

export async function getTriggerDef(
  client: Client,
  triggerName: string,
): Promise<TriggerRow | null> {
  const result = await client.query<{ tgname: string; tgenabled: string; definition: string }>(
    `SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definition
     FROM pg_trigger t
     WHERE t.tgname = $1 AND NOT t.tgisinternal`,
    [triggerName],
  );
  return result.rows[0] ?? null;
}

export interface TablePrivilegeRow {
  grantee: string;
  privilege_type: string;
  owner: string;
}

export async function getTablePrivileges(
  client: Client,
  tableName: string,
): Promise<TablePrivilegeRow[]> {
  const result = await client.query<TablePrivilegeRow>(
    `SELECT
       COALESCE(grantee_role.rolname, 'public') AS grantee,
       acl.privilege_type,
       owner_role.rolname AS owner
     FROM pg_class c
     JOIN pg_roles owner_role ON owner_role.oid = c.relowner
     CROSS JOIN LATERAL aclexplode(c.relacl) AS acl
     LEFT JOIN pg_roles grantee_role ON grantee_role.oid = acl.grantee
     WHERE c.relname = $1 AND c.relnamespace = 'public'::regnamespace`,
    [tableName],
  );
  return result.rows;
}
