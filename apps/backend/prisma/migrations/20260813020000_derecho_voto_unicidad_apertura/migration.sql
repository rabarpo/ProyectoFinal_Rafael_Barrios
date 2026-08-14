-- apertura-proceso-congelamiento-padron (#13, PR1; design.md D1-D2):
-- DerechoVoto gana unicidad (proceso_id, usuario_id, en_calidad_de) -- permite hasta dos filas por
-- cuenta en alcance `comunidad` (estudiante + padre) y actua como red de seguridad final ante
-- condiciones de carrera en reintentos concurrentes de POST /procesos/:id/abrir. aula_snapshot pasa
-- de String libre a UUID -- espejo plano de ProcesoAula.aula_id, deliberadamente sin FK ni relacion
-- Prisma (inmutabilidad de ADR-0003/ADR-0010). Sin backfill: la tabla esta vacia (DerechoVoto nunca
-- se escribio, verificado por R1 -- SELECT count(*) FROM "DerechoVoto" debe ser 0 antes de aplicar),
-- asi que el `USING ::uuid` no puede fallar por datos.

-- AlterTable
ALTER TABLE "DerechoVoto" ALTER COLUMN "aula_snapshot" TYPE UUID USING "aula_snapshot"::uuid;

-- CreateIndex
CREATE UNIQUE INDEX "DerechoVoto_proceso_id_usuario_id_en_calidad_de_key"
  ON "DerechoVoto"("proceso_id", "usuario_id", "en_calidad_de");
