#!/usr/bin/env bash
# Verificación de deriva del lado DSL (base-schema-and-migrations, tarea 1.4; design.md D2).
#
# Detecta un `schema.prisma` cambiado sin su migración correspondiente generando una migración
# de prueba contra la shadow DB efímera (`prisma migrate dev --create-only --name drift_check`):
# si el `migration.sql` resultante no está vacío, hay deriva. `prisma migrate diff --exit-code`
# NO sirve para esto (ver design.md D2): reporta el índice parcial y el CHECK anexados a mano
# como objetos sobrantes frente al datamodel y fallaría siempre.
#
# Matriz de amenazas (design.md, filas "Selección de repositorio git" / "Estado del índice" /
# "Borrado de directorio por script"): el script corre con `cwd` en `apps/backend`, decide la
# deriva por el CONTENIDO del `migration.sql` generado (no por `git diff`, que no ve archivos no
# rastreados), y valida el sufijo `*_drift_check` de la ruta contra la que hace `rm -rf` antes de
# borrar cualquier cosa. Si la ruta no coincide con ese sufijo exacto, aborta sin borrar nada —
# nunca opera sobre el árbol completo ni sobre una migración real.
set -euo pipefail

pnpm exec prisma migrate dev --create-only --name drift_check --skip-generate

DIR="$(ls -d prisma/migrations/*_drift_check)"
case "$DIR" in
  */*_drift_check) ;;
  *)
    echo "Ruta inesperada, no coincide con el sufijo *_drift_check: $DIR"
    exit 1
    ;;
esac

# Contingencia D2 verificada empíricamente durante sdd-apply: la versión fijada de Prisma
# (^5.22.0) SIEMPRE escribe un `migration.sql`, incluso sin diferencias — en ese caso su único
# contenido es el comentario placeholder "-- This is an empty migration." (30 bytes, `-s`
# reportaría falso positivo). La deriva real se decide ignorando líneas de comentario SQL
# (`--`) y líneas en blanco: solo sentencias DDL cuentan.
SQL_REAL="$(grep -v '^--' "$DIR/migration.sql" | grep -v '^[[:space:]]*$' || true)"

if [ -n "$SQL_REAL" ]; then
  echo "Deriva: schema.prisma cambió sin migración. Ejecute 'prisma migrate dev'."
  cat "$DIR/migration.sql"
  rm -rf "$DIR"
  exit 1
fi

rm -rf "$DIR"
