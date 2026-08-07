# Tasks: append-only-audit-engine (Backlog #3 — Motor de auditoría append-only)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~300-330 / PR2 ~200-230 (per design.md file table) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (DB guarantee) → PR 2 (write path) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

Predeclared contingency (design.md, only if PR1 diff exceeds 400 authored lines): split PR1 into
PR1a (table + CHECK + REVOKE + helpers + permission tests) and PR1b (both functions, three triggers,
ADR-0016, rejection tests) — not adopted by default per design.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `EventoAuditoria` model + migration + CHECK + REVOKE | PR 1 | `pnpm --filter @seei/backend test:schema -- auditoria` | `test:schema` against real Postgres (`seei_migrator`) | `git revert` PR1; forward migration drops table if already applied |
| 2 | Three anti-mutation triggers (no_update/no_delete/no_truncate, AU001) | PR 1 | `pnpm --filter @seei/backend test:schema -- auditoria` | `test:schema`, connect as `seei_migrator` (`MIGRATION_DATABASE_URL`) | Same migration file as Unit 1; drop triggers via forward migration |
| 3 | Forbidden-keys BEFORE INSERT trigger (AU002) + ADR-0016 | PR 1 | `pnpm --filter @seei/backend test:schema -- auditoria` | `test:schema`, connect as `seei_app` (`DATABASE_URL`) | Same migration file; drop function/trigger via forward migration |
| 4 | `AuditEventType` union + `AuditoriaService.log` + module wiring | PR 2 | `pnpm --filter @seei/backend test:e2e -- auditoria-transaccional` | `test:e2e` (Prisma Client, real Postgres) | `git revert` PR2; PR1 table unaffected, no FK dependents |
| 5 | Atomicity e2e suite (rollback/commit/malformed payload) | PR 2 | `pnpm --filter @seei/backend test:e2e -- auditoria-transaccional` | `test:e2e` against real Postgres | Delete spec file; no schema impact |

## PR 1 — DB Guarantee (base = feature/tracker branch)

### Phase 1: Schema Foundation
- [x] 1.1 Add `EventoAuditoria` model to `apps/backend/prisma/schema.prisma` (D1: uuid PK, nullable
      `actor_usuario_id` FK `onDelete: Restrict`, `event_type`/`entity_type` TEXT, nullable
      `entity_id`, `occurred_at` timestamptz default now(), nullable `ip_address`/`user_agent`,
      `payload Json @db.JsonB`) + inverse `eventosAuditoria` on `Usuario` [R1a]
- [x] 1.2 Generate migration `prisma migrate dev --create-only --name append_only_audit`
- [x] 1.3 RED: `test/schema/auditoria.spec.ts` asserts all columns present, `occurred_at` NOT NULL
      default `now()` — fails pre-migration [R1a]
- [x] 1.4 Append hand-written SQL to `migration.sql`: `event_type` CHECK `^[A-Z_]+$`, `REVOKE UPDATE,
      DELETE, TRUNCATE ON "EventoAuditoria" FROM seei_app` — GREEN 1.3 [R1a][R4a]

### Phase 2: Anti-Mutation Triggers (RED before GREEN)
- [x] 2.1 Add `createMigratorPgClient()` to `test/schema/helpers/pg-client.ts` (`MIGRATION_DATABASE_URL`)
- [x] 2.2 RED: assert `UPDATE`/`DELETE`/`TRUNCATE` via `seei_migrator` succeed silently, row unchanged
      absent trigger [R2a][R3a][TM1]
- [x] 2.3 Append `auditoria_rechazar_mutacion()` function + `eventoauditoria_no_update_trg`,
      `_no_delete_trg`, `_no_truncate_trg` (`FOR EACH STATEMENT`, `ERRCODE AU001`) to `migration.sql`
      — GREEN 2.2 [R2a][R3a]
- [x] 2.4 RED: assert `UPDATE`/`DELETE` via `seei_app` succeed absent REVOKE [R4a][TM2]
- [x] 2.5 GREEN 2.4 already satisfied by 1.4's REVOKE — assert `42501` [R4a][TM2]

### Phase 3: Forbidden-Keys Trigger + ADR-0016
- [x] 3.1 RED: insert `VOTO`/`RECHAZO` payload with `candidato_id` (root, nested, in array) succeeds
      absent trigger [R5a][R5b][TM3]
- [x] 3.2 Append `auditoria_rechazar_claves_eleccion()` + `eventoauditoria_claves_eleccion_trg`
      (`BEFORE INSERT`, `WHEN event_type IN ('VOTO','RECHAZO')`, recursive `?` + `jsonb_path_exists`,
      `ERRCODE AU002`) to `migration.sql` — GREEN 3.1 [R5a][R5b][TM3][TM4]
- [x] 3.3 GREEN: legal `VOTO` payload (`proceso_id`, `derecho_voto_id`, comprobante) accepted [R5c]
- [x] 3.4 GREEN: `event_type` violating `^[A-Z_]+$` (empty, lowercase) rejected with `23514`; new
      valid `event_type` accepted [R8a]
- [x] 3.5 Create `adrs/0016-bloqueo-estructural-identidad-eleccion-auditoria.md` verbatim from
      design.md appendix

### Phase 4: Catalog Assertions + Drift + Inventory
- [x] 4.1 Add `getTriggerDef()` / `getTablePrivileges()` to `test/schema/helpers/catalog.ts`
      (`pg_trigger`, `pg_get_triggerdef`, `aclexplode(relacl)`)
- [x] 4.2 GREEN: all three triggers present, `tgenabled = 'O'` [TM1]
- [x] 4.3 GREEN: `relacl` has no `UPDATE`/`DELETE`/`TRUNCATE` grantee besides owner [TM2]
- [x] 4.4 GREEN: `pg_get_triggerdef` for claves trigger literally contains `WHEN` clause listing
      `VOTO`/`RECHAZO` [TM4]
- [x] 4.5 Confirm `check:drift` returns empty SQL diff with functions/triggers/REVOKE present [TM5]
- [x] 4.6 Modify `test/schema/migration-inventory.spec.ts` to add `'EventoAuditoria'` to expected
      inventory

## PR 2 — Write Path (base = PR 1 branch)

### Phase 5: Event Type Registry + Service
- [x] 5.1 Create `apps/backend/src/auditoria/audit-event-types.ts`:
      `AUDIT_EVENT_TYPES = { VOTO, RECHAZO }` + `AuditEventType` union [R8b]
- [x] 5.2 Create `apps/backend/src/auditoria/auditoria.service.ts`:
      `log(tx: Prisma.TransactionClient, eventType, actorId, entityType, entityId, payload)`
- [x] 5.3 Create `apps/backend/src/auditoria/auditoria.module.ts` (`AuditoriaModule`, exports service)
- [x] 5.4 Import `AuditoriaModule` in `apps/backend/src/app.module.ts`

### Phase 6: Atomicity Suite (RED before GREEN)
- [x] 6.1 RED: `test/auditoria-transaccional.e2e-spec.ts` — rollback after both writes inside one
      `$transaction` (using `AnioEscolar` fixture) leaves 0 business rows and 0 audit rows [R6a]
- [x] 6.2 GREEN 6.1 via `AuditoriaService.log` implementation from Phase 5
- [x] 6.3 RED/GREEN: committed transaction leaves exactly 1 business row + 1 audit row, `entity_id`
      matches business row id [R6b]
- [x] 6.4 RED/GREEN: `AuditoriaService.log` with `event_type='VOTO'` payload containing
      `candidato_id`, same `$transaction` as business write — trigger rejects, business write also
      rolls back [R7a]
- [x] 6.5 GREEN: client-provided `occurred_at` ignored, server time recorded (no field in `log()`
      signature) [R1b]

### Phase 7: Wiring Verification
- [x] 7.1 Verify `AppModule` still instantiates without live DB (D6 — no eager connection)
- [x] 7.2 Run full `test:schema` + `test:e2e -- auditoria` suites together; confirm no regression in
      existing #2 migration-inventory suite
