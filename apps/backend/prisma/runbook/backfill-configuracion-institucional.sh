#!/usr/bin/env bash
set -euo pipefail

# configuracion-general, PR4 (design.md "Runbook de despliegue", paso R2; tarea 4.R2).
#
# Wrapper del backfill idempotente (backfill-configuracion-institucional.sql). Lee las mismas
# variables de entorno que el código legado leía en tiempo de arranque
# (GOOGLE_HOSTED_DOMAINS / SMTP_HOST / SMTP_PORT / SMTP_FROM) y las escribe en
# Configuracion.dominios_google / smtp_host / smtp_puerto / smtp_remitente del entorno destino
# apuntado por DATABASE_URL — MUST correr contra cada entorno (staging, producción) ANTES de
# desplegar el código de PR4 en ese mismo entorno (fail-closed: sin esto, GoogleOauthService
# rechaza todo login Google Workspace tras el deploy, design.md D2/D8).
#
# Este script es OPERACIONAL, no código de aplicación — no se ejecuta como parte de sdd-apply ni de
# ningún test automatizado; queda aquí para que quien despliegue lo invoque manualmente contra el
# entorno real, con DATABASE_URL apuntando a ese entorno.
#
# Uso:
#   DATABASE_URL=postgres://... \
#   GOOGLE_HOSTED_DOMAINS=colegio.edu.pe,otro-colegio.edu.pe \
#   SMTP_HOST=smtp.real.local \
#   SMTP_PORT=587 \
#   SMTP_FROM=no-responder@real.local \
#   ./backfill-configuracion-institucional.sh

: "${DATABASE_URL:?DATABASE_URL es obligatorio (debe apuntar al entorno destino real)}"
: "${GOOGLE_HOSTED_DOMAINS:?GOOGLE_HOSTED_DOMAINS es obligatorio — sin él, dominios_google quedaría vacío (fail-closed real, no simulado)}"

SMTP_HOST="${SMTP_HOST:-}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_FROM="${SMTP_FROM:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[backfill-configuracion-institucional] aplicando contra: ${DATABASE_URL%%@*}@<host-oculto>"

psql "$DATABASE_URL" \
  -v "dominios_google_csv='${GOOGLE_HOSTED_DOMAINS}'" \
  -v "smtp_host='${SMTP_HOST}'" \
  -v "smtp_puerto=${SMTP_PORT}" \
  -v "smtp_remitente='${SMTP_FROM}'" \
  -f "${SCRIPT_DIR}/backfill-configuracion-institucional.sql"

# Verificación de salida bloqueante (tarea 4.R2): dominios_google MUST quedar no vacío. psql ya
# imprimió la fila resultante arriba (SELECT final del .sql); esta segunda consulta solo existe
# para poder fallar el script con exit != 0 si algo salió vacío, en vez de depender de que un
# humano lea la salida de psql.
RESULTADO=$(psql "$DATABASE_URL" -t -A -c \
  "SELECT array_length(dominios_google, 1) FROM \"Configuracion\" WHERE clave = 'institucional';")

if [ -z "$RESULTADO" ] || [ "$RESULTADO" = "" ]; then
  echo "[backfill-configuracion-institucional] ERROR: dominios_google quedó vacío tras el backfill." >&2
  echo "[backfill-configuracion-institucional] DETENERSE — no continuar al paso R3 (desplegar código)." >&2
  exit 1
fi

echo "[backfill-configuracion-institucional] OK: dominios_google tiene ${RESULTADO} dominio(s). Puede continuar a R3."
