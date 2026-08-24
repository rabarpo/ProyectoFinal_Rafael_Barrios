-- reportes-y-exportaciones (#18, PR1; design.md D2/D3). DDL 100% aditivo: tres enums y una tabla
-- nuevos, ningún ALTER de tipo/tabla existente — el gotcha de #17 D2 (ALTER TYPE ... ADD VALUE no
-- usable en la misma transacción) no aplica aquí porque no se altera ningún enum existente.

-- CreateEnum
CREATE TYPE "DimensionReporte" AS ENUM ('participacion', 'votantes', 'abstenciones', 'resultados', 'candidatos', 'consultas');

-- CreateEnum
CREATE TYPE "FormatoReporte" AS ENUM ('excel', 'pdf', 'csv');

-- CreateEnum
CREATE TYPE "EstadoReporte" AS ENUM ('borrador', 'emitida', 'fallido');

-- CreateTable
-- D3: la AUSENCIA deliberada de un índice/constraint UNIQUE sobre (proceso_id, dimension, formato)
-- es la diferencia semántica central con "Acta": cada solicitud es su propio snapshot inmutable.
CREATE TABLE "Reporte" (
    "id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "dimension" "DimensionReporte" NOT NULL,
    "formato" "FormatoReporte" NOT NULL,
    "estado" "EstadoReporte" NOT NULL DEFAULT 'borrador',
    "solicitado_por" UUID NOT NULL,
    "gate_aplicado" BOOLEAN,
    "contenido" JSONB NOT NULL,
    "archivo" BYTEA,
    "archivo_mime" TEXT,
    "archivo_nombre" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emitido_en" TIMESTAMPTZ(3),

    CONSTRAINT "Reporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reporte_estado_creado_en_idx" ON "Reporte"("estado", "creado_en");

-- CreateIndex
CREATE INDEX "Reporte_proceso_id_dimension_formato_creado_en_idx" ON "Reporte"("proceso_id", "dimension", "formato", "creado_en");

-- AddForeignKey
ALTER TABLE "Reporte" ADD CONSTRAINT "Reporte_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reporte" ADD CONSTRAINT "Reporte_solicitado_por_fkey" FOREIGN KEY ("solicitado_por") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
