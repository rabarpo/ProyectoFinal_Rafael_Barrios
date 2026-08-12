-- administracion-procesos-electorales (design.md D1): delta declarado contra el grupo 2
-- (`base-schema-and-migrations`, `20260807040013_electoral_process_structure`). Agrega los enums
-- `PublicoObjetivo`/`AlcanceSegmentacion` y el snapshot de segmentación en `ProcesoElectoral`.

-- CreateEnum
CREATE TYPE "PublicoObjetivo" AS ENUM ('estudiantes', 'padres', 'comunidad');
CREATE TYPE "AlcanceSegmentacion" AS ENUM ('institucion', 'nivel', 'grados', 'aulas');

-- AlterTable
ALTER TABLE "ProcesoElectoral"
  ADD COLUMN "publico_objetivo"   "PublicoObjetivo"      NOT NULL DEFAULT 'estudiantes',
  ADD COLUMN "alcance"            "AlcanceSegmentacion"  NOT NULL DEFAULT 'institucion',
  ADD COLUMN "nivel_id_snapshot"  UUID,
  ADD COLUMN "grado_ids_snapshot" UUID[]                 NOT NULL DEFAULT ARRAY[]::UUID[];

-- Los DEFAULT existen solo para poblar filas preexistentes; se retiran acto seguido para que el
-- cliente de Prisma exija ambos campos en cada `create` (ver design.md D1, "Fundamento").
ALTER TABLE "ProcesoElectoral" ALTER COLUMN "publico_objetivo" DROP DEFAULT;
ALTER TABLE "ProcesoElectoral" ALTER COLUMN "alcance"          DROP DEFAULT;
