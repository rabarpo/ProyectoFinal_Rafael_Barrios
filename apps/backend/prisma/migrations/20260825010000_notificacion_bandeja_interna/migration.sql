-- notificaciones (#19, PR1; design.md D2/D3). DDL puro, en el orden exacto de D2.
--
-- Gotcha de `ALTER TYPE ... ADD VALUE`: PG16 admite este paso dentro del bloque transaccional que
-- Prisma envuelve alrededor de cada archivo de migración; lo que NO admite es *usar* ese valor
-- nuevo (INSERT/UPDATE/DEFAULT/CHECK que lo mencione) en la MISMA transacción que lo agrega. Este
-- archivo no lleva ningún INSERT/UPDATE/DEFAULT/CHECK que mencione 'interna'. Los valores de
-- "EventoNotificacion"/"OrigenJobCorreo" SÍ se usan acá porque ambos tipos se CREAN en esta misma
-- transacción (excepción explícita de Postgres: un tipo creado en la transacción actual puede
-- usar sus propios valores de inmediato).
ALTER TYPE "TipoNotificacion" ADD VALUE 'interna';

CREATE TYPE "EventoNotificacion" AS ENUM ('inicio_votacion','recordatorio','cierre_proximo','resultados');
CREATE TYPE "OrigenJobCorreo"    AS ENUM ('comprobante','notificacion');

-- `Notificacion` tiene CERO escritores en todo el repo (C6, verificado): está vacía en todos los
-- entornos, así que `NOT NULL` sin `DEFAULT` es seguro y no requiere backfill.
ALTER TABLE "Notificacion" ALTER COLUMN "job_correo_id" DROP NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "usuario_id" UUID NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "proceso_id" UUID;             -- nullable a propósito (D2)
ALTER TABLE "Notificacion" ADD COLUMN "evento" "EventoNotificacion" NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "titulo" TEXT NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "cuerpo" TEXT NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "leido_en" TIMESTAMPTZ(3);

ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_proceso_id_fkey"
  FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Clave de deduplicación del sweep (D2/C4). NULL en proceso_id nunca colisiona (Postgres trata los
-- NULL como distintos en un índice único).
CREATE UNIQUE INDEX "Notificacion_proceso_id_evento_usuario_id_key"
  ON "Notificacion"("proceso_id","evento","usuario_id");
CREATE INDEX "Notificacion_usuario_id_creado_en_idx"
  ON "Notificacion"("usuario_id","creado_en" DESC);

-- D3: sin esta columna la cola dedicada `notificaciones` no aísla nada (C5) — el despachador de
-- comprobantes de #15 seguiría llevándose los recordatorios a la cola `correo`.
ALTER TABLE "JobCorreo" ADD COLUMN "origen" "OrigenJobCorreo" NOT NULL DEFAULT 'comprobante';
CREATE INDEX "JobCorreo_pendiente_comprobante_idx"  ON "JobCorreo"("creado_en")
  WHERE "estado" = 'pendiente' AND "origen" = 'comprobante';
CREATE INDEX "JobCorreo_pendiente_notificacion_idx" ON "JobCorreo"("creado_en")
  WHERE "estado" = 'pendiente' AND "origen" = 'notificacion';
