#!/usr/bin/env bash
# Driver for running the SEEI stack (Caddy + frontend + backend + worker + Postgres + Redis)
# from a Git Bash / Windows dev machine. See SKILL.md in this directory for the full writeup.
#
# Usage:
#   ./driver.sh up       # bring the stack up, working around the Windows port-80 issue
#   ./driver.sh smoke    # curl health + frontend through whichever Caddy is active
#   ./driver.sh rebuild  # rebuild backend/worker images (fixes stale Prisma client)
#   ./driver.sh down     # tear everything down, including the manual Caddy container

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
DOCKER_DIR="$REPO_ROOT/infra/docker"
COMPOSE_ARGS=(-f "$DOCKER_DIR/docker-compose.yml" -f "$DOCKER_DIR/docker-compose.dev.yml")
CADDY_CONTAINER="seei-caddy-manual"

port_80_available() {
  # On Windows, port 80 is frequently reserved by the System process (PID 4 / HTTP.SYS),
  # not by another container. Compose's caddy service will fail to bind it — detect that
  # up front instead of parsing docker's error output.
  if command -v netstat >/dev/null 2>&1; then
    ! netstat -ano 2>/dev/null | grep -q ':80 .*LISTENING'
  else
    true # non-Windows: assume it's fine, compose will just tell us if not
  fi
}

up() {
  cd "$REPO_ROOT"
  echo "==> docker compose up (postgres/redis/migrate/backend/worker/frontend)"
  docker compose "${COMPOSE_ARGS[@]}" up -d postgres redis migrate backend worker frontend

  echo "==> waiting for backend/worker/frontend to report healthy"
  for i in $(seq 1 30); do
    status="$(docker compose "${COMPOSE_ARGS[@]}" ps --format '{{.Name}} {{.Health}}' 2>/dev/null || true)"
    if echo "$status" | grep -q 'seei-backend-1 healthy' && \
       echo "$status" | grep -q 'seei-frontend-1 healthy'; then
      break
    fi
    if echo "$status" | grep -qE 'seei-backend-1 unhealthy'; then
      echo "backend is unhealthy — likely a stale Prisma client in the node_modules"
      echo "anonymous volume (schema.prisma changed since the image was last built)."
      echo "Run: ./driver.sh rebuild"
      exit 1
    fi
    sleep 2
  done

  if port_80_available; then
    echo "==> port 80 is free, letting compose run Caddy on 80/443"
    docker compose "${COMPOSE_ARGS[@]}" up -d caddy
    echo "CADDY_HTTPS_PORT=443" > "$REPO_ROOT/.claude/skills/run-seei/.caddy-port"
  else
    echo "==> port 80 is reserved by the OS (Windows System process) — running Caddy"
    echo "    manually on 8080/8443 instead, attached to the compose network."
    docker rm -f "$CADDY_CONTAINER" >/dev/null 2>&1 || true
    # MSYS_NO_PATHCONV=1 + the //c/... host path are BOTH required: Git Bash mangles
    # absolute container-side paths in `-v` args (e.g. /etc/caddy/Caddyfile gets rewritten
    # to a Windows path), which silently makes Caddy load its built-in default config
    # instead of ours. See "Gotchas" in SKILL.md.
    MSYS_NO_PATHCONV=1 docker run -d --name "$CADDY_CONTAINER" \
      --network seei_seei \
      -p 8080:80 -p 8443:443 -p 8443:443/udp \
      -v "/${DOCKER_DIR}/Caddyfile:/etc/caddy/Caddyfile:ro" \
      -v seei_caddy_data:/data \
      -v seei_caddy_config:/config \
      caddy:2-alpine >/dev/null
    echo "CADDY_HTTPS_PORT=8443" > "$REPO_ROOT/.claude/skills/run-seei/.caddy-port"
  fi
  echo "==> up. Run ./driver.sh smoke to verify."
}

rebuild() {
  cd "$REPO_ROOT"
  echo "==> rebuilding backend/worker images and renewing their node_modules volumes"
  docker compose "${COMPOSE_ARGS[@]}" build backend worker
  docker compose "${COMPOSE_ARGS[@]}" up -d --force-recreate --renew-anon-volumes backend worker
}

smoke() {
  local port=443
  if [ -f "$REPO_ROOT/.claude/skills/run-seei/.caddy-port" ]; then
    # shellcheck disable=SC1090
    source "$REPO_ROOT/.claude/skills/run-seei/.caddy-port"
    port="${CADDY_HTTPS_PORT:-443}"
  fi
  echo "==> GET https://seei.localhost:$port/api/health"
  health="$(curl -sk --resolve "seei.localhost:$port:127.0.0.1" "https://seei.localhost:$port/api/health")"
  echo "$health"
  echo "$health" | grep -q '"estado":"ok"' || { echo "FAIL: health check did not report ok"; exit 1; }

  echo "==> GET https://seei.localhost:$port/ (frontend HTML)"
  html="$(curl -sk --resolve "seei.localhost:$port:127.0.0.1" "https://seei.localhost:$port/" | head -c 200)"
  echo "$html"
  echo "$html" | grep -qi '<!doctype html>' || { echo "FAIL: frontend did not return HTML"; exit 1; }

  echo "==> smoke test passed (https://seei.localhost:$port)"
}

down() {
  cd "$REPO_ROOT"
  echo "==> docker compose down"
  docker compose "${COMPOSE_ARGS[@]}" down
  echo "==> removing manual Caddy container (if any)"
  docker rm -f "$CADDY_CONTAINER" >/dev/null 2>&1 || true
  rm -f "$REPO_ROOT/.claude/skills/run-seei/.caddy-port"
  docker network rm seei_seei >/dev/null 2>&1 || true
  echo "==> down."
}

case "${1:-}" in
  up) up ;;
  rebuild) rebuild ;;
  smoke) smoke ;;
  down) down ;;
  *) echo "Usage: $0 {up|rebuild|smoke|down}"; exit 1 ;;
esac
