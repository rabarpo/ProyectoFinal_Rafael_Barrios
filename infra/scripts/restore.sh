#!/usr/bin/env bash
#
# restore.sh — restauración de SEEI desde un dump de backup.sh (ver DEPLOY-PLAN.md, "Recovery").
#
# ACCIÓN DESTRUCTIVA: reemplaza el contenido de la base `seei`. Requiere confirmación interactiva
# (o SEEI_RESTORE_YES=1 para un ensayo automatizado en staging).
#
# Uso:
#   infra/scripts/restore.sh /opt/seei/backups/seei-YYYYMMDDTHHMMSSZ.dump
#   infra/scripts/restore.sh --from-remote seei-YYYYMMDDTHHMMSSZ.dump   # baja de object storage primero
#
# Procedimiento:
#   1. Detiene backend/worker/migrate (dejan de escribir). Postgres sigue arriba.
#   2. DROP + CREATE de la base `seei` (los roles seei_migrator/seei_app sobreviven — son del clúster).
#   3. pg_restore del dump.
#   4. Levanta todo de nuevo y corre el smoke test.
#
# Para el ensayo de restauración de ADR-0013 (backlog #23) este script cubre solo el paso técnico;
# la anulación de códigos, revotos, extensión de cierre y acta de incidencias son procedimiento
# operativo aparte.

set -euo pipefail

REPO_DIR="${SEEI_REPO_DIR:-/opt/seei}"
BACKUP_DIR="${SEEI_BACKUP_DIR:-/opt/seei/backups}"
RCLONE_REMOTE="${SEEI_RCLONE_REMOTE:-seei-backups:seei/postgres}"
HEALTH_URL="${SEEI_HEALTH_URL:-https://seei.ejemplo.edu.pe/api/health}"
SITE_URL="${SEEI_SITE_URL:-https://seei.ejemplo.edu.pe/}"

COMPOSE=(docker compose
  -f "${REPO_DIR}/infra/docker/docker-compose.yml"
  -f "${REPO_DIR}/infra/docker/docker-compose.prod.yml")

log() { echo "[$(date -Is)] restore: $*"; }

# ── Resolver el dump ───────────────────────────────────────────────────────
if [[ "${1:-}" == "--from-remote" ]]; then
  NAME="${2:?falta el nombre del dump remoto}"
  DUMP="${BACKUP_DIR}/${NAME}"
  log "Bajando ${NAME} de ${RCLONE_REMOTE}..."
  rclone copy "${RCLONE_REMOTE}/${NAME}" "${BACKUP_DIR}/" --config /opt/seei/rclone.conf
else
  DUMP="${1:?Uso: $0 <archivo.dump> | --from-remote <nombre>}"
fi

[[ -s "$DUMP" ]] || { echo "ERROR: no existe o está vacío: $DUMP" >&2; exit 1; }

# ── Confirmación ───────────────────────────────────────────────────────────
echo "Se va a DESTRUIR el contenido actual de la base 'seei' y restaurar:"
echo "  $DUMP"
if [[ "${SEEI_RESTORE_YES:-0}" != "1" ]]; then
  read -r -p "Escribí 'restaurar' para continuar: " ANS
  [[ "$ANS" == "restaurar" ]] || { echo "Cancelado."; exit 1; }
fi

cd "$REPO_DIR"

# ── 1. Parar los escritores ────────────────────────────────────────────────
log "Deteniendo backend, worker y migrate..."
"${COMPOSE[@]}" stop backend worker migrate

# ── 2 + 3. Recrear la base y restaurar ─────────────────────────────────────
log "DROP/CREATE database seei..."
"${COMPOSE[@]}" exec -T postgres psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'seei' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS seei;
CREATE DATABASE seei OWNER seei_migrator;
SQL

log "pg_restore..."
"${COMPOSE[@]}" exec -T postgres pg_restore -U postgres -d seei --no-owner --role=seei_migrator <"$DUMP"

# ── 4. Levantar y verificar ────────────────────────────────────────────────
log "Levantando servicios..."
"${COMPOSE[@]}" up -d --wait

log "Smoke test..."
if "${REPO_DIR}/infra/scripts/smoke.sh" "$HEALTH_URL" "$SITE_URL"; then
  log "Restauración OK."
else
  echo "ADVERTENCIA: la restauración terminó pero el smoke test falló. Revisar logs." >&2
  exit 1
fi
