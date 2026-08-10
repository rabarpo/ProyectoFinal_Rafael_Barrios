-- AlterTable
-- configuracion-general, PR3 (design.md D1/D5, tarea 3.0): columnas aditivas para el logo
-- institucional, diferidas de la migración de PR1 (20260809010000_configuracion_institucional_lectura
-- — ver DESVIACIÓN documentada en tasks.md, tarea 1.2). Todas nullable, así que la fila semilla
-- `clave='institucional'` sobrevive sin tocarse (spec, Scenario "La fila semilla
-- `clave='institucional'` sobrevive la migración").
ALTER TABLE "Configuracion" ADD COLUMN     "logo" BYTEA,
ADD COLUMN     "logo_mime" TEXT,
ADD COLUMN     "logo_actualizado_en" TIMESTAMPTZ(3);
