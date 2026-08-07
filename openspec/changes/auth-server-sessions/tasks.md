# Tasks: auth-server-sessions (Backlog #4 — Autenticación con sesión en servidor)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950-1150 (12 new files + 5 modified + schema/unit/integration/e2e tests, per design.md file table) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (credential foundation) → PR 2 (session infra: SessionService + guards) → PR 3 (wiring + orchestration + e2e) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `linux-x64-musl` binary spike for `@node-rs/argon2` under `node:22-alpine` | PR 1 | `pnpm --filter @seei/backend exec node -e "require('@node-rs/argon2')"` inside built image | `docker build -f backend.Dockerfile . && docker run --rm <img> pnpm exec node -e "require('@node-rs/argon2')"` | Revert `package.json` dep; fall back to `crypto.scrypt` design note |
| 2 | `password_hash` migration + `PasswordService` (argon2id, D3 constant-time/decoy hash) | PR 1 | `pnpm --filter @seei/backend test:schema -- usuario` \| `test -- password.service` | `test:schema` against real Postgres (`seei_migrator`) | `git revert` PR1; forward migration drops column if applied |
| 3 | `SessionService` (Redis STRING+SET, D1 sliding+absolute TTL, D4 concurrency, `revokeAllForUser`) | PR 2 | `pnpm --filter @seei/backend test -- session.service` | Redis from `docker-compose.test.yml` | `git revert` PR2; PR1 unaffected (no FK dependents) |
| 4 | `AuthGuard`/`RolesGuard`/`@Roles()`/`SesionUsuario` (D2, D8 order) | PR 2 | `pnpm --filter @seei/backend test -- auth.guard roles.guard` | Jest, `ExecutionContext` mock, no Redis | Same PR2 revert; guards unused until PR3 wires routes |
| 5 | `AuthModule`+`AuthController`+`AuthService` (D6 cookie, D7 audit-before-Redis) + audit-event-types + app.module wiring | PR 3 | `pnpm --filter @seei/backend test:e2e -- auth` | `test:e2e` (Prisma + Redis live) | `git revert` PR3; PR1/PR2 unaffected |
| 6 | Adversarial e2e suite (D3 uniform error, no-password-leak, double `revokeAllForUser`) + CI `openapi:extract` check | PR 3 | `pnpm --filter @seei/backend test:e2e -- auth` \| `pnpm openapi:extract` | `test:e2e` live; `openapi:extract` without Redis/Postgres (R10) | Delete spec files; no schema/runtime impact |

## PR 1 — Credential Foundation (base = feature/tracker branch)

### Phase 1: Dependency Risk Verification (D5, do first)
- [x] 1.1 Add `@node-rs/argon2` to `apps/backend/package.json`; run `pnpm install --frozen-lockfile`
      inside a `node:22-alpine`-based build (or `backend.Dockerfile`) and confirm the resolved package
      is `@node-rs/argon2-linux-x64-musl` with no compile step [design D5 risk]
- [x] 1.2 If musl binary fails to resolve: fall back to `crypto.scrypt` per design.md alternative,
      update D5 decision note, and re-scope PasswordService tasks below accordingly
      (N/A — musl binary resolved cleanly; see verification evidence below, no fallback needed)

### Phase 2: Schema
- [x] 2.1 Add `password_hash String?` to `Usuario` in `apps/backend/prisma/schema.prisma` [R1]
- [x] 2.2 Generate migration `<ts>_credencial_usuario` stacked after `append-only-audit-engine`
      (`20260807211246_credencial_usuario`, additive `ALTER TABLE "Usuario" ADD COLUMN "password_hash" TEXT`)
- [x] 2.3 RED: `test/schema/usuario.spec.ts` asserts `password_hash` column exists and is nullable —
      fails pre-migration [R1]
- [x] 2.4 GREEN 2.3 via 2.2's migration

### Phase 3: Password Hashing
- [x] 3.1 RED: `password.service.spec.ts` — `verificar()` against a fixed decoy hash returns false in
      roughly constant time (no early-return oracle) [design D3]
- [x] 3.2 Create `apps/backend/src/auth/password.service.ts`: argon2id
      `memoryCost=19456,timeCost=2,parallelism=1`, PHC-embedded salt, decoy-hash constant [D3][D5]
      — GREEN 3.1
- [x] 3.3 GREEN: correct password against a real hash verifies true; wrong password verifies false
- [x] 3.4 Modify `apps/backend/prisma/seed.ts` to set `password_hash` for the 5 seeded users from
      `SEED_PASSWORD`, idempotent, respecting existing production guard

## PR 2 — Session Infra (base = PR 1 branch)

### Phase 4: Session Types + SessionService
- [ ] 4.1 Create `apps/backend/src/auth/sesion-usuario.ts`: `SesionUsuario` interface +
      `Express.Request` augmentation
- [ ] 4.2 RED: `session.service.spec.ts` — `crear()` writes `session:{id}` (JSON, EX=1800) and adds to
      `session:user:{userId}` (SET, EXPIRE=28800) [R2][D4]
- [ ] 4.3 Create `apps/backend/src/auth/session.service.ts`: `crear/obtener/revocar/revokeAllForUser`
      over `REDIS_CLIENT` — GREEN 4.2
- [ ] 4.4 RED/GREEN: `obtener()` renews sliding TTL on each call and enforces the 28800s absolute
      ceiling from `creadoEn` regardless of renewal [D1]
- [ ] 4.5 RED/GREEN: `revocar()` deletes `session:{id}` and `SREM`s the user set
- [ ] 4.6 RED/GREEN: `revokeAllForUser` with 2+ active sessions leaves no `session:{id}` for that user
      [R8]
- [ ] 4.7 RED/GREEN: `revokeAllForUser` invoked twice does not throw (idempotent, orphan `DEL` is a
      no-op) [R8][adversarial]

### Phase 5: Guards + Decorator
- [ ] 5.1 Create `apps/backend/src/auth/roles.decorator.ts`: `ROLES_KEY` + `@Roles(...RolUsuario[])`
- [ ] 5.2 RED: `auth.guard.spec.ts` — request without cookie is rejected without reaching handler [R6a]
- [ ] 5.3 Create `apps/backend/src/auth/auth.guard.ts`: reads cookie → `SessionService.obtener()` →
      attaches `req.usuario` or 401; renews TTL — GREEN 5.2
- [ ] 5.4 RED/GREEN: cookie referencing a deleted/expired `session:{id}` is rejected [R6b]
- [ ] 5.5 RED: `roles.guard.spec.ts` — route with `@Roles('ROL_X')` and session `rol !== 'ROL_X'` is
      rejected without reaching handler [R7]
- [ ] 5.6 Create `apps/backend/src/auth/roles.guard.ts` — GREEN 5.5; no `@Roles()` metadata passes;
      metadata present without `req.usuario` throws 401 [D8]

## PR 3 — Wiring + Orchestration (base = PR 2 branch)

### Phase 6: Module + DTO
- [ ] 6.1 Create `apps/backend/src/auth/dto/login.dto.ts`: `LoginDto` (`codigo`, `password`) with
      `@ApiProperty`
- [ ] 6.2 Modify `apps/backend/src/auditoria/audit-event-types.ts`: add `LOGIN_EXITOSO`,
      `LOGIN_FALLIDO`, `LOGOUT` (additive; ADR-0016 trigger `WHEN` clause untouched)
- [ ] 6.3 Create `apps/backend/src/auth/auth.module.ts`: providers `PrismaService`, `redisProvider`,
      `SessionService`, `PasswordService`, `AuthService`; imports `AuditoriaModule`; `configure()`
      applies `cookieParser()` [D6]; add `cookie-parser`+`@types/cookie-parser` to `package.json`
- [ ] 6.4 Modify `apps/backend/src/app.module.ts` to register `AuthModule`
- [ ] 6.5 GREEN: `AppModule` still instantiates with no live Redis/Postgres connection at construction
      (D6/D9 — no eager connect) [R10]

### Phase 7: AuthService Orchestration (D7 — audit before Redis)
- [ ] 7.1 RED: `auth.service.spec.ts` (or e2e) — audit write failure inside `$transaction()` leaves no
      session key in Redis and no cookie issued [R9]
- [ ] 7.2 Create `apps/backend/src/auth/auth.service.ts`: `login()` — lookup `Usuario`, `verificar()`
      against decoy hash when absent, `$transaction` logging `LOGIN_EXITOSO`/`LOGIN_FALLIDO`, only on
      commit call `SessionService.crear()` — GREEN 7.1 [R9][D7]
- [ ] 7.3 RED/GREEN: valid credentials + `estado !== 'bloqueado'` create a `session:{id}` in Redis and
      return the session for cookie issuance [R2]
- [ ] 7.4 RED/GREEN: wrong password creates no session key and emits no cookie; audits exactly one
      `LOGIN_FALLIDO` row [R3a][R3b]
- [ ] 7.5 RED/GREEN: `estado === 'bloqueado'` with correct password is rejected, no session created
      [R4]
- [ ] 7.6 RED/GREEN: `logout()` deletes `session:{id}`, `SREM`s the user set, and audits exactly one
      `LOGOUT` row [R5]

### Phase 8: AuthController
- [ ] 8.1 Create `apps/backend/src/auth/auth.controller.ts`: `POST auth/login` (200 + `Set-Cookie
      seei_session`, httpOnly/sameSite=lax/no maxAge per D6), `POST auth/logout` (204, expires
      cookie), `@ApiOperation`/`@ApiResponse` per ADR-0004
- [ ] 8.2 Wire `AuthGuard`+`RolesGuard` on any route requiring both, verifying route-level (not
      global) registration [D8]

### Phase 9: Adversarial + Integration Verification
- [ ] 9.1 RED/GREEN: all four login-failure causes (inexistente, password ausente, password
      incorrecta, bloqueado) return identical `401 {"message":"Credenciales inválidas"}` [D3][adversarial]
- [ ] 9.2 RED/GREEN: no HTTP response body nor any `EventoAuditoria` payload contains the submitted
      password, across all login paths [adversarial]
- [ ] 9.3 `test/auth/*.e2e-spec.ts`: login OK, wrong password, nonexistent user, blocked user, logout,
      protected route without cookie, protected route with deleted session — one audit row per path
- [ ] 9.4 GREEN: `pnpm openapi:extract` completes with no Redis/Postgres connection error in CI [R10]
- [ ] 9.5 Run `test:schema` + `test` + `test:e2e -- auth` together; confirm no regression in existing
      suites (append-only-audit-engine, base-schema)
