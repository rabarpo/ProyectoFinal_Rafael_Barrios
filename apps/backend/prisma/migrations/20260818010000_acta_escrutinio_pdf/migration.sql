-- cierre-escrutinio-actas (#17, PR1; design.md D2). DDL PURO.
-- PG16 admite `ALTER TYPE ... ADD VALUE` dentro del bloque transaccional que Prisma envuelve
-- alrededor de cada archivo de migración; lo que NO admite es *usar* el valor nuevo en esa misma
-- transacción. Por eso este archivo no lleva ningún INSERT/UPDATE/DEFAULT que mencione
-- 'escrutinio'/'oficial'/'fallido'. Cualquier migración FUTURA que necesite escribirlos debe ir en
-- un archivo separado.

-- AlterEnum
ALTER TYPE "TipoActa" ADD VALUE 'escrutinio';
ALTER TYPE "TipoActa" ADD VALUE 'oficial';

-- AlterEnum
ALTER TYPE "EstadoActa" ADD VALUE 'fallido';

-- AlterTable
-- `Acta` está vacía y sin consumidores desde #2 (confirmado por la exploración): el cambio de tipo
-- es seguro y `USING "contenido"::jsonb` no puede fallar sobre cero filas.
ALTER TABLE "Acta" ALTER COLUMN "contenido" TYPE JSONB USING "contenido"::jsonb;
ALTER TABLE "Acta" ADD COLUMN "pdf" BYTEA;
ALTER TABLE "Acta" ADD COLUMN "pdf_mime" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Acta_proceso_id_tipo_key" ON "Acta"("proceso_id", "tipo");

-- CreateIndex
CREATE INDEX "Acta_estado_creado_en_idx" ON "Acta"("estado", "creado_en");

-- AddCheckConstraint
-- Postgres no permite DROP VALUE sobre un enum ya usado; se prohíbe el uso de 'resultados' en su
-- lugar (decisión 1 de proposal.md: el tipo queda deprecado, ningún código nuevo lo escribe).
ALTER TABLE "Acta" ADD CONSTRAINT "acta_tipo_no_deprecado_chk" CHECK ("tipo" <> 'resultados');
