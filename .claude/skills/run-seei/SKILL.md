---
name: run-seei
description: Build, run, and smoke-test the SEEI stack (Caddy + frontend + backend + worker + Postgres + Redis). Use when asked to start SEEI, run the dev stack, run e2e tests, or check that a change works in the real app.
---

Drive it via `.claude/skills/run-seei/driver.sh` (Git Bash) — it wraps `docker compose`
and, on Windows, works around the port-80 reservation issue by running Caddy in its
own container on 8080/8443 instead. All paths below are relative to the repo root.

## Prerequisites

- Docker Desktop (or equivalent with `docker compose` v2) running.
- pnpm `11.20.0` (`packageManager` in root `package.json`; `corepack enable` picks it up).
- Node.js `>=20`.
- Git Bash if you're on Windows — the driver is a bash script and relies on Git Bash's
  path handling quirks being controllable via `MSYS_NO_PATHCONV`.

## Setup

```bash
pnpm install
cp infra/docker/.env.example infra/docker/.env   # only if infra/docker/.env doesn't exist yet
```

`infra/docker/.env` needs at minimum `POSTGRES_PASSWORD`, `SEEI_MIGRATOR_PASSWORD`,
`SEEI_APP_PASSWORD`. Everything else (Google OAuth, SMTP, lockout tuning, outbox worker)
is optional in development — see `docs/onboarding.md` for the full table.

## Build

No separate build step for local dev — `docker compose` builds the `backend`/`worker`/`frontend`
images on first `up`. If you change `apps/backend/prisma/schema.prisma`, see Gotchas below
before assuming a plain `up` picks it up.

## Run (agent path)

```bash
bash .claude/skills/run-seei/driver.sh up      # brings the stack up
bash .claude/skills/run-seei/driver.sh smoke   # curls /api/health and / , fails loudly if either is wrong
bash .claude/skills/run-seei/driver.sh down    # tears everything down cleanly, including the manual Caddy container
```

| command | what it does |
|---|---|
| `up` | `docker compose up -d` for postgres/redis/migrate/backend/worker/frontend, waits for backend+frontend to report `healthy`, then starts Caddy — via compose if port 80 is free, or in a standalone container on 8080/8443 if it's reserved (see Gotchas) |
| `rebuild` | `docker compose build backend worker` + `up -d --force-recreate --renew-anon-volumes` — fixes a stale generated Prisma client after a schema change |
| `smoke` | `curl` against `/api/health` (expects `"estado":"ok"`) and `/` (expects an HTML doctype), through whichever port `up` picked |
| `down` | `docker compose down`, removes the manual Caddy container if present, removes the `seei_seei` network |

`up` writes `.claude/skills/run-seei/.caddy-port` recording which port `smoke`/you should
hit (`443` normally, `8443` on Windows) — it's a driver-local scratch file, not meant to
be committed.

Once it's up, the app is a normal browser target: `https://seei.localhost/` (or
`:8443` on Windows). Seed users are in `apps/backend/prisma/seed.ts` — role-named
codes (`seed-administrador`, `seed-estudiante`, …) all sharing password `seed-password-dev-2026`.
Run the seed once against the running stack with:

```bash
docker compose -f infra/docker/docker-compose.yml -f infra/docker/docker-compose.dev.yml \
  exec backend pnpm exec tsx prisma/seed.ts
```

(Run it inside the `backend` container, not from the host — the container already has
`DATABASE_URL` resolved to the right Postgres host/port; `pnpm --filter @seei/backend
db:seed` from the host fails with `Environment variable not found: DATABASE_URL`.)

## Run (human path)

```bash
pnpm compose:dev     # docker compose up with the base + dev override, streams logs
pnpm caddy:trust     # one-time per machine: trusts Caddy's local CA so the browser accepts https://seei.localhost
```
Useless non-interactively (blocks streaming logs) — that's what `driver.sh up` is for.

## Test

```bash
pnpm turbo run test          # unit tests, all packages
pnpm --filter @seei/backend test:e2e   # orchestrates its own ephemeral Postgres/Redis (infra/docker/docker-compose.test.yml), don't run this against the dev stack's DB
```

Do **not** run the backend's full unfiltered `test:e2e` and expect every file to pass:
there's a known preexisting flake where parallel e2e files race on `anioEscolar`'s
partial-unique `activo` constraint. Filter to the area you're testing
(`pnpm exec jest --config test/jest-e2e.config.ts --testPathPattern=<area>`) instead.

---

## Gotchas

- **Backend/worker go `unhealthy` with TypeScript errors about fields that clearly exist
  in `schema.prisma`** (e.g. `plan_trabajo` / `voto_id` "does not exist on type") — the
  generated Prisma client baked into the image is older than the current schema. `backend`
  and `worker` bind-mount their *source* (`apps/backend`, `apps/worker`) but their
  `node_modules` — where `prisma generate` writes the client — is an **anonymous Docker
  volume**, so it survives `up`/`down` across sessions and goes stale the moment
  `schema.prisma` changes without a rebuild. Fix: `./driver.sh rebuild`.

- **Caddy fails with `ports are not available: exposing port TCP 0.0.0.0:80 -> ...: bind:
  An attempt was made to access a socket in a way forbidden by its access permissions`**
  on Windows — this is the OS (System process, PID 4 / HTTP.SYS), not another container
  holding port 80; `netstat -ano | grep :80` shows `LISTENING 4`. Freeing it system-wide is
  a bigger ask than a dev stack should require, so `driver.sh up` detects this and runs
  Caddy standalone (`docker run`) on `8080:80`/`8443:443` instead, attached to the compose
  network (`seei_seei`) and reusing the compose-managed `caddy_data`/`caddy_config` volumes
  and the repo's `Caddyfile`. Browse to `https://seei.localhost:8443` in that case.

- **The standalone Caddy container silently serves its own built-in default page instead
  of the real `Caddyfile`** (no `seei.localhost` site, no TLS, `caddy adapt` shows a bare
  `file_server` config) — Git Bash rewrites the *container-side* absolute path in a
  `docker run -v host:/etc/caddy/Caddyfile` argument into a Windows path before Docker ever
  sees it, so the bind mount silently fails to attach. Fix: prefix the whole `docker run`
  with `MSYS_NO_PATHCONV=1` **and** use a double-leading-slash host path
  (`//c/Rafael/.../Caddyfile`, not `/c/Rafael/...`) — `driver.sh` already does both; if you
  hand-roll a `docker run` for debugging, don't drop either one.

- **`curl` to `https://seei.localhost:<port>/...` from Git Bash's curl (schannel) fails the
  TLS handshake outright when you hit `127.0.0.1` or `::1` directly**, even with `-k` —
  schannel doesn't send SNI for a bare IP, and the Caddyfile only has a certificate for the
  `seei.localhost` name. Use `curl -k --resolve seei.localhost:<port>:127.0.0.1
  https://seei.localhost:<port>/...` (what `driver.sh smoke` does), not a raw IP.

## Troubleshooting

- **`docker compose down` prints `Network seei_seei Resource is still in use`**: the
  standalone Caddy container (from the port-80 workaround) is still attached to it.
  `driver.sh down` removes that container first for exactly this reason; if you're
  debugging by hand, `docker rm -f seei-caddy-manual` before `docker network rm seei_seei`.
- **`prisma migrate deploy` against the test stack fails with `P1000: Authentication
  failed ... seei_migrator`**: you ran `docker compose -f infra/docker/docker-compose.test.yml
  up` without `--env-file infra/docker/.env.test` — Compose silently fell back to
  `infra/docker/.env` (the dev credentials) when creating the Postgres roles. Always pass
  `--env-file infra/docker/.env.test` for the test stack.
