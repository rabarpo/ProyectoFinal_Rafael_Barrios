-- ADR-0008: "ocultar resultados hasta el cierre" es la configuración activa por defecto, como
-- recomienda el PRD. El default original (`false`) del schema quedó desalineado desde la
-- creación de la columna: cualquier POST /procesos que omitiera el campo (fuera del asistente,
-- que ya lo pre-marca) publicaba resultados en vivo desde la apertura. Solo cambia el DEFAULT de
-- la columna para inserts futuros; no reescribe filas existentes (greenfield, sin datos reales).
ALTER TABLE "ProcesoElectoral" ALTER COLUMN "ocultar_resultados" SET DEFAULT true;
