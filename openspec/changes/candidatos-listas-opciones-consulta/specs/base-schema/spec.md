# Delta for base-schema

## MODIFIED Requirements

### Requirement: Estructura del proceso electoral
El sistema MUST modelar `ProcesoElectoral`, `Lista`/`Candidato` (voto de lista cerrada para
municipio escolar), `OpciónConsulta` y `DerechoVoto` (padrón congelado, con `en_calidad_de`
estudiante/padre/docente según ADR-0011), cada uno con integridad referencial hacia
`ProcesoElectoral` y hacia la estructura académica participante. `Candidato` MUST incluir columnas
aditivas `foto Bytes?` y `foto_mime String?` para almacenar la foto del postulante — nullable en
la base de datos; la obligatoriedad de la foto la impone el servicio, no una restricción `NOT
NULL`, porque la regla está declarada revisable (sin reglamento previo). `Lista.plan_trabajo_url`
MUST reemplazarse por `plan_trabajo Bytes?` + `plan_trabajo_mime String?` +
`plan_trabajo_nombre String?` (almacenamiento binario del PDF, espejo de
`Configuracion.logo`/`logo_mime`).
(Previously: `Lista.plan_trabajo_url` era `String?` (URL) y `Candidato` no tenía columnas de
foto.)

#### Scenario: `DerechoVoto` referencia un `ProcesoElectoral` y una cuenta válidos
- GIVEN un `ProcesoElectoral` y un `Usuario` existentes
- WHEN se inserta un `DerechoVoto` referenciándolos
- THEN el insert se acepta y queda vinculado por FK a ambos

#### Scenario: Un `DerechoVoto` sin `ProcesoElectoral` válido es rechazado
- GIVEN ningún `ProcesoElectoral` con el id dado
- WHEN se intenta insertar un `DerechoVoto` con ese `proceso_id`
- THEN Postgres rechaza el insert con violación de clave foránea

#### Scenario: `Candidato` gana columnas de foto y `Lista` reemplaza `plan_trabajo_url` por `Bytes`
- GIVEN `schema.prisma` tras aplicar este change
- WHEN se inspeccionan los modelos `Candidato` y `Lista`
- THEN `Candidato` tiene `foto Bytes?` y `foto_mime String?`, y `Lista` tiene
  `plan_trabajo Bytes?`, `plan_trabajo_mime String?` y `plan_trabajo_nombre String?`, sin que
  `Lista.plan_trabajo_url` exista más

#### Scenario: La migración de `Lista.plan_trabajo_url` es rompiente pero sin filas reales a preservar
- GIVEN la base de datos previa a este change, sin procesos con listas aún
  (`apps/backend/src/candidatos/` no existe todavía; `prisma/seed.ts` no crea listas)
- WHEN se aplica la migración que reemplaza `plan_trabajo_url` (`String?`) por
  `plan_trabajo`/`plan_trabajo_mime`/`plan_trabajo_nombre`
- THEN la migración se aplica sin necesidad de backfill, tras verificar
  `SELECT count(*) FROM "Lista" WHERE plan_trabajo_url IS NOT NULL` = 0
