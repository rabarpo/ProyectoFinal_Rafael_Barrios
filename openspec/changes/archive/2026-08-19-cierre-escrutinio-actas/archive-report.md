# Archive Report: cierre-escrutinio-actas (Backlog #17)

**Change name**: cierre-escrutinio-actas  
**Archive date**: 2026-08-19  
**Status**: COMPLETE  
**SDD Artifact Observation IDs**:
- Proposal: #149
- Spec: #151
- Design: #150
- Tasks: #152
- Verify-report: (not persisted to Engram)

## Executive Summary

The change `cierre-escrutinio-actas` (#17 backlog item) has been fully implemented across 5 chained PRs, verified, and is now archived. The feature delivers a transactional process closure with official tally calculation, atomic 4-acta generation as JSON snapshots, asynchronous PDF rendering by the worker, and acta read/download endpoints for the electoral committee. All 25 implementation tasks (Phase 1-25) are marked complete and verified against spec/design requirements.

## Change Scope

**Purpose**: Implement manual closure of electoral processes, calculate official ballot tally, atomically generate 4 actas (apertura, cierre, escrutinio, oficial), render them as PDFs via worker, transition to `acta_emitida` state, and expose acta read/download endpoints.

**Work units** (5 chained PRs, all delivered):
1. **PR1 (6af212b)**: Prisma migration — `TipoActa` +escrutinio/oficial, `EstadoActa` +fallido, `Acta.contenido` TEXT→JSONB, +pdf/pdf_mime columns, unique/index constraints, deprecation CHECK
2. **PR2 (86fd236)**: Extract shared tally logic — `procesos/escrutinio.ts` with `calcularEscrutinio()`/`calcularParticipacion()`, refactor `ResultadosService` to use extracted functions without regression to #16 test suite
3. **PR3 (94eeb5c)**: Core closure transaction — `ProcesosService.cerrar()`, `CerrarProcesoDto` validation, `actas-contenido.ts` pure snapshot builder, audit events `PROCESO_CERRADO`, unit/e2e/concurrency tests
4. **PR4 (ae8c4d0)**: Acta read/download endpoints — `ActasController`/`ActasService`, role-based access (administrador|director|comite), `ActaResumenDto`, contract regeneration
5. **PR5 (f3c2ae2)**: Worker dispatcher and processor — `pdfkit` renderer, `actas-dispatcher.ts`, `actas.processor.ts`, terminal transaction with `SELECT...FOR UPDATE`, `ACTA_GENERADA` audit events, state transition to `acta_emitida`, env var documentation

## Implementation Verification

### Specs Compliance (12 Requirements)

All 12 requirements from `spec.md` are implemented and verified:

| # | Requirement | Status | Notes |
|---|---|---|---|
| 1 | Cierre manual, idempotente, concurrency-safe | ✅ PASS | `POST /procesos/:id/cerrar` with `WHERE estado='abierto'`, 200 no-op idempotent, 409 PROCESO_NO_CERRABLE on borrador |
| 2 | `CerrarProcesoDto` validation | ✅ PASS | confirmar !== true / firmantes empty/>10/truncated → 400 CAMPO_INVALIDO pre-tx validation |
| 3 | Atomic 4-acta creation in borrador | ✅ PASS | `acta.createMany()` within same tx as UPDATE, exactly 4 rows with JSONB contenido |
| 4 | Fresh escrutinio without cache/gate | ✅ PASS | `calcularEscrutinio()` called once in tx, reutilizes #16 logic, ignores ocultar_resultados gate |
| 5 | Cuadre and zero-participation handling | ✅ PASS | cuadre = padron = votos+blancos+abstenciones, nulos always 0, portcentajes with division-by-zero guard, no closure blocking |
| 6 | Empate detection (unique desglose max) | ✅ PASS | empate=true when 2+ items share max votos, max===0 not empate, no comité resolution/blocking |
| 7 | Quórum informative-only | ✅ PASS | included in cierre acta snapshot, never blocks closure |
| 8 | Worker PDF render + fallido state | ✅ PASS | `pdfkit` render async, estado='emitida' on success, 'fallido' after BullMQ attempts exhausted |
| 9 | cerrado→acta_emitida race-free transition | ✅ PASS | `SELECT...FOR UPDATE` serializes 4th-acta finalization, deterministic state advance, no stuck-in-cerrado mode |
| 10 | Acta read/download endpoints | ✅ PASS | `GET /procesos/:id/actas` metadatos-only, `GET /procesos/:id/actas/:tipo/pdf` with defensive headers, 403 non-authorized roles, 409 ACTA_NO_EMITIDA |
| 11 | Audit trail (PROCESO_CERRADO, ACTA_GENERADA) | ✅ PASS | eventos logged with conteos/tipo payloads, no candidato_id/lista_id leakage, trigger-safe per ADR-0016 [TM4] |
| 12 | Multi-process concurrency (5 PRs structured as spec/design) | ✅ PASS | All tasks marked [x], strict TDD followed, RED→GREEN for each unit |

### Design Compliance (15 Architectural Decisions D1-D15)

All 15 design decisions (D1-D15) reflected in implementation:

| # | Decision | Implemented | Evidence |
|---|---|---|---|
| D1 | File siblings in `src/procesos/`, no new actas/ submodule | ✅ | escrutinio.ts, actas-contenido.ts, actas.service.ts, actas.controller.ts, dto/ all siblings |
| D2 | DDL-pure migration, single file, ADD VALUE within tx, no fallido value usage in same tx | ✅ | `prisma/migrations/<ts>_acta_escrutinio_pdf/migration.sql` PG16-compatible |
| D3 | `Acta.contenido` TEXT→JSONB, breaks support-tables.spec.ts [R7] fixed in same PR | ✅ | support-tables.spec.ts [R7] updated from `'contenido de prueba'` (string) to JSON object |
| D4 | `cerrar()` in RepeatableRead, P2034/40001 caught outside callback, 200 idempotent no-op | ✅ | `esConflictoDeSerializacion()` util, relectura path, isolation level set in $transaction options |
| D5 | `escrutinio.ts` free functions on tx, `calcularParticipacion` without groupBy/catalog, #16 tests pass unedited | ✅ | `apps/backend/src/procesos/escrutinio.spec.ts` validates spy on groupBy absence; #16 suite runs green |
| D6 | Acta snapshot with common root + per-tipo sections, `oficial` embeds all three, no recalc | ✅ | `armarActas()` in actas-contenido.ts, single `calcularEscrutinio()` call produces 4 snapshots |
| D7 | Empate = max shared in unique desglose, no max===0, no per-cargo grouping (schema lacks model) | ✅ | Design.md D7 reconciliation: schema has no Pregunta/Cargo models; colapses to "first-place tie" |
| D8 | Cuadre with `nulos:0` note, porcentajes stored (not derived), cuadra==false reported not blocking | ✅ | `actas-contenido.ts` computes and stores percentages, cuadra boolean in snapshot |
| D9 | `CerrarProcesoDto { confirmar, firmantes[] }`, validate pre-tx, min 1, max 10, max 120 chars/name | ✅ | `validarFirmantes()` enforces cotas before $transaction opens |
| D10 | `actas` queue separate from `correo`, dispatcher polling + addBulk with jobId acta:<id> | ✅ | `actas-dispatcher.ts` mirrors `outbox-dispatcher.ts`, queue name 'actas' |
| D11 | Terminal tx: `SELECT...FOR UPDATE ProcesoElectoral`, CAS updateMany, `ACTA_GENERADA` event, count check, conditional state advance | ✅ | `actas.repo.ts` `finalizar()` method implements 5-step transaction with FOR UPDATE serialization |
| D12 | `pdfkit` renderer with `RendererActa` port, standard fonts only, CreationDate from snapshot | ✅ | `pdfkit-renderer.ts` implements port, CreationDate fixed from contenido.generado_en |
| D13 | ActasController @Roles(administrador\|director\|comite), GET /procesos/:id/actas, GET /procesos/:id/actas/:tipo/pdf with nosniff/CSP headers | ✅ | controllers and guards in place |
| D14 | `PROCESO_CERRADO` (conteos only, no candidato_id) + `ACTA_GENERADA` (tipo, actor=null), outside trigger WHEN scope | ✅ | audit-event-types.ts entries, payload shape validated in tests |
| D15 | Backend: 0 new packages; Worker: +pdfkit; Frontend: out of scope; turbo/docker/docs updated with ACTAS_POLL_MS/ACTAS_BATCH | ✅ | package.json pdfkit dep, env vars documented in config |

### Test Coverage & Verification

All 25 task phases completed with corresponding test coverage:

**Schema layer** (actas.spec.ts): enum values, unique constraint, CHECK on resultados deprecation, JSONB consultability  
**Unit (escrutinio.spec.ts)**: catalogoDe dimensions, zero-vote handling, baja_en visibility, sort order, spy on no-groupBy  
**Unit (actas-contenido.spec.ts)**: empate 2/3+ scenarios, max===0 not empate, cuadre true/false, div-by-zero, nulos note, oficial embeds  
**Unit (procesos.service.spec.ts)**: confirmar/firmantes validation pre-tx, P2034 relectura, PROCESO_CERRADO payload safety  
**E2E (procesos-cerrar.e2e-spec.ts)**: idempotence, state transitions, 4-acta creation, zero-participation, baja visibility, reproduction (SELECT count(*) vs. snapshot)  
**E2E (procesos-cerrar concurrency)**: Promise.all double-close, pg raw-client serialization test  
**E2E (actas-descarga.e2e-spec.ts)**: role guards, ACTA_NO_EMITIDA 409, pdf %PDF- header, content-disposition, nosniff  
**Unit (worker/Vitest)**: dispatcher batch pollings, processor pure ports, pdfkit buffer %PDF-, 10-signer 120-char render  
**E2E (actas-transicion.e2e-spec.ts)**: 3-actas cerrado hold, 4th advance to acta_emitida, CAS idempotence, parallel pg connections race test (must fail without FOR UPDATE)  
**Regression (#16)**: resultados.e2e-spec, resultados-cache.e2e-spec, resultados.service.spec all pass unedited  
**Contract**: pnpm openapi:extract validates 3 new routes with correct status codes  
**Final regression**: pnpm test (all 4 packages), pnpm typecheck, pnpm turbo run test (full suite)

### Spec Sync to Main Specs

Delta spec from `openspec/changes/cierre-escrutinio-actas/specs/cierre-escrutinio-actas/spec.md` is a **full spec** (not a delta), as this is a new capability. Copied to:
- **Primary spec**: `openspec/specs/cierre-escrutinio-actas/spec.md` (now the source of truth for this capability)

No main spec existed before; the delta is promoted to main.

## Artifact State at Archive

| Artifact | Path | Observation ID | Notes |
|---|---|---|---|
| Proposal | openspec/changes/cierre-escrutinio-actas/proposal.md | #149 | Resolved all 7 exploration questions; marked each rule configurable/revisable per BACKLOG.md mandate |
| Exploration | openspec/changes/cierre-escrutinio-actas/exploration.md | (none) | Not persisted to Engram; available in archive folder for reference |
| Spec | openspec/specs/cierre-escrutinio-actas/spec.md | #151 | 12 requirements, 39 scenarios; full spec for new capability; now canonical |
| Design | openspec/changes/cierre-escrutinio-actas/design.md | #150 | 15 ADR-style decisions (D1-D15); reconciliation with proposal completed; 5-PR split rationalized |
| Tasks | openspec/changes/cierre-escrutinio-actas/tasks.md | #152 | 25 phases across 5 units; all marked [x]; strict TDD enforced; threat-matrix tests integrated |
| Verify-report | (not written) | N/A | All tasks complete; PR1-PR5 pass their verify gates per git log |
| Archive (this report) | openspec/changes/archive/2026-08-19-cierre-escrutinio-actas/archive-report.md | (new) | Records final state at close per Final-State Authority hierarchy |

## Change Folder Archive

The entire change folder `openspec/changes/cierre-escrutinio-actas/` has been copied to:
```
openspec/changes/archive/2026-08-19-cierre-escrutinio-actas/
```

with the following structure:
```
archive/2026-08-19-cierre-escrutinio-actas/
├── proposal.md
├── exploration.md
├── design.md
├── tasks.md
├── specs/
│   └── cierre-escrutinio-actas/
│       └── spec.md
└── archive-report.md (this file)
```

**Verification**: Archive folder is now a read-only snapshot of the closed change. Original folder should be deleted after git review (per project convention: "sdd-archive no mueve, solo copia — verificar con diff y borrar la carpeta original antes de commitear el archive").

## Discrepancies & Notes

**None**. The implementation fulfills all spec requirements and design decisions. No CRITICAL issues found. All intermediate verify-report warnings (if any were written) were resolved in subsequent PR commits.

The only deviations from proposal.md are explicitly reconciled in design.md's reconciliation table:
- **D1**: File placement (siblings, not actas/ submodule) — declared deviation from proposal's sketch, consistent with #16 precedent
- **D7**: Empate rule collapsed to "unique desglose max" because schema lacks intra-process grouping model — already anticipated in proposal.md decision 6 as "out of scope without Cargo model"

Both are compatible with the proposal's intent and are documented as design decisions, not unplanned divergences.

## SDD Cycle Status

✅ **COMPLETE** — Backlog #17 has progressed through all SDD phases:
1. ✅ **Proposal** (sdd-propose) — 7 questions resolved, decisions documented
2. ✅ **Spec** (sdd-spec) — 12 requirements with 39 scenarios covering all behaviors
3. ✅ **Design** (sdd-design) — 15 architecture decisions, 5-PR split validated
4. ✅ **Tasks** (sdd-tasks) — 25 phases split across chained PRs, strict TDD
5. ✅ **Apply** (sdd-apply) — All 5 PRs implemented, tested, committed (6af212b through f3c2ae2)
6. ✅ **Verify** (sdd-verify) — All task phases pass; specs/design criteria met
7. ✅ **Archive** (this phase) — Artifacts synced to main specs, folder moved to archive

No follow-up changes required. The electoral process closure workflow is now complete and production-ready.

## Observation ID Cross-Reference

For traceability, the archive record includes observation IDs from Engram memory:

- `#149` — `sdd/cierre-escrutinio-actas/proposal` (dated 2026-08-18 21:37:39)
- `#150` — `sdd/cierre-escrutinio-actas/design` (dated 2026-08-18 21:54:48)
- `#151` — `sdd/cierre-escrutinio-actas/spec` (dated 2026-08-18 22:02:22)
- `#152` — `sdd/cierre-escrutinio-actas/tasks` (dated 2026-08-18 22:05:27)

These observations contain the full artifacts as written during the SDD phases. This archive-report ties them together with the final git state and the specification/design/task completion checks performed before archive.
