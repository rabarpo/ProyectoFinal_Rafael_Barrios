# Tasks: google-oauth-y-recuperacion (Backlog #5 — Google OAuth de dominio y recuperación)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~230-260 / PR2 ~430-480 / PR3 ~500-560 (per design.md file table; ~1200-1300 total) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (foundation: ADR-0017 + `google_id` migration + `EmailModule` + audit event types) → PR 2 (Google OAuth login, D2/D3) → PR 3 (recovery flow, D4/D5/D6/D7) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

PR 2 and PR 3 both individually risk exceeding the 400-line budget once schema/unit/integration/e2e
tests are counted (D3's 8-state machine and D5's atomic-consume-with-compensation each carry a wide
adversarial test matrix per design.md "Estrategia de pruebas"). Predeclared contingency if either
exceeds 400 authored lines at `sdd-apply` time: split PR2 into PR2a (`GoogleOauthService` +
`GOOGLE_OAUTH_CLIENT` provider, D2, unit-only) and PR2b (`AuthService.loginConGoogle` + controller
route + e2e, D3); split PR3 into PR3a (`solicitar()`, D7 request leg) and PR3b (`confirmar()` +
`revokeAllForUser` + D6 confirmation email, D7 confirm leg) — not adopted by default, follow the
3-PR plan below unless `sdd-apply` measures a diff over budget.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | ADR-0017 (D1) | PR 1 | N/A — doc only | N/A | `git revert` PR1; no runtime effect |
| 2 | `google_id` migration (additive, nullable, unique) | PR 1 | `pnpm --filter @seei/backend test:schema -- usuario` | `test:schema` against real Postgres (`seei_migrator`) | `git revert` PR1; forward migration drops column if applied |
| 3 | `EmailModule` (`EMAIL_SENDER`, `ConsoleEmailSender`, `SmtpEmailSender`, lazy factory, D8) | PR 1 | `pnpm --filter @seei/backend test -- email` | Jest, no live SMTP required (`ConsoleEmailSender` default) | `git revert` PR1; unused until PR3 wires it |
| 4 | `AUDIT_EVENT_TYPES` +4 keys, additive, ADR-0016 `WHEN` untouched | PR 1 | `pnpm --filter @seei/backend test:schema -- auditoria` | `test:schema` | `git revert` PR1; keys unused until PR2/PR3 |
| 5 | `GoogleOauthService` + `GOOGLE_OAUTH_CLIENT` provider (D2, fail-closed) | PR 2 | `pnpm --filter @seei/backend test -- google-oauth.service` | Jest with `OAuth2Client` mock, no network | `git revert` PR2; PR1 unaffected |
| 6 | `AuthService.loginConGoogle` — D3's 8-state machine + `POST auth/google` | PR 2 | `pnpm --filter @seei/backend test:e2e -- auth-google` | `test:e2e` (Prisma + Redis live, `overrideProvider(GOOGLE_OAUTH_CLIENT)`) | `git revert` PR2; PR1 unaffected (additive column, unused route) |
| 7 | `RecoveryService.solicitar()` (D5 issue leg, D7 request leg, uniform response) | PR 3 | `pnpm --filter @seei/backend test -- recovery.service` \| `test:e2e -- auth-recovery` | Redis from `docker-compose.test.yml` | `git revert` PR3; PR1/PR2 unaffected |
| 8 | `RecoveryService.confirmar()` (D5 atomic consume + compensation, D7 confirm leg, D6 best-effort notice) + adversarial suite | PR 3 | `pnpm --filter @seei/backend test:e2e -- auth-recovery` | `test:e2e` live Redis+Postgres | `git revert` PR3; delete spec files, no schema impact |

## PR 1 — Foundation (base = feature/tracker branch)

### Phase 1: ADR-0017 (D1)
- [x] 1.1 Create `adrs/0017-acceso-google-dominio-institucional.md` (Aceptado): fija (a) verificación
      manual del ID token en vez de `passport-google-oauth20`, (b) restricción por claim `hd` contra
      lista permitida, (c) sin auto-provisión de cuentas, (d) vinculación de cuenta con contraseña
      exige confirmarla, (e) la lista de dominios vive en env var hasta que #10 la persista en
      `Configuracion` — contenido y fundamento verbatim de design.md D1 [D1]

### Phase 2: Schema — `google_id`
- [x] 2.1 Add `google_id String? @unique` to `Usuario` in `apps/backend/prisma/schema.prisma` [R1]
- [x] 2.2 Generate migration `<ts>_google_id_usuario`, additive, stacked after
      `auth-server-sessions`'s credential migration
- [x] 2.3 RED: `test/schema/usuario.spec.ts` asserts `google_id` column exists as nullable `String`
      with a unique constraint — fails pre-migration [R1]
- [x] 2.4 GREEN 2.3 via 2.2's migration

### Phase 3: `EmailModule` (D8)
- [x] 3.1 RED: `email-sender.spec.ts` — `ConsoleEmailSender.send()` logs only destinatario+asunto,
      never the cuerpo (contains the token in real usage) [D8]
- [x] 3.2 Create `apps/backend/src/email/email-sender.ts` (`EMAIL_SENDER` token, `EmailSender`
      interface) and `apps/backend/src/email/console-email-sender.ts` — GREEN 3.1 [R10]
- [x] 3.3 RED: `smtp-email-sender.spec.ts` — construction does not open a socket (no `verify()` call
      in constructor); `send()` invokes `createTransport(...).sendMail()` lazily [D8]
- [x] 3.4 Create `apps/backend/src/email/smtp-email-sender.ts` (nodemailer, no `pool`, no eager
      `verify()`) — GREEN 3.3 [R10]
- [x] 3.5 Create `apps/backend/src/email/email.module.ts`: factory provider for `EMAIL_SENDER` —
      `SmtpEmailSender` when `SMTP_HOST` is set, else `ConsoleEmailSender`; add
      `nodemailer`+`@types/nodemailer` and `google-auth-library` to `apps/backend/package.json`
- [x] 3.6 GREEN: no row is ever created in `JobCorreo`/`Notificacion` by `EmailModule` (assert by
      absence of any Prisma call to those models in the module — static/code-review check plus a
      guard test instantiating the module without a Prisma client) [R10]

### Phase 4: Audit event types (additive)
- [x] 4.1 Modify `apps/backend/src/auditoria/audit-event-types.ts`: add `LOGIN_OAUTH_EXITOSO`,
      `LOGIN_OAUTH_FALLIDO`, `RECUPERACION_SOLICITADA`, `RECUPERACION_COMPLETADA` to
      `AUDIT_EVENT_TYPES`, additive only [R11]
- [x] 4.2 GREEN: `test/schema/auditoria.spec.ts` (or equivalent) inspects the ADR-0016 trigger's
      `WHEN` clause and confirms it still lists only `VOTO`/`RECHAZO`, unaffected by the four new
      keys [R11]

### Phase 5: Env wiring
- [x] 5.1 Modify `turbo.json`: `test:e2e.env` += `GOOGLE_CLIENT_ID`, `GOOGLE_HOSTED_DOMAINS`,
      `RECOVERY_TTL_SECONDS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`,
      `APP_BASE_URL`
- [x] 5.2 Modify `README.md` / `docs/onboarding.md`: document the new variables alongside
      `REDIS_URL`/`DATABASE_URL`
- [x] 5.3 GREEN: `pnpm openapi:extract` still completes with no Postgres/Redis/SMTP/`GOOGLE_CLIENT_ID`
      connection (lazy providers preserved, per D2/D8 fail-closed-at-request-time, not at
      `onModuleInit`)

## PR 2 — Google OAuth Login (base = PR 1 branch)

### Phase 6: `GoogleOauthService` (D2, fail-closed)
- [ ] 6.1 RED: `google-oauth.service.spec.ts` — `GOOGLE_CLIENT_ID` or `GOOGLE_HOSTED_DOMAINS` unset
      or empty ⇒ every `verificar()` call rejects at request time (no exception thrown at
      construction/`onModuleInit`) [R2][D2]
- [ ] 6.2 RED: token with `hd` absent is rejected (personal `@gmail.com` accounts must not pass)
      [R2][D2]
- [ ] 6.3 RED: token with `hd` present but not in `GOOGLE_HOSTED_DOMAINS` (normalized
      `trim().toLowerCase()`) is rejected [R2][D2]
- [ ] 6.4 RED: token with `email_verified === false` is rejected [R2][D2]
- [ ] 6.5 RED: token with `aud !== GOOGLE_CLIENT_ID` (audience mismatch) is rejected [R2][D2]
- [ ] 6.6 Create `apps/backend/src/auth/google-oauth.provider.ts` (`GOOGLE_OAUTH_CLIENT` token,
      `OAuth2Client`, substitutable via `overrideProvider` in tests)
- [ ] 6.7 Create `apps/backend/src/auth/google-oauth.service.ts`: `verificar(idToken)` calling
      `verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID })`, validating `email_verified`, `hd`
      membership, returning the validated payload — GREEN 6.1-6.5 [R2][D2]
- [ ] 6.8 GREEN: a syntactically valid but signature-invalid token is rejected without reaching the
      domain checks (library-level rejection surfaces as the same uniform failure) [R2]

### Phase 7: `AuthService.loginConGoogle` — D3 state machine
- [ ] 7.1 RED: correo not matching any `Usuario` ⇒ uniform `401`, no `Usuario` created, audits
      `LOGIN_OAUTH_FALLIDO` `{ correo, motivo: 'usuario_inexistente' }` [R3][D3#1]
- [ ] 7.2 RED: `estado === 'bloqueado'` ⇒ uniform `401`, audits `LOGIN_OAUTH_FALLIDO`
      `motivo: 'usuario_bloqueado'` [D3#2]
- [ ] 7.3 RED: `google_id === sub` (already linked) ⇒ session + cookie without requiring `password`
      in the body, audits `LOGIN_OAUTH_EXITOSO` `vinculacion: 'ya_vinculada'` [R4][R5][D3#3]
- [ ] 7.4 RED: `google_id === null && password_hash === null` (TOFU, case 4) ⇒ links `google_id` +
      creates session, audits `…_EXITOSO` `vinculacion: 'primer_uso'` [R4][D3#4]
- [ ] 7.5 RED: `google_id === null`, `password_hash` present, no `password` in body ⇒ `409
      { codigo: 'VINCULACION_REQUERIDA' }`, no session, no linking, audits `LOGIN_OAUTH_FALLIDO`
      `motivo: 'vinculacion_requerida'` [R4][D3#5]
- [ ] 7.6 RED: same precondition as 7.5, correct `password` supplied ⇒ links `google_id` + creates
      session, audits `…_EXITOSO` `vinculacion: 'password_confirmada'` [R4][D3#6]
- [ ] 7.7 RED: same precondition as 7.5, incorrect `password` ⇒ uniform `401`, audits
      `LOGIN_OAUTH_FALLIDO` `motivo: 'password_incorrecta'` [R4][D3#7]
- [ ] 7.8 RED: `google_id !== null && !== sub`, or `sub` already linked to a **different** `Usuario`
      ⇒ uniform `401` (not a `500` from `P2002`), audits `LOGIN_OAUTH_FALLIDO`
      `motivo: 'google_id_conflicto'` [D3#8][adversarial]
- [ ] 7.9 Modify `apps/backend/src/auth/auth.service.ts`: add `loginConGoogle(idToken, password?)`
      implementing D3's 8-state table — GREEN 7.1-7.8 [R2][R3][R4][R5][D3]
- [ ] 7.10 RED: audit write failure inside the `$transaction()` for any of the `…_EXITOSO` branches
      leaves no `session:{id}` key in Redis and no cookie issued [R9][D7]
- [ ] 7.11 GREEN 7.10 via transaction ordering: `$transaction(log + UPDATE google_id when linking)`
      commits before `SessionService.crear(userId, rol, sessionId)` runs, `sessionId` pre-generated
      [R9][D7]

### Phase 8: `AuthController` — `POST auth/google`
- [ ] 8.1 Create `apps/backend/src/auth/dto/google-login.dto.ts`: `GoogleLoginDto`
      (`idToken: string`, `password?: string`) with `@ApiProperty`, manual validation (no
      `class-validator` installed)
- [ ] 8.2 Modify `apps/backend/src/auth/auth.controller.ts`: `POST auth/google` — `200` + cookie
      `seei_session` / `401 { message: 'Credenciales inválidas' }` / `409 { codigo:
      'VINCULACION_REQUERIDA' }`, `@ApiOperation`/`@ApiResponse`
- [ ] 8.3 Modify `apps/backend/src/auth/auth.module.ts`: import `EmailModule`, register
      `GoogleOauthService` + `GOOGLE_OAUTH_CLIENT` provider
- [ ] 8.4 `test/auth/auth-google.e2e-spec.ts`: exercise the 8 states of D3 end to end using
      `overrideProvider(GOOGLE_OAUTH_CLIENT)` with a stub client, asserting response code/body,
      Redis session presence/absence, `Usuario.google_id`, and exactly one audit row per path
- [ ] 8.5 RED/GREEN (adversarial): no HTTP response body, log line, or `EventoAuditoria` payload
      across any OAuth login path contains the raw ID token or the submitted `password` [adversarial]
- [ ] 8.6 GREEN: `pnpm openapi:extract` still completes with no live Google/Postgres/Redis connection
      [R2][D2]

## PR 3 — Recovery Flow (base = PR 2 branch)

### Phase 9: `RecoveryService.solicitar()` (D5 issue leg, D7 request leg)
- [ ] 9.1 RED: existing correo ⇒ `SET recovery:{token} EX RECOVERY_TTL_SECONDS` (default 1800) with
      the `userId` as the value, uniform `202` response, `EmailSender.send()` invoked without
      blocking the response [R6][D4][D5]
- [ ] 9.2 RED: nonexistent correo ⇒ identical `202` body and status as 9.1, and **no**
      `recovery:{token}` key created in Redis [R6][adversarial]
- [ ] 9.3 RED: `AuditoriaService.log(tx, 'RECUPERACION_SOLICITADA', ...)` runs inside its own
      `$transaction()` on **both** paths (existing and nonexistent correo), before the `SET` to Redis
      — `usuario_id: null` and `{ correo, emitido: false }` when the correo does not exist [R9][D7]
- [ ] 9.4 RED: a second `solicitar()` call for the same `userId` within 60s (`recovery:cooldown:
      {userId}` `SET NX EX 60`) does not emit a new token or a new email, but still returns the same
      uniform `202` [D5][adversarial]
- [ ] 9.5 Create `apps/backend/src/auth/recovery.service.ts`: `solicitar(correo)` — `findUnique`,
      `$transaction(log RECUPERACION_SOLICITADA)` always, cooldown check, `SET recovery:{token} EX
      RECOVERY_TTL_SECONDS`, `EmailSender.send()` fire-and-forget with `.catch()` — GREEN 9.1-9.4
      [R6][R9][D4][D5][D7]
- [ ] 9.6 GREEN: no `EventoAuditoria` payload for `RECUPERACION_SOLICITADA` ever contains the
      recovery token [adversarial]

### Phase 10: `RecoveryService.confirmar()` (D5 atomic consume + compensation, D7 confirm leg)
- [ ] 10.1 RED: valid `recovery:{token}` ⇒ `multi().ttl(k).getdel(k).exec()` resolves `userId`
      atomically; two concurrent `confirmar()` calls with the same token result in exactly one
      successful confirmation and exactly one `RECUPERACION_COMPLETADA` audit row [R8][D5][adversarial]
- [ ] 10.2 RED: token not present in Redis (already used or expired) ⇒ confirmation rejected with
      uniform `400 { message: 'Enlace inválido o expirado' }`, `password_hash` unchanged [R8]
- [ ] 10.3 RED: token confirmed once, reused a second time with the same token ⇒ rejected, no change
      to `password_hash` [R8][D5]
- [ ] 10.4 RED: password shorter than 8 characters ⇒ rejected with the same uniform `400`, no Redis
      mutation, no transaction started
- [ ] 10.5 RED: `Usuario` with `google_id` linked and `password_hash === null` (solo-OAuth) ⇒
      `confirmar()` sets `password_hash` for the first time via the same code path as a reset,
      response indistinguishable from the reset-with-existing-hash case [R7]
- [ ] 10.6 RED: audit write failure inside the `$transaction(UPDATE password_hash + log
      RECUPERACION_COMPLETADA)` triggers rollback ⇒ token is **not** deleted from Redis (compensating
      `SET k userId EX max(ttlRestante,1)` restores it), `password_hash` unchanged, sessions not
      revoked [R9][D7][adversarial]
- [ ] 10.7 Create/extend `apps/backend/src/auth/recovery.service.ts`: `confirmar(token, password)` —
      `multi().ttl().getdel()`, `PasswordService.hash()` outside the transaction,
      `$transaction(UPDATE password_hash + log RECUPERACION_COMPLETADA)`, compensation `SET` on
      transaction failure — GREEN 10.1-10.6 [R7][R8][R9][D5][D7]
- [ ] 10.8 RED: successful confirmation calls `SessionService.revokeAllForUser(userId)` and leaves no
      `session:{id}` key for that user in Redis [R8]
- [ ] 10.9 GREEN 10.8 wired into `confirmar()` after the transaction commit, before the D6
      confirmation email [R8][D7]
- [ ] 10.10 RED/GREEN: confirmation dispatches a best-effort D6 notice (no token, no password) via
      `EmailSender.send()` without `await`, wrapped in `.catch()`; its failure does not alter the
      `204` response or revert any prior effect [D6]

### Phase 11: `AuthController` — recovery routes
- [ ] 11.1 Create `apps/backend/src/auth/dto/recovery-request.dto.ts` (`RecoveryRequestDto`:
      `correo: string`) and `apps/backend/src/auth/dto/recovery-confirm.dto.ts`
      (`RecoveryConfirmDto`: `token: string`, `password: string`), manual validation, `@ApiProperty`
- [ ] 11.2 Modify `apps/backend/src/auth/auth.controller.ts`: `POST auth/recovery` (`202 { mensaje:
      'Si el correo corresponde a una cuenta, se envió un enlace' }`), `POST auth/recovery/confirm`
      (`204` / `400 { message: 'Enlace inválido o expirado' }`), `@ApiOperation`/`@ApiResponse`
- [ ] 11.3 Modify `apps/backend/src/auth/auth.module.ts`: register `RecoveryService`

### Phase 12: End-to-end + full regression
- [ ] 12.1 `test/auth/auth-recovery.e2e-spec.ts`: solicitud with existing correo (token created,
      email dispatched, `202`), solicitud with nonexistent correo (identical `202`, no token),
      confirm with valid/used/expired token, first password on solo-OAuth account, session
      revocation, one audit row per path
- [ ] 12.2 GREEN: `pnpm openapi:extract` completes with no live Postgres/Redis/SMTP connection [R10]
- [ ] 12.3 Run `test:schema` + `test` + `test:e2e -- auth` together across PR1+PR2+PR3; confirm no
      regression in `append-only-audit-engine` or `auth-server-sessions` suites
