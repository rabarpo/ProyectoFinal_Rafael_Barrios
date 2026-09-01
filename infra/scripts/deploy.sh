#!/usr/bin/env bash
#
# deploy.sh — release de SEEI en el VPS (estrategia "recreate", ver DEPLOY-PLAN.md).
#
# Uso (en el VPS, desde /opt/seei):
#   infra/scripts/deploy.sh <tag-de-git>
#   infra/scripts/deploy.sh <tag-de-git> --force     # omite el chequeo de jornada abierta
#
# Secuencia:
#   1. Valida repo limpio y que el tag exista.
#   2. Aborta si hay un proceso electoral en estado 'abierto' (salvo --force).
#   3. Backup previo obligatorio (aborta el deploy si falla).
#   4. Checkout del tag + build + up -d --wait (el servicio `migrate` corre antes que backend/worker).
#   5. Smoke test. Si falla -> rollback automático al tag anterior + smoke test de nuevo.
#   6. Registra el resultado en /opt/seei/deploys.log.
#
# NO ejecuta ninguna acción destructiva sobre datos. El rollback recrea contenedores desde la
# imagen anterior; nunca toca el volumen de Postgres. Una migración ya aplicada NO se revierte
# acá (ver DEPLOY-PLAN.md, "Data & Migrations": eso es restore.sh).

set -euo pipefail

# ── Configuración ────────────────────────────────────────────────────────────
REPO_DIR="${SEEI_REPO_DIR:-/opt/seei}"
DEPLOY_LOG="${SEEI_DEPLOY_LOG:-/opt/seei/deploys.log}"
COMPOSE=(docker compose
  -f "${REPO_DIR}/infra/docker/docker-compose.yml"
  -f "${REPO_DIR}/infra/docker/docker-compose.prod.yml")
HEALTH_URL="${SEEI_HEALTH_URL:-https://seei.ejemplo.edu.pe/api/health}"
SITE_URL="${SEEI_SITE_URL:-https://seei.ejemplo.edu.pe/}"

# ── Argumentos ──────────────────────────────────────────────────────────────
TAG="${1:-}"
FORCE=0
[[ "${2:-}" == "--force" ]] && FORCE=1

if [[ -z "$TAG" ]]; then
  echo "ERROR: falta el tag de git. Uso: $0 <tag> [--force]" >&2
  exit 2
fi

cd "$REPO_DIR"

log() { echo "[$(date -Is)] $*"; }
record() { echo "$(date -Is)  tag=$1  commit=$2  user=${SUDO_USER:-$(whoami)}  resultado=$3" >>"$DEPLOY_LOG"; }

# ── 1. Validaciones de repo ─────────────────────────────────────────────────
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: el árbol de trabajo tiene cambios sin commitear. Abortando." >&2
  exit 1
fi
git fetch --tags --prune origin
if ! git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  echo "ERROR: el tag '${TAG}' no existe." >&2
  exit 1
fi

PREV_COMMIT="$(git rev-parse HEAD)"
PREV_REF="$(git describe --tags --exact-match 2>/dev/null || echo "$PREV_COMMIT")"
NEW_COMMIT="$(git rev-parse "${TAG}^{commit}")"

log "Deploy solicitado: ${PREV_REF} -> ${TAG} (${NEW_COMMIT})"

# ── 2. Gate: ¿hay una jornada abierta? ──────────────────────────────────────
# Se consulta Postgres directo (no la API: la API podría estar caída y aun así habría votación en
# curso a nivel de datos). Si el contenedor de postgres no está arriba todavía, se asume 0.
jornadas_abiertas() {
  "${COMPOSE[@]}" exec -T postgres \
    psql -U postgres -d seei -tAc \
    "SELECT count(*) FROM \"ProcesoElectoral\" WHERE estado = 'abierto';" 2>/dev/null || echo "0"
}

if [[ "$FORCE" -eq 0 ]]; then
  ABIERTAS="$(jornadas_abiertas | tr -d '[:space:]')"
  if [[ "${ABIERTAS:-0}" != "0" ]]; then
    echo "ERROR: hay ${ABIERTAS} proceso(s) en estado 'abierto'. No se despliega durante una jornada." >&2
    echo "       Si es una corrección de emergencia autorizada, reintentá con --force." >&2
    record "$TAG" "$NEW_COMMIT" "abortado-jornada-abierta"
    exit 1
  fi
else
  log "ADVERTENCIA: --force activo, se omite el chequeo de jornada abierta."
fi

# ── 3. Backup previo (bloqueante) ───────────────────────────────────────────
log "Backup previo al deploy..."
if ! "${REPO_DIR}/infra/scripts/backup.sh" --tag "pre-deploy-${TAG}"; then
  echo "ERROR: el backup previo falló. Abortando el deploy (no se toca nada)." >&2
  record "$TAG" "$NEW_COMMIT" "abortado-backup-fallo"
  exit 1
fi

# ── 4. Checkout + build + up ────────────────────────────────────────────────
rollback() {
  log "ROLLBACK -> ${PREV_REF}"
  git checkout -q "$PREV_REF"
  "${COMPOSE[@]}" up -d --build --wait || true
  if smoke; then
    log "Rollback OK: el servicio volvió al estado anterior."
    record "$TAG" "$NEW_COMMIT" "fallo-rollback-ok(prev=${PREV_REF})"
  else
    echo "CRÍTICO: el rollback tampoco pasó el smoke test. Intervención manual requerida." >&2
    record "$TAG" "$NEW_COMMIT" "fallo-rollback-fallo"
  fi
  exit 1
}

smoke() { "${REPO_DIR}/infra/scripts/smoke.sh" "$HEALTH_URL" "$SITE_URL"; }

log "Checkout ${TAG}..."
git checkout -q "$TAG"

log "Build de imágenes en el VPS..."
if ! "${COMPOSE[@]}" build; then
  echo "ERROR: el build falló." >&2
  rollback
fi

log "Levantando servicios (migrate corre primero)..."
if ! "${COMPOSE[@]}" up -d --wait; then
  echo "ERROR: 'up -d --wait' no alcanzó el estado saludable." >&2
  "${COMPOSE[@]}" ps
  rollback
fi

# ── 5. Smoke test ──────────────────────────────────────────────────────────
log "Smoke test..."
if ! smoke; then
  echo "ERROR: el smoke test falló tras el deploy." >&2
  rollback
fi

# ── 6. Registro ────────────────────────────────────────────────────────────
"${COMPOSE[@]}" ps
record "$TAG" "$NEW_COMMIT" "ok(prev=${PREV_REF})"
log "Deploy OK: ${TAG} en producción."
