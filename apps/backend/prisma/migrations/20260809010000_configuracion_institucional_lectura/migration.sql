-- AlterTable
-- configuracion-general, PR1 (design.md D1/D8, tarea 1.3): columnas aditivas de identidad
-- institucional. Todas nullable o con default que no requiere valor en filas existentes, así que
-- la fila semilla `clave='institucional'` sobrevive sin tocarse (spec, Scenario "La fila semilla
-- `clave='institucional'` sobrevive la migración"). `logo`/`logo_mime`/`logo_actualizado_en`
-- quedan fuera de esta migración (PR3).
ALTER TABLE "Configuracion" ADD COLUMN     "nombre" TEXT,
ADD COLUMN     "director" TEXT,
ADD COLUMN     "color_primario" TEXT,
ADD COLUMN     "color_secundario" TEXT,
ADD COLUMN     "zona_horaria" TEXT,
ADD COLUMN     "dominios_google" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Limpieza del placeholder de `seed.ts` (design.md "Migration / Rollout", paso 2): sin esta
-- sentencia, cualquier entorno ya sembrado con el host de marcador de posición seguiría
-- apuntando a `smtp.seei.local` en vez de caer a `ConsoleEmailSender` (D8, sin fallback silencioso
-- a env var una vez que la DB es la única fuente de verdad).
UPDATE "Configuracion" SET "smtp_host" = NULL WHERE "clave" = 'institucional' AND "smtp_host" = 'smtp.seei.local';
