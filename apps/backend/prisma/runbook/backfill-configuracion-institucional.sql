-- configuracion-general, PR4 (design.md "Runbook de despliegue", paso R2; tarea 4.R2).
--
-- Backfill IDEMPOTENTE de Configuracion.dominios_google / smtp_host / smtp_puerto /
-- smtp_remitente desde los valores vigentes de las variables de entorno
-- GOOGLE_HOSTED_DOMAINS / SMTP_HOST / SMTP_PORT / SMTP_FROM del entorno destino.
--
-- MUST ejecutarse (y su verificación de salida MUST pasar) ANTES de desplegar el código de PR4 en
-- ese mismo entorno (paso R3) — de lo contrario, GoogleOauthService.dominiosPermitidos() lee
-- Configuracion.dominios_google = '{}' (default de la migración) y rechaza fail-closed TODO login
-- Google Workspace, incluido el del administrador que debería corregirlo (design.md D2/D8).
--
-- IDEMPOTENCIA: los tres UPDATE solo escriben si el valor de destino sigue en su default de
-- migración (dominios_google = '{}' / smtp_host IS NULL) — re-ejecutar este script contra un
-- entorno ya migrado con datos reales NO sobrescribe configuración administrada manualmente vía
-- PUT /configuracion después del backfill inicial.
--
-- USO (reemplazar los 4 placeholders entre :'...' con los valores reales del entorno destino
-- ANTES de ejecutar, o invocar vía psql -v desde el script wrapper
-- backfill-configuracion-institucional.sh):
--   psql "$DATABASE_URL" \
--     -v dominios_google_csv="'colegio.edu.pe,otro-colegio.edu.pe'" \
--     -v smtp_host="'smtp.real.local'" \
--     -v smtp_puerto=587 \
--     -v smtp_remitente="'no-responder@real.local'" \
--     -f backfill-configuracion-institucional.sql

BEGIN;

UPDATE "Configuracion"
SET dominios_google = string_to_array(:dominios_google_csv, ',')
WHERE clave = 'institucional'
  AND dominios_google = '{}';

UPDATE "Configuracion"
SET smtp_host = :smtp_host,
    smtp_puerto = :smtp_puerto,
    smtp_remitente = :smtp_remitente
WHERE clave = 'institucional'
  AND smtp_host IS NULL;

-- Verificación de salida (bloqueante, tarea 4.R2): dominios_google MUST quedar no vacío.
-- Si esta consulta devuelve una fila con dominios_google = '{}', el script NO debe continuarse a
-- 4.R3 (desplegar código) — revisar GOOGLE_HOSTED_DOMAINS del entorno destino y volver a correr.
SELECT clave, dominios_google, smtp_host, smtp_puerto, smtp_remitente
FROM "Configuracion"
WHERE clave = 'institucional';

COMMIT;
