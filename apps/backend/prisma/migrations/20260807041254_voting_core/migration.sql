-- CreateTable
CREATE TABLE "DerechoVoto" (
    "id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "en_calidad_de" TEXT NOT NULL,
    "aula_snapshot" TEXT NOT NULL,

    CONSTRAINT "DerechoVoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Voto" (
    "id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "derecho_voto_id" UUID NOT NULL,
    "lista_id" UUID,
    "opcion_id" UUID,
    "candidato_id" UUID,
    "blanco" BOOLEAN NOT NULL DEFAULT false,
    "codigo_comprobante" TEXT NOT NULL,
    "clave_idempotencia" TEXT NOT NULL,
    "hora_servidor" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Voto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Voto_codigo_comprobante_key" ON "Voto"("codigo_comprobante");

-- CreateIndex
CREATE UNIQUE INDEX "Voto_proceso_id_derecho_voto_id_key" ON "Voto"("proceso_id", "derecho_voto_id");

-- CreateIndex
CREATE UNIQUE INDEX "Voto_proceso_id_clave_idempotencia_key" ON "Voto"("proceso_id", "clave_idempotencia");

-- AddForeignKey
ALTER TABLE "DerechoVoto" ADD CONSTRAINT "DerechoVoto_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DerechoVoto" ADD CONSTRAINT "DerechoVoto_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_derecho_voto_id_fkey" FOREIGN KEY ("derecho_voto_id") REFERENCES "DerechoVoto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "Lista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_opcion_id_fkey" FOREIGN KEY ("opcion_id") REFERENCES "OpcionConsulta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Voto" ADD CONSTRAINT "Voto_candidato_id_fkey" FOREIGN KEY ("candidato_id") REFERENCES "Candidato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateCheck (SQL raw a mano — design.md D2/D5; Prisma no expresa CHECK en el DSL)
-- "exactamente una elección" (spec, "Exactamente una elección por voto"; ADR-0008): exige que
-- num_nonnulls("lista_id","opcion_id","candidato_id") + "blanco"::int sea exactamente 1.
-- `blanco` es NOT NULL DEFAULT false (ver schema.prisma) para que el CHECK sea exigible: si fuera
-- nulable, NULL::int volvería NULL toda la suma y Postgres ACEPTA una fila cuyo CHECK evalúa NULL.
ALTER TABLE "Voto"
  ADD CONSTRAINT "voto_eleccion_exactamente_una_chk"
  CHECK (num_nonnulls("lista_id", "opcion_id", "candidato_id") + "blanco"::int = 1);
