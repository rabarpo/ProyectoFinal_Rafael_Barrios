-- CreateEnum
CREATE TYPE "TipoProceso" AS ENUM ('municipio', 'representante_aula', 'padres', 'consulta');

-- CreateEnum
CREATE TYPE "EstadoProceso" AS ENUM ('borrador', 'abierto', 'cerrado', 'acta_emitida');

-- CreateEnum
CREATE TYPE "EstadoParticipacion" AS ENUM ('activo', 'baja');

-- CreateTable
CREATE TABLE "ProcesoElectoral" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" "TipoProceso" NOT NULL,
    "estado" "EstadoProceso" NOT NULL DEFAULT 'borrador',
    "fecha_apertura_prevista" TIMESTAMPTZ(3) NOT NULL,
    "fecha_cierre_prevista" TIMESTAMPTZ(3) NOT NULL,
    "apertura_real" TIMESTAMPTZ(3),
    "cierre_real" TIMESTAMPTZ(3),
    "ocultar_resultados" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcesoElectoral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lista" (
    "id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "simbolo" TEXT,
    "lema" TEXT,
    "propuesta" TEXT,
    "plan_trabajo_url" TEXT,
    "estado" "EstadoParticipacion" NOT NULL DEFAULT 'activo',
    "baja_en" TIMESTAMPTZ(3),

    CONSTRAINT "Lista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidato" (
    "id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "lista_id" UUID,
    "nombres" TEXT NOT NULL,
    "grado" TEXT,
    "aula" TEXT,
    "cargo" TEXT,
    "estado" "EstadoParticipacion" NOT NULL DEFAULT 'activo',
    "baja_en" TIMESTAMPTZ(3),

    CONSTRAINT "Candidato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpcionConsulta" (
    "id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "OpcionConsulta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcesoAula" (
    "id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "aula_id" UUID NOT NULL,

    CONSTRAINT "ProcesoAula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Lista_proceso_id_numero_key" ON "Lista"("proceso_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "OpcionConsulta_proceso_id_etiqueta_key" ON "OpcionConsulta"("proceso_id", "etiqueta");

-- CreateIndex
CREATE UNIQUE INDEX "ProcesoAula_proceso_id_aula_id_key" ON "ProcesoAula"("proceso_id", "aula_id");

-- AddForeignKey
ALTER TABLE "Lista" ADD CONSTRAINT "Lista_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidato" ADD CONSTRAINT "Candidato_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidato" ADD CONSTRAINT "Candidato_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "Lista"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpcionConsulta" ADD CONSTRAINT "OpcionConsulta_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcesoAula" ADD CONSTRAINT "ProcesoAula_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcesoAula" ADD CONSTRAINT "ProcesoAula_aula_id_fkey" FOREIGN KEY ("aula_id") REFERENCES "Aula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
