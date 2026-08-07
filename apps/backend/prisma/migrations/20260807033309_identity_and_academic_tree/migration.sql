-- CreateEnum
CREATE TYPE "RolUsuario" AS ENUM ('estudiante', 'docente', 'comite', 'administrador', 'director');

-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('activo', 'inactivo', 'bloqueado');

-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('manana', 'tarde');

-- CreateTable
CREATE TABLE "Usuario" (
    "id" UUID NOT NULL,
    "nombres" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "correo" TEXT NOT NULL,
    "rol" "RolUsuario" NOT NULL,
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'activo',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apoderado" (
    "id" UUID NOT NULL,
    "nombres" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "correo" TEXT,
    "usuario_id" UUID NOT NULL,

    CONSTRAINT "Apoderado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnioEscolar" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnioEscolar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nivel" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Nivel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grado" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "nivel_id" UUID NOT NULL,

    CONSTRAINT "Grado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seccion" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "grado_id" UUID NOT NULL,
    "anio_escolar_id" UUID NOT NULL,

    CONSTRAINT "Seccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Aula" (
    "id" UUID NOT NULL,
    "turno" "Turno" NOT NULL,
    "grado_id" UUID NOT NULL,
    "seccion_id" UUID NOT NULL,
    "anio_escolar_id" UUID NOT NULL,

    CONSTRAINT "Aula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matricula" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "aula_id" UUID NOT NULL,
    "anio_escolar_id" UUID NOT NULL,

    CONSTRAINT "Matricula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_dni_key" ON "Usuario"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_codigo_key" ON "Usuario"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_correo_key" ON "Usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "AnioEscolar_nombre_key" ON "AnioEscolar"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Nivel_nombre_key" ON "Nivel"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Grado_nivel_id_nombre_key" ON "Grado"("nivel_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Seccion_grado_id_anio_escolar_id_nombre_key" ON "Seccion"("grado_id", "anio_escolar_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Aula_grado_id_seccion_id_anio_escolar_id_key" ON "Aula"("grado_id", "seccion_id", "anio_escolar_id");

-- CreateIndex
CREATE UNIQUE INDEX "Matricula_usuario_id_aula_id_anio_escolar_id_key" ON "Matricula"("usuario_id", "aula_id", "anio_escolar_id");

-- AddForeignKey
ALTER TABLE "Apoderado" ADD CONSTRAINT "Apoderado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Grado" ADD CONSTRAINT "Grado_nivel_id_fkey" FOREIGN KEY ("nivel_id") REFERENCES "Nivel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seccion" ADD CONSTRAINT "Seccion_grado_id_fkey" FOREIGN KEY ("grado_id") REFERENCES "Grado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seccion" ADD CONSTRAINT "Seccion_anio_escolar_id_fkey" FOREIGN KEY ("anio_escolar_id") REFERENCES "AnioEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aula" ADD CONSTRAINT "Aula_grado_id_fkey" FOREIGN KEY ("grado_id") REFERENCES "Grado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aula" ADD CONSTRAINT "Aula_seccion_id_fkey" FOREIGN KEY ("seccion_id") REFERENCES "Seccion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Aula" ADD CONSTRAINT "Aula_anio_escolar_id_fkey" FOREIGN KEY ("anio_escolar_id") REFERENCES "AnioEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_aula_id_fkey" FOREIGN KEY ("aula_id") REFERENCES "Aula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matricula" ADD CONSTRAINT "Matricula_anio_escolar_id_fkey" FOREIGN KEY ("anio_escolar_id") REFERENCES "AnioEscolar"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL raw a mano (design.md D2/D5, tarea 1.3): a lo sumo un AnioEscolar activo. Prisma no
-- expresa índices únicos parciales en el DSL, así que esta restricción vive únicamente aquí y
-- se verifica por catálogo (pg_indexes) y por tests de rechazo conductuales (23505 / P2002).
CREATE UNIQUE INDEX "anio_escolar_activo_unico_idx" ON "AnioEscolar" ("activo") WHERE "activo" = true;
