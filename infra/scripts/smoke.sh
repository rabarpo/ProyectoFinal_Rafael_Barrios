#!/usr/bin/env bash
#
# smoke.sh — verificación post-deploy (ver DEPLOY-PLAN.md, "Verify & Observe").
#
# Uso:
#   infra/scripts/smoke.sh [HEALTH_URL] [SITE_URL]
#
# Sale 0 solo si TODO pasa. Lo invocan deploy.sh y restore.sh; también sirve para chequear a mano.
#
# OJO: GET /api/health devuelve SIEMPRE HTTP 200. El estado real está en el body
# (campo `estado`: "ok" | "degradado"). Un chequeo que solo mire el código HTTP daría un falso OK.

set -euo pipefail

HEALTH_URL="${1:-${SEEI_HEALTH_URL:-https://seei.ejemplo.edu.pe/api/health}}"
SITE_URL="${2:-${SEEI_SITE_URL:-https://seei.ejemplo.edu.pe/}}"
MAX_PING_AGE_S="${SEEI_MAX_PING_AGE_S:-120}"

fail() { echo "  ✗ $*" >&2; FAILED=1; }
ok()   { echo "  ✓ $*"; }

FAILED=0
command -v jq >/dev/null || { echo "ERROR: falta 'jq' (apt install jq)." >&2; exit 2; }

echo "smoke test → $HEALTH_URL"

# ── 1. Frontend responde ───────────────────────────────────────────────────
SITE_CODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$SITE_URL" || echo 000)"
[[ "$SITE_CODE" == "200" ]] && ok "frontend HTTP 200" || fail "frontend HTTP $SITE_CODE"

# ── 2. Certificado TLS emitido por una CA pública (no la interna de Caddy) ──
ISSUER="$(echo | openssl s_client -connect "${HEALTH_URL#https://}" -servername "$(echo "$HEALTH_URL" | sed -E 's#https?://([^/]+).*#\1#')" 2>/dev/null | openssl x509 -noout -issuer 2>/dev/null || true)"
if echo "$ISSUER" | grep -qiE "let'?s encrypt|ISRG|Google Trust"; then
  ok "TLS por CA pública ($ISSUER)"
elif [[ -n "$ISSUER" ]]; then
  fail "TLS emitido por '$ISSUER' — ¿sigue en 'tls internal'?"
else
  fail "no se pudo leer el emisor del certificado"
fi

# ── 3. /api/health: HTTP 200 + body sano ──────────────────────────────────
BODY="$(curl -sS --max-time 15 "$HEALTH_URL" || echo '{}')"
HCODE="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "$HEALTH_URL" || echo 000)"
[[ "$HCODE" == "200" ]] && ok "health HTTP 200" || fail "health HTTP $HCODE"

ESTADO="$(echo "$BODY"    | jq -r '.estado       // "?"')"
DB="$(echo "$BODY"        | jq -r '.db.estado    // "?"')"
REDIS="$(echo "$BODY"     | jq -r '.redis.estado // "?"')"
PING="$(echo "$BODY"      | jq -r '.worker.ultimoPing // empty')"

[[ "$ESTADO" == "ok" ]] && ok "estado=ok" || fail "estado=$ESTADO (esperado 'ok')"
[[ "$DB"     == "ok" ]] && ok "db=ok"     || fail "db=$DB"
[[ "$REDIS"  == "ok" ]] && ok "redis=ok"  || fail "redis=$REDIS"

if [[ -n "$PING" ]]; then
  AGE=$(( $(date -u +%s) - $(date -u -d "$PING" +%s) ))
  if (( AGE >= 0 && AGE <= MAX_PING_AGE_S )); then
    ok "worker.ultimoPing hace ${AGE}s"
  else
    fail "worker.ultimoPing hace ${AGE}s (> ${MAX_PING_AGE_S}s) — ¿worker caído?"
  fi
else
  fail "worker.ultimoPing ausente"
fi

echo
if [[ "$FAILED" -eq 0 ]]; then
  echo "SMOKE OK"
else
  echo "SMOKE FALLÓ"
fi
exit "$FAILED"
