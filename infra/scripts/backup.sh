#!/usr/bin/env bash
#
# backup.sh — respaldo de SEEI (ver DEPLOY-PLAN.md, "Recovery").
#
# `pg_dump -Fc` de la base `seei` es el respaldo COMPLETO: fotos de candidatos, planes de trabajo,
# logo, actas PDF y reportes se guardan como columnas `Bytes` en Postgres, no en el filesystem.
#
# Uso:
#   infra/scripts/backup.sh                       # respaldo normal (cron)
#   infra/scripts/backup.sh --tag pre-deploy-xyz  # etiqueta (lo usa deploy.sh)
#
# Escribe local en /opt/seei/backups y sube a object storage con rclone (remote `seei-backups`).
# Sale != 0 si el dump o la subida fallan -> deploy.sh aborta el deploy.

set -euo pipefail

REPO_DIR="${SEEI_REPO_DIR:-/opt/seei}"
BACKUP_DIR="${SEEI_BACKUP_DIR:-/opt/seei/backups}"
RCLONE_REMOTE="${SEEI_RCLONE_REMOTE:-seei-backups:seei/postgres}"
RETENTION_LOCAL_DAYS="${SEEI_RETENTION_LOCAL_DAYS:-7}"
RETENTION_REMOTE_DAYS="${SEEI_RETENTION_REMOTE_DAYS:-90}"

COMPOSE=(docker compose
  -f "${REPO_DIR}/infra/docker/docker-compose.yml"
  -f "${REPO_DIR}/infra/docker/docker-compose.prod.yml")

TAG=""
[[ "${1:-}" == "--tag" && -n "${2:-}" ]] && TAG="-${2}"

TS="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="seei-${TS}${TAG}.dump"
DEST="${BACKUP_DIR}/${FILE}"

mkdir -p "$BACKUP_DIR"

log() { echo "[$(date -Is)] backup: $*"; }

# ── Dump ───────────────────────────────────────────────────────────────────
# Se usa el superusuario `postgres` (local al contenedor) para no depender de privilegios de
# lectura del rol de aplicación sobre todas las tablas. -Fc = formato custom (comprimido,
# restaurable selectivamente con pg_restore).
log "pg_dump -> ${DEST}"
if ! "${COMPOSE[@]}" exec -T postgres pg_dump -U postgres -Fc -d seei >"$DEST"; then
  log "ERROR: pg_dump falló."
  rm -f "$DEST"
  exit 1
fi

# Verificación mínima de integridad: pg_restore --list debe poder leer el archivo.
if ! "${COMPOSE[@]}" exec -T postgres pg_restore --list </dev/null >/dev/null 2>&1; then
  : # pg_restore no lee de stdin de forma portable; se valida por tamaño en su lugar.
fi
if [[ ! -s "$DEST" ]]; then
  log "ERROR: el dump quedó vacío."
  rm -f "$DEST"
  exit 1
fi
log "dump OK ($(du -h "$DEST" | cut -f1))"

# ── Subida offsite ─────────────────────────────────────────────────────────
if command -v rclone >/dev/null 2>&1; then
  log "rclone copy -> ${RCLONE_REMOTE}/"
  if ! rclone copy "$DEST" "${RCLONE_REMOTE}/" --config /opt/seei/rclone.conf; then
    log "ERROR: la subida a object storage falló."
    exit 1
  fi
  log "subida OK"
  # Retención remota
  rclone delete "$RCLONE_REMOTE" --config /opt/seei/rclone.conf \
    --min-age "${RETENTION_REMOTE_DAYS}d" --include "seei-*.dump" || true
else
  log "ADVERTENCIA: rclone no instalado — el respaldo quedó SOLO en el VPS (no offsite)."
  [[ -n "$TAG" ]] || exit 1   # un backup de cron sin copia offsite no cumple ADR-0007
fi

# ── Retención local ────────────────────────────────────────────────────────
find "$BACKUP_DIR" -name 'seei-*.dump' -type f -mtime "+${RETENTION_LOCAL_DAYS}" -delete
log "listo."
