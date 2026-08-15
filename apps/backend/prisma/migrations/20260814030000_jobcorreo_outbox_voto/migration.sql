-- outbox-correo-comprobante-autenticado (#15, PR1; design.md D1):
-- Migracion aditiva y nullable a "JobCorreo" -- convierte la tabla en un outbox consultable con
-- un JOIN (ADR-0012) en vez de texto libre. Ninguna columna existente cambia de nombre, tipo ni
-- posicion. Sin backfill: proyecto greenfield, la tabla esta vacia (design.md D13/"Backfill").

-- AlterTable
ALTER TABLE "JobCorreo" ADD COLUMN "voto_id" UUID;
ALTER TABLE "JobCorreo" ADD COLUMN "proceso_id" UUID;
ALTER TABLE "JobCorreo" ADD COLUMN "codigo_comprobante" TEXT;

-- CreateIndex
-- UNIQUE sobre columna nullable: los NULL no colisionan entre si (Postgres) -- hace
-- estructuralmente imposible un segundo JobCorreo para el mismo voto, sin bloquear jobs sin
-- voto_id (#19).
CREATE UNIQUE INDEX "JobCorreo_voto_id_key" ON "JobCorreo"("voto_id");

-- CreateIndex
-- Unica consulta caliente del despachador de #15/PR2 (design.md D5): WHERE estado='pendiente'
-- ORDER BY creado_en.
CREATE INDEX "JobCorreo_estado_creado_en_idx" ON "JobCorreo"("estado", "creado_en");

-- AddForeignKey
-- "JobCorreo" es una fila operativa (no probatoria): a diferencia de DerechoVoto.aula_snapshot,
-- un voto_id huerfano dejaria el JOIN del ADR-0012 devolviendo menos filas de las reales.
-- Restrict: los Voto nunca se borran.
ALTER TABLE "JobCorreo" ADD CONSTRAINT "JobCorreo_voto_id_fkey"
  FOREIGN KEY ("voto_id") REFERENCES "Voto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCorreo" ADD CONSTRAINT "JobCorreo_proceso_id_fkey"
  FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
