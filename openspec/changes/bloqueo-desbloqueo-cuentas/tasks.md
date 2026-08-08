# Tasks: bloqueo-desbloqueo-cuentas (Backlog #6 — Bloqueo y desbloqueo de cuentas)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~260-300 / PR2 ~250-290 / PR3 ~270-310 (~800-900 total, per design.md file table + strict-TDD adversarial suite) |
| 400-line budget risk | Medium (per PR) / High (aggregate) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (foundation: migration + audit event types + env docs + `BloqueoService` counter/helpers) → PR 2 (auto-bloqueo wiring into `login()`/`loginConGoogle()`, D6/D7/D8) → PR 3 (desbloqueo manual + listado endpoints) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

Smaller than #5 (no OAuth-service scaffolding, no `EmailModule`): each of the 3 PRs is individually
estimated under the 400-line budget, unlike #3/#4/#5 which needed `size:exception` on at least one
PR. Still flagged Medium/High because #3-#5 consistently underestimated adversarial-test volume
(concurrency races, enumeration-oracle checks) required by Strict TDD. Predeclared contingency if
any PR measures over 400 authored lines at `sdd-apply` time: split PR2 into PR2a (`BloqueoService`
auto-bloqueo transaction, D2, unit+integration only) and PR2b (`AuthService` wiring D6/D7/D8 +
e2e/adversarial) — not adopted by default, follow the 3-PR plan below unless `sdd-apply` measures a
diff over budget.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `bloqueado_hasta` migration (D-schema) | PR 1 | `pnpm --filter @seei/backend test:schema -- usuario` | `test:schema` against real Postgres | `git revert` PR1; forward migration drops column if applied |
| 2 | `AUDIT_EVENT_TYPES` +2 keys, additive, ADR-0016 `WHEN` untouched | PR 1 | `pnpm --filter @seei/backend test:schema -- auditoria` | `test:schema` | `git revert` PR1; keys unused until PR2/PR3 |
| 3 | `BloqueoService` counter + `bloqueoVigente()` + `sanarBloqueoVencido()` (D1/D5/D7) | PR 1 | `pnpm --filter @seei/backend test -- bloqueo.service` | Jest + Redis from `docker-compose.test.yml` | `git revert` PR1; unused until PR2 |
| 4 | Env vars (`LOGIN_INTENTOS_MAX`/`_VENTANA_SEGUNDOS`/`LOGIN_BLOQUEO_SEGUNDOS`) | PR 1 | `pnpm openapi:extract` | N/A — config/docs only | `git revert` PR1 |
| 5 | Auto-bloqueo transaction (D2) + `AuthService` D6/D7/D8 wiring | PR 2 | `pnpm --filter @seei/backend test:e2e -- auth-bloqueo` | `test:e2e` (Prisma + Redis live) | `git revert` PR2; PR1 unaffected (unused helpers) |
| 6 | Concurrency adversarial suite for auto-bloqueo (D2) | PR 2 | `pnpm --filter @seei/backend test:e2e -- auth-bloqueo` | `test:e2e` live Redis+Postgres, `Promise.all` | `git revert` PR2; PR1 unaffected |
| 7 | `desbloquearManual()` + `POST auth/usuarios/:id/desbloquear` | PR 3 | `pnpm --filter @seei/backend test:e2e -- auth-desbloqueo` | `test:e2e` live Prisma + Redis | `git revert` PR3; PR1/PR2 unaffected |
| 8 | `listarBloqueados()` + `GET auth/usuarios/bloqueados` + `UsuarioBloqueadoDto` | PR 3 | `pnpm --filter @seei/backend test:e2e -- auth-desbloqueo` | `test:e2e` live Prisma | `git revert` PR3; PR1/PR2 unaffected |

## PR 1 — Foundation (base = feature/tracker branch)

### Phase 1: Schema — `bloqueado_hasta`
- [x] 1.1 Add `bloqueado_hasta DateTime? @db.Timestamptz(3)` to `Usuario` in
      `apps/backend/prisma/schema.prisma` [R1]
- [x] 1.2 Generate migration `<ts>_bloqueado_hasta_usuario`, additive nullable, stacked after
      `<ts>_google_id_usuario`
- [x] 1.3 RED: `test/schema/usuario.spec.ts` asserts `bloqueado_hasta` exists, nullable
      `timestamptz(3)` — fails pre-migration [R1]
- [x] 1.4 GREEN 1.3 via 1.2's migration

### Phase 2: Audit event types (additive)
- [x] 2.1 Modify `apps/backend/src/auditoria/audit-event-types.ts`: add `CUENTA_BLOQUEADA`,
      `CUENTA_DESBLOQUEADA` to `AUDIT_EVENT_TYPES`, additive only [R4][R6]
- [x] 2.2 GREEN: `test/schema/auditoria.spec.ts` confirms ADR-0016 trigger's `WHEN` clause still
      lists only `VOTO`/`RECHAZO`, unaffected by the two new keys [R4][R6]

### Phase 3: `BloqueoService` — counter and pure helpers (D1/D5/D7)
- [x] 3.1 RED: `registrarFallo()` on a real `Usuario` sets `login:intentos:{userId}` to `1` with
      TTL `INTENTOS_VENTANA_SEGUNDOS` (900) on the first fallo [R2]
- [x] 3.2 RED: repeated `registrarFallo()` calls increment without resetting the TTL (fixed, not
      sliding, window) [R2][D1]
- [x] 3.3 RED: when no accountable `Usuario` exists, `registrarFallo(null, codigo, motivo)` writes
      to `login:intentos:anon:{sha256(codigo.trim().toLowerCase()).slice(0,32)}` using the exact
      same `SET NX` + `INCR` pair, never a real `login:intentos:{userId}` key [D1][adversarial]
- [x] 3.4 RED: `resetearIntentos(userId)` issues `DEL login:intentos:{userId}` and is a no-op when
      the key does not exist [R2]
- [x] 3.5 RED: `registrarFallo()`/`resetearIntentos()` never throw when Redis is unreachable
      (`.catch(() => undefined)`) [D5][adversarial]
- [x] 3.6 Create `apps/backend/src/auth/bloqueo.service.ts`: `registrarFallo(usuario, codigo,
      motivo)`, `resetearIntentos(userId)` — GREEN 3.1-3.5 [R2][D1][D5]
- [x] 3.7 RED: `bloqueoVigente(usuario)` — `true` only when `estado==='bloqueado'` and
      (`bloqueado_hasta===null` or `bloqueado_hasta` in the future); `false` for `estado!=='bloqueado'`
      regardless of `bloqueado_hasta` [D7]
- [x] 3.8 Add exported pure function `bloqueoVigente()` to `bloqueo.service.ts` — GREEN 3.7 [D7]
- [x] 3.9 RED: `sanarBloqueoVencido(tx, usuario)` — `updateMany({estado:'bloqueado',
      bloqueado_hasta:{lt: now}}) → activo/null`; audits `CUENTA_DESBLOQUEADA` with `actor: null`,
      `motivo: 'expiracion_automatica'` only when `count===1`; no-op when `bloqueado_hasta` still
      future or row already `activo` [R5][D6]
- [x] 3.10 Add `sanarBloqueoVencido(tx, usuario)` to `bloqueo.service.ts` — GREEN 3.9 [R5][D6]

### Phase 4: Env wiring
- [x] 4.1 Modify `turbo.json`: `test:e2e.env` += `LOGIN_INTENTOS_MAX`,
      `LOGIN_INTENTOS_VENTANA_SEGUNDOS`, `LOGIN_BLOQUEO_SEGUNDOS`
- [x] 4.2 Modify `README.md` / `docs/onboarding.md`: document the three variables alongside
      `SESSION_TTL_SECONDS`/`RECOVERY_TTL_SECONDS`
- [x] 4.3 GREEN: `pnpm openapi:extract` still completes with no Postgres/Redis connection

## PR 2 — Auto-bloqueo Wiring (base = PR 1 branch)

### Phase 5: Auto-bloqueo transaction (D2)
- [x] 5.1 RED: 4 fallos vigentes + 1 fallo más ⇒ `Usuario.estado` becomes `'bloqueado'`,
      `bloqueado_hasta ≈ now + BLOQUEO_SEGUNDOS`, exactly one `CUENTA_BLOQUEADA` row, and
      `SessionService.revokeAllForUser` leaves no `session:{id}` key for that user [R4]
- [x] 5.2 RED: `Usuario` with `estado==='inactivo'` reaching 5 fallos does NOT transition to
      `'bloqueado'` (`updateMany({where:{estado:'activo'}})`, not `not:'bloqueado'`) [D2][adversarial]
- [x] 5.3 RED: two concurrent requests that each produce the 5th fallo for the same user result in
      exactly one `CUENTA_BLOQUEADA` row and `estado==='bloqueado'` exactly once [D2][adversarial]
- [x] 5.4 Add auto-bloqueo transaction to `bloqueo.service.ts`: `tx.usuario.updateMany({where:{id,
      estado:'activo'}, data:{estado:'bloqueado', bloqueado_hasta}})`, audit `CUENTA_BLOQUEADA` only
      when `count===1`, called from `registrarFallo()` once `intentos >= INTENTOS_MAX`, followed by
      `revokeAllForUser` only when `count===1` — GREEN 5.1-5.3 [R4][D2]
- [x] 5.5 RED: 4 fallos + 1 éxito + 4 fallos más ⇒ account does NOT bloquear (counter reset by the
      intervening success) [R2]

### Phase 6: `AuthService` wiring — D6/D7/D8
- [x] 6.1 RED: `login()` against `estado==='bloqueado'` with `bloqueado_hasta` in the past does NOT
      reject for bloqueo cause and continues evaluating the password [R5][S3]
- [x] 6.2 RED: same precondition, wrong password ⇒ rejected for password cause (not bloqueo), and
      the fallo counter increments [R5]
- [x] 6.3 RED: same precondition, correct password ⇒ session created, and `Usuario.estado` ends
      `'activo'` with `bloqueado_hasta===null` (D6 sanación inside the `LOGIN_EXITOSO` transaction)
      [R5][D6]
- [x] 6.4 RED: `estado==='bloqueado'` with `bloqueado_hasta` still future ⇒ rejected regardless of
      password correctness, no session created [S3]
- [x] 6.5 Modify `apps/backend/src/auth/auth.service.ts`: replace `usuario.estado==='bloqueado'`
      guard in `login()` with `bloqueoVigente(usuario)`; call `sanarBloqueoVencido(tx, usuario)`
      inside the existing `LOGIN_EXITOSO` transaction — GREEN 6.1-6.4 [R5][D6][D7]
- [x] 6.6 RED: after `LOGIN_FALLIDO` audit and before the `401` throw, `registrarFallo()` is invoked
      with the real key when `motivo==='password_incorrecta' && usuario!==null &&
      !bloqueoVigente(usuario)`, and with the señuelo key otherwise [S2][D1][D8]
- [x] 6.7 RED: after the `LOGIN_EXITOSO` transaction commits and before `sessionService.crear()`,
      `resetearIntentos(usuario.id)` runs (`DEL`) [S1][D8]
- [x] 6.8 Wire 6.6/6.7's exact call sites into `login()` — GREEN 6.6-6.7 [S1][S2][D8]
- [x] 6.9 RED: `loginConGoogle()` against `bloqueoVigente(usuario)===true` is rejected the same as
      `login()`; against an expired `bloqueado_hasta` is NOT rejected for bloqueo cause, and its
      success transaction also sanea via `sanarBloqueoVencido(tx, usuario)` [D7][adversarial]
- [x] 6.10 Modify `loginConGoogle()`: replace its `estado==='bloqueado'` guard with
      `bloqueoVigente(usuario)`, add `sanarBloqueoVencido(tx, usuario)` to its success transaction —
      GREEN 6.9 [D7]
- [x] 6.11 RED: 5 rejected OAuth logins for the same `Usuario` do NOT increment
      `login:intentos:{userId}` (no accountable password fallo) [R3][adversarial]
- [x] 6.12 GREEN 6.11: confirm `loginConGoogle()`'s rejection paths never call `registrarFallo()`
      [R3]
- [x] 6.13 Modify `apps/backend/src/auth/auth.module.ts`: register `BloqueoService` in `providers`,
      inject into `AuthService`
- [x] 6.14 Unit regression: `determinarMotivoFallo()` unchanged in signature/body — no new motivo
      values introduced by this change [D4]

### Phase 7: End-to-end
- [x] 7.1 `test/auth/auth-bloqueo.e2e-spec.ts`: 5th fallo bloqueo, expired-bloqueo continues (password
      and Google), still-vigente bloqueo rejects both, counter reset on success, `inactivo` immune to
      auto-bloqueo
- [x] 7.2 GREEN: `pnpm openapi:extract` completes with no live Postgres/Redis connection

## PR 3 — Desbloqueo Manual + Listado (base = PR 2 branch)

### Phase 8: `desbloquearManual()` (D2-style guard, actor = comité)
- [ ] 8.1 RED: `desbloquearManual(id, comiteUserId)` on `estado==='bloqueado'` resets `estado` to
      `'activo'`, `bloqueado_hasta` to `null`, audits exactly one `CUENTA_DESBLOQUEADA` with
      `actor_usuario_id===comiteUserId`, `motivo:'manual_comite'`, then `revokeAllForUser` leaves no
      `session:{id}` key for that user [R6]
- [ ] 8.2 RED: `desbloquearManual()` on a `Usuario` already `estado==='activo'` is idempotent —
      `desbloqueado:false`, no audit row, no `revokeAllForUser` call [D2-analog]
- [ ] 8.3 RED: two concurrent `desbloquearManual()` calls for the same bloqueado user result in
      exactly one `CUENTA_DESBLOQUEADA` row [adversarial]
- [ ] 8.4 RED: `desbloquearManual()` with a nonexistent `id` returns a not-found signal without
      writing any row
- [ ] 8.5 Add `desbloquearManual(id, actorUserId)` to `bloqueo.service.ts`: `$transaction`
      `findUnique` → not found signal, `updateMany({where:{id, estado:'bloqueado'}, data:{estado:
      'activo', bloqueado_hasta:null}})`, audit only when `count===1`, `revokeAllForUser` after
      commit only when `count===1` — GREEN 8.1-8.4 [R6]

### Phase 9: `listarBloqueados()`
- [ ] 9.1 RED: `listarBloqueados()` returns only rows with `estado==='bloqueado'`, each exposing
      exactly `id`, `nombres`, `dni`, `codigo`, `bloqueado_hasta`, ordered by `[bloqueado_hasta desc,
      codigo asc]` [R7]
- [ ] 9.2 RED: a row with `estado==='bloqueado'` and `bloqueado_hasta` already in the past still
      appears (no filtering on vencimiento) [R7]
- [ ] 9.3 Add `listarBloqueados()` to `bloqueo.service.ts`: `findMany({where:{estado:'bloqueado'},
      select:{id,nombres,dni,codigo,bloqueado_hasta}, orderBy:[{bloqueado_hasta:'desc'},
      {codigo:'asc'}]})` — GREEN 9.1-9.2 [R7]

### Phase 10: `AuthController` — bloqueo routes
- [ ] 10.1 Create `apps/backend/src/auth/dto/usuario-bloqueado.dto.ts`: `UsuarioBloqueadoDto`
      (`id`, `nombres`, `dni`, `codigo`, `bloqueado_hasta: string | null`) with `@ApiProperty`, no
      `class-validator`
- [ ] 10.2 Modify `apps/backend/src/auth/auth.controller.ts`: `GET auth/usuarios/bloqueados`
      (`AuthGuard`, `RolesGuard`, `@Roles('comite')`) returning `200 UsuarioBloqueadoDto[]` (bare
      array) [R7]
- [ ] 10.3 Modify `auth.controller.ts`: `POST auth/usuarios/:id/desbloquear` (`:id` via
      `ParseUUIDPipe`, no body, same guards) returning `200 { desbloqueado: boolean }` /
      `404 'Usuario no encontrado'` [R6]
- [ ] 10.4 RED: a role other than `comite` on either route is rejected by `RolesGuard` before the
      handler runs, with no state change [R6][R7]
- [ ] 10.5 GREEN 10.4 already covered by existing `RolesGuard`; add route-specific e2e assertions
      [R6][R7]
- [ ] 10.6 RED: `POST auth/usuarios/:id/desbloquear` with a malformed `:id` returns `400`, never
      `500` from a Prisma `P2023` [adversarial]

### Phase 11: End-to-end + full regression
- [ ] 11.1 `test/auth/auth-desbloqueo.e2e-spec.ts`: manual desbloqueo success, idempotent
      already-active desbloqueo, concurrent desbloqueo, role !=='comite' rejection on both routes,
      malformed/nonexistent `:id`, listado field-shape and ordering, listado includes vencido rows
- [ ] 11.2 GREEN: `pnpm openapi:extract` completes with no live Postgres/Redis connection
- [ ] 11.3 Run `test:schema` + `test` + `test:e2e -- auth` together across PR1+PR2+PR3; confirm no
      regression in `append-only-audit-engine`, `auth-server-sessions`, or `google-oauth-y-recuperacion`
      suites
