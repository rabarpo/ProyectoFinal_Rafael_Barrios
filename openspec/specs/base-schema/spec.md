# Especificación: base-schema

## Purpose

Define el esqueleto relacional duradero de SEEI — modelos Prisma más SQL raw donde Prisma no
alcanza — para identidad, árbol académico, estructura del proceso electoral, núcleo de votación y
tablas de soporte. Solo tablas e invariantes a nivel de base de datos; ningún CRUD, servicio ni
comportamiento de aplicación. `EventoAuditoría` y las columnas de credenciales de `Usuario` quedan
fuera. Capacidad greenfield — no hay spec previa que modificar.

## Requirements

### Requirement: Identidad y árbol académico
El sistema MUST modelar `Usuario` (identidad/rol/estado, sin credenciales), `Apoderado` (vinculado
1—N a `Usuario` estudiante, sin credenciales, ADR-0011), `AñoEscolar`, `Nivel 1—N Grado`,
`Grado 1—N Sección` acotados por `AñoEscolar`, `Aula` como una fila por `(Grado, Sección,
AñoEscolar)` con `Turno` como atributo propio, y `Matrícula` (`Usuario` estudiante ↔ `Aula` en un
`AñoEscolar`), con integridad referencial FK en todas las relaciones del árbol.

#### Scenario: El árbol académico se construye completo
- GIVEN `schema.prisma` tras aplicar este change
- WHEN se inspeccionan `Nivel`, `Grado`, `Sección`, `Aula` y `Matrícula`
- THEN cada uno declara sus relaciones y cardinalidades hacia el nivel superior, con `Turno` como columna de `Aula`

#### Scenario: Una FK inválida en el árbol académico es rechazada
- GIVEN una migración aplicada con las tablas del árbol académico
- WHEN se intenta insertar una `Sección` referenciando un `Grado` inexistente
- THEN Postgres rechaza el insert con una violación de clave foránea

### Requirement: Único `AñoEscolar` activo
El sistema MUST garantizar, mediante un índice único parcial en SQL raw sobre `AñoEscolar.activo
WHERE activo = true`, que a lo sumo un `AñoEscolar` esté activo simultáneamente.

#### Scenario: Un segundo año escolar activo es rechazado
- GIVEN un `AñoEscolar` existente con `activo = true`
- WHEN se intenta insertar o actualizar otro `AñoEscolar` a `activo = true`
- THEN Postgres rechaza la operación con violación de índice único (`23505`) o Prisma reporta `P2002`

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

### Requirement: Cero votos duplicados
El sistema MUST imponer `@@unique([proceso_id, derecho_voto_id])` (DSL nativo de Prisma) sobre
`Voto`, garantizando que un `DerechoVoto` no genere más de un `Voto` por proceso (ADR-0003).

#### Scenario: Un segundo voto para el mismo derecho es rechazado
- GIVEN un `Voto` existente con un `(proceso_id, derecho_voto_id)` dado
- WHEN se intenta insertar otro `Voto` con el mismo par
- THEN Postgres rechaza el insert con violación de unicidad (`23505`) o Prisma reporta `P2002`

### Requirement: Exactamente una elección por voto
El sistema MUST imponer, mediante una restricción `CHECK` en SQL raw sobre `Voto`, que
exactamente uno de `{lista_id, opcion_id, candidato_id, blanco}` esté establecido — no existe voto
nulo (ADR-0008); `candidato_id` soporta voto por candidato individual junto a lista/opción/blanco.

#### Scenario: Un voto con dos elecciones establecidas es rechazado
- GIVEN una fila de `Voto` en preparación con `lista_id` y `candidato_id` ambos establecidos
- WHEN se intenta insertar esa fila
- THEN Postgres rechaza el insert con violación de `CHECK` (`23514`)

#### Scenario: Un voto sin ninguna elección establecida es rechazado
- GIVEN una fila de `Voto` en preparación con `lista_id`, `opcion_id`, `candidato_id` en `NULL` y `blanco = false`
- WHEN se intenta insertar esa fila
- THEN Postgres rechaza el insert con violación de `CHECK` (`23514`)

#### Scenario: Un voto en blanco es aceptado
- GIVEN una fila de `Voto` en preparación con `blanco = true` y `lista_id`, `opcion_id`, `candidato_id` en `NULL`
- WHEN se intenta insertar esa fila
- THEN Postgres acepta el insert

### Requirement: Frontera del secreto del voto
El sistema MUST NOT definir ninguna vista, join de conveniencia o proyección de esquema que
vincule la identidad del votante con su elección para ningún rol distinto del propio votante
(ADR-0010). Esta frontera es responsabilidad de la capa de esquema; la autorización de quién
consulta el comprobante propio es responsabilidad de la aplicación, fuera de alcance de este change.

#### Scenario: No existe artefacto de esquema que una identidad y elección
- GIVEN el esquema completo tras aplicar las cuatro migraciones
- WHEN se inspeccionan las migraciones y `schema.prisma` en busca de vistas o joins predefinidos entre `Usuario`/`DerechoVoto` y la elección de `Voto`
- THEN no existe ninguna vista ni join de conveniencia con ese propósito

### Requirement: Tablas de soporte
El sistema MUST modelar `JobCorreo`/`Notificación` (outbox, sin trigger ni cableado de envío en
este change), `Configuración` (singleton institucional) y `Acta` (tipo, proceso, contenido,
estado), cada una con FK válida hacia `ProcesoElectoral` donde corresponda.

#### Scenario: `Acta` referencia un `ProcesoElectoral` válido
- GIVEN un `ProcesoElectoral` existente
- WHEN se inserta una `Acta` referenciándolo
- THEN el insert se acepta

### Requirement: Migraciones agrupadas apiladas tras la baseline vacía
El sistema MUST aplicar exactamente cuatro grupos de migración, cada uno independientemente
fusionable, apilados directamente tras la baseline vacía de `system-scaffolding`: (1) identidad y
árbol académico, (2) estructura del proceso electoral, (3) núcleo de votación, (4) tablas de
soporte.

#### Scenario: Las cuatro migraciones se aplican en orden sin error
- GIVEN una base de datos con solo la migración baseline vacía aplicada
- WHEN se ejecuta `prisma migrate deploy` con las cuatro migraciones de este change
- THEN las cuatro se aplican en orden sin error y sin crear tablas fuera del inventario de alcance

### Requirement: Seeds estructurales restringidos a no-producción
El sistema MUST proveer un seed que crea únicamente datos estructurales (un `AñoEscolar` activo,
un fixture mínimo de árbol académico, una fila de `Usuario` por rol sin credenciales, un singleton
de `Configuración` con datos de marcador de posición) y MUST NOT ejecutarse cuando
`NODE_ENV === 'production'`.

#### Scenario: El seed se rechaza en producción
- GIVEN `NODE_ENV=production`
- WHEN se ejecuta el script de seed
- THEN el script termina sin crear ninguna fila y sin código de salida 0

#### Scenario: El seed no crea material de credenciales
- GIVEN el script de seed ejecutado fuera de producción
- WHEN se inspeccionan las filas de `Usuario` creadas
- THEN ninguna contiene `password_hash`, identificador OAuth ni otro material de credenciales

### Requirement: Suite de rechazo de restricciones con códigos de error reales
El sistema MUST incluir tests de integración contra un Postgres real que verifiquen que cada
restricción de este spec (voto duplicado, segundo año activo, `CHECK` de elección, FK del árbol
académico) es rechazada con su código de error real (`23505`, `23514`) o el `P2002` de Prisma —
constituyendo el contrato RED/GREEN bajo TDD estricto.

#### Scenario: La suite falla en RED y pasa en GREEN
- GIVEN la suite de tests de rechazo escrita antes de aplicar la restricción correspondiente
- WHEN se ejecuta contra el esquema sin la restricción aplicada
- THEN el test falla (RED); tras aplicar la migración con la restricción, el mismo test pasa verificando el código de error real (GREEN)
