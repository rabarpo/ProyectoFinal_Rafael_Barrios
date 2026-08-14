-- candidatos-listas-opciones-consulta (#12, PR1; design.md D1-D3):
-- Candidato gana columnas de foto (Bytes? + mime); Lista reemplaza plan_trabajo_url (String?, URL)
-- por almacenamiento binario del PDF (Bytes? + mime + nombre original), espejo de
-- Configuracion.logo/logo_mime. Sin backfill: no hay filas reales que preservar (verificado por
-- R1 -- SELECT count(*) FROM "Lista" WHERE plan_trabajo_url IS NOT NULL debe ser 0 antes de aplicar).

-- AlterTable
ALTER TABLE "Candidato" ADD COLUMN "foto" BYTEA, ADD COLUMN "foto_mime" TEXT;

-- AlterTable
ALTER TABLE "Lista"
  DROP COLUMN "plan_trabajo_url",
  ADD COLUMN "plan_trabajo" BYTEA,
  ADD COLUMN "plan_trabajo_mime" TEXT,
  ADD COLUMN "plan_trabajo_nombre" TEXT;
