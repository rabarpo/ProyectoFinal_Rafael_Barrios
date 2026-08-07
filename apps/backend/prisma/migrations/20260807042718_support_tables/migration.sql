-- CreateEnum
CREATE TYPE "EstadoJobCorreo" AS ENUM ('pendiente', 'enviado', 'fallido');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('correo');

-- CreateEnum
CREATE TYPE "TipoActa" AS ENUM ('apertura', 'cierre', 'resultados');

-- CreateEnum
CREATE TYPE "EstadoActa" AS ENUM ('borrador', 'emitida');

-- CreateTable
CREATE TABLE "JobCorreo" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "asunto" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "estado" "EstadoJobCorreo" NOT NULL DEFAULT 'pendiente',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCorreo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" UUID NOT NULL,
    "job_correo_id" UUID NOT NULL,
    "tipo" "TipoNotificacion" NOT NULL DEFAULT 'correo',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "anio_escolar_id" UUID NOT NULL,
    "smtp_host" TEXT,
    "smtp_puerto" INTEGER,
    "smtp_remitente" TEXT,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acta" (
    "id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "tipo" "TipoActa" NOT NULL,
    "estado" "EstadoActa" NOT NULL DEFAULT 'borrador',
    "contenido" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Acta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Configuracion_clave_key" ON "Configuracion"("clave");

-- AddForeignKey
ALTER TABLE "JobCorreo" ADD CONSTRAINT "JobCorreo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_job_correo_id_fkey" FOREIGN KEY ("job_correo_id") REFERENCES "JobCorreo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuracion" ADD CONSTRAINT "Configuracion_anio_escolar_id_fkey" FOREIGN KEY ("anio_escolar_id") REFERENCES "AnioEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acta" ADD CONSTRAINT "Acta_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
