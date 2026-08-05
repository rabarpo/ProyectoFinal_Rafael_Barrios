# Exploración: base-schema-and-migrations (Backlog #2 — Esquema base y migraciones)

## Dependencia bloqueante

**Este change está BLOQUEADO por el Backlog #1 (`system-scaffolding`), que solo está planificado, no implementado.**
Todavía no hay `package.json`, ni `apps/backend`, ni instalación de Prisma, ni Postgres en Docker Compose, ni
pipeline de CI en ninguna parte del repositorio — solo `openspec/changes/system-scaffolding/{exploration,proposal}.md`.
Este change no puede llegar a `sdd-apply` hasta que #1 se entregue: pnpm workspaces, `apps/backend` (NestJS), Prisma
instalado con su **migración baseline vacía**, Jest, Postgres/Redis en Docker Compose y CI con GitHub Actions
son todos prerrequisitos estructurales que este plan asume existentes. El plan de migraciones de abajo está diseñado
para apilarse limpiamente sobre esa baseline vacía (nuevas migraciones agregadas después de ella; nada de la baseline
de #1 necesita cambiar).

## Estado actual

Repositorio solo de documentación. La sección "Modelo de datos" de `TECH-DESIGN.md` es la fuente única de las
entidades; PRD.md aporta las reglas de producto que el esquema debe expresar; 13 ADR refinan o corrigen partes de ese
modelo (en particular ADR-0003 sobre los límites de Postgres/Prisma, ADR-0008 sobre reglas operativas, ADR-0010 sobre
secreto y retención de auditoría, ADR-0011 sobre el modelo de voto de padres/apoderados, ADR-0012 sobre el patrón
outbox). `REVISION-ADVERSARIAL.md` documenta dos hallazgos críticos (C1 voto secreto en la base de datos, C2
contradicción de la cuenta de padres), ambos resueltos por ADR-0010/ADR-0011 — ambos ya reflejados en el texto actual
del TDD, así que allí no queda ninguna contradicción sin resolver. `openspec/config.yaml` registra Prisma como ORM y
`strict_tdd: true` de forma global.

## Áreas afectadas (a crear — todavía no existe ninguna, depende por completo del andamiaje de #1)

- `apps/backend/prisma/schema.prisma` — nuevos modelos Prisma para los grupos de entidades dentro de alcance (ver Q2)
- `apps/backend/prisma/migrations/*` — una o más migraciones aumentadas con SQL raw, apiladas después de la migración
  baseline vacía de #1
- `apps/backend/prisma/seed.ts` (o `prisma/seed/`) — script mínimo de seed para dev/test, restringido a entornos que no
  sean producción
- `apps/backend/test/schema/*.spec.ts` (o similar) — tests de integración que verifican el rechazo de restricciones a
  nivel de base de datos (ver Q7)
- `openspec/config.yaml` — no se esperan cambios (los comandos de test/build ya los define #1); marcar solo si este
  change introduce un comando `test:schema` distinto que valga la pena registrar

## Q1 — Límite de alcance: qué entidades corresponden aquí y cuáles se difieren

La sección "Modelo de datos" del TECH-DESIGN lista todas las entidades, pero el BACKLOG asigna deliberadamente la
mayor parte de su **comportamiento** (CRUD, reglas de negocio, lógica de generación) a ítems posteriores (#3 motor de
auditoría, #4-6 auth, #7 usuarios, #8 académico, #9 importación, #10 configuración, #11 procesos, #12 candidatos, #13
padrón, #14 votación, #15 outbox, #17 actas). Si #2 no construyera nada hasta que existiera cada uno de esos ítems, #2
quedaría casi vacío y cada ítem posterior necesitaría su propia migración de esquema — contradiciendo el título del
backlog "Esquema base y migraciones" y su instrucción a los demás ítems ("Contexto extra requerido: —", es decir,
asumen que el esquema ya existe para construir sobre él).

**Resolución — esquema primero, comportamiento después, con una excepción deliberada:**

Este change crea el **DDL de las tablas** (modelos Prisma + SQL raw para lo que Prisma no puede expresar) para el
esqueleto relacional completo, de modo que los ítems #7–#17 construyan la lógica de aplicación (servicios, endpoints,
UI) contra tablas que ya existen y ya imponen sus invariantes a nivel de base de datos. Esto incluye tablas cuyo
*comportamiento* pertenece después a otro ítem (p. ej. la tabla `JobCorreo`/`Notificación` ahora, el cableado del
outbox en #15; la tabla `Configuración` ahora, el CRUD de administración en #10; la tabla `Acta` ahora, la generación
de PDF en #17).

**`EventoAuditoría` es la única excepción deliberada — se mueve por completo a #3, tabla incluida.** Argumento:

1. **El TDD estricto obliga a tener un motivo para agregar una tabla.** Cada tabla de este change debe estar impulsada
   por un test RED que ejercite una restricción real (Q7). La única restricción significativa de `EventoAuditoría` es
   exactamente lo que construye `#3` — los triggers anti-`UPDATE`/`DELETE` y los permisos restringidos. Una tabla
   desnuda sin triggers en #2 no tiene restricción que probar, no tiene escritor (nada en #2, y nada antes de #3 en la
   cadena de dependencias, inserta jamás en ella) ni lector — sería esquema muerto agregado por especulación, algo
   contra lo que argumentan tanto el TDD estricto como YAGNI.
2. **La propia redacción del backlog asigna la entidad completa a #3** ("`EventoAuditoría` con triggers anti
   UPDATE/DELETE y **servicio de registro transaccional**"), a diferencia de `JobCorreo`/`Configuración`/`Acta`, cuya
   redacción de backlog para #15/#10/#17 describe features de *aplicación* (cableado del outbox, pantallas de
   administración, generación de PDF) apiladas sobre una tabla, no un comportamiento definitorio a nivel de base de
   datos de la tabla misma.
3. **Una migración atómica es más limpia que dos.** Como el DSL de esquema de Prisma no puede expresar triggers en
   absoluto, `#3` necesita una migración con SQL raw sin importar quién cree la tabla. Hacer `CREATE TABLE
   eventos_auditoria (...); CREATE TRIGGER ...; REVOKE ...;` como una migración autocontenida en #3 es más simple que
   #2 creando la tabla vía el DSL de Prisma y #3 editando después a mano una migración posterior de solo SQL raw para
   retroadaptar triggers sobre una tabla que de otro modo no toca.
4. **Sin riesgo de dependencias**: nada dentro del alcance propio de #2 (datos de seed, tests de esquema) necesita
   escribir un evento de auditoría, y la cadena de dependencias (#3 depende de #2, #4 depende de #3) ya garantiza que
   la tabla de auditoría exista con sus triggers antes de cualquier módulo de dominio (#7+) que quisiera registrar en
   ella.

**Regla de límite:** #2 entrega el esqueleto relacional duradero (tablas, FK, los invariantes exigibles a nivel de base
de datos que no requieren triggers) para toda entidad del modelo de datos del TECH-DESIGN **excepto**
`EventoAuditoría`, que es responsabilidad extremo a extremo de #3 (tabla + triggers + servicio).

## Q2 — Inventario de entidades

| Entidad | Atributos clave | Relaciones / cardinalidad | Ambigüedad señalada |
|---|---|---|---|
| `Usuario` | nombres, dni (único), codigo (único), correo (único), rol (enum: estudiante/docente/comite/administrador/director), estado (activo/inactivo/bloqueado) | 1—N `Matrícula`, 1—N `DerechoVoto`, 1—N `Apoderado` (como estudiante) | El TDD nombra `bloqueado_hasta` como atributo de `Usuario`, pero el ítem #6 es dueño del comportamiento de bloqueo/desbloqueo. **En ningún lugar de la lista de entidades del TDD se nombra un campo de credencial o autenticación** (ni `password_hash`, ni identificador OAuth) pese a que el PRD exige ambos métodos de autenticación — hueco genuino. Recomendación: incluir ahora solo columnas de identidad/rol/estado; dejar `bloqueado_hasta`, `password_hash`, el identificador OAuth y el contador de logins fallidos para #4/#5/#6 como migraciones aditivas, ya que inventar su forma ahora sería adivinar decisiones que pertenecen a esos ítems (algoritmo de hashing, mapeo de claims del proveedor OAuth). |
| `Apoderado` | estudiante_id (FK→Usuario), nombres, dni, correo_contacto | N filas de Apoderado posibles por estudiante; **sin deduplicación entre hermanos** — ADR-0011 eliminó deliberadamente la antigua entidad `Representación`, de modo que un mismo padre físico con 3 hijos produce 3 filas independientes de `Apoderado`, una por hijo. Es intencional, no un descuido. | Ninguna — coincide exactamente con ADR-0011. |
| `AñoEscolar` | nombre, fecha_inicio, fecha_fin, activo (bool) | Referenciado por `Matrícula` y `Configuración.año_activo_id` | "Solo un año activo" necesita un **índice único parcial** (`WHERE activo = true`) — SQL raw, ver Q3. |
| `Nivel`, `Grado`, `Sección`, `Aula`, `Turno` | árbol académico jerárquico | El TDD solo dice "árbol académico para segmentar procesos" — no fija la jerarquía exacta | **Ambiguo.** No queda claro si `Aula` = (Grado, Sección) compuesto y acotado por `AñoEscolar`, ni si `Turno` es un atributo de `Aula` o un eje independiente. #2 necesita *alguna* estructura para desbloquear `Matrícula`/`ProcesoElectoral`; se propone `Nivel 1—N Grado`, `Grado 1—N Sección` (acotado por `AñoEscolar`), `Aula` = una fila por (Grado, Sección, AñoEscolar) con `Turno` como atributo — señalado como **provisional a la espera de la spec propia de #8**, con el riesgo real de que #8 exija una migración posterior que rompa el esquema si esta suposición es incorrecta. |
| `Matrícula` | estudiante_id (FK), aula_id (FK), año_escolar_id (FK) | Único por (estudiante_id, año_escolar_id) | Ninguna. |
| `ProcesoElectoral` | nombre, descripcion, tipo (municipio/representante_aula/padres/consulta), fecha, hora_apertura, hora_cierre, estado (borrador→abierto→cerrado→acta_emitida), ocultar_resultados (bool, congelado al abrir), apertura_real/cierre_real (timestamps nulables) | Nivel/grados/aulas participantes | El TDD no dice si "nivel/grados/aulas participantes" es un arreglo JSON o tablas de unión propiamente dichas. Se recomiendan tablas de unión (`ProcesoAula`, etc.) por integridad referencial — el cálculo del padrón necesita hacer JOIN, no escanear blobs JSON. |
| `Lista` | proceso_id (FK), numero, simbolo, lema, propuesta, plan_trabajo_pdf, estado, baja_en | 1—N `Candidato` | — |
| `Candidato` | lista_id (FK, ¿nulable?), foto, nombres, grado, aula, cargo, estado, baja_en | Ver la ambigüedad | **Ambigüedad significativa**: el TDD dice que la votación de municipio es por lista cerrada ("el voto es por lista"), lo que implica que otros tipos de proceso (representante de aula) podrían votarse por **candidato individual**, no por lista. Ni el TDD ni los ADR establecen si `Voto.eleccion` puede referenciar un `Candidato` suelto sin un envoltorio de `Lista`. Esto afecta directamente al diseño de la referencia polimórfica de elección de `Voto` (Q4) y debería resolverse antes del slice de migración de Voto/DerechoVoto. |
| `OpciónConsulta` | proceso_id (FK), etiqueta (A/B/C…), descripcion | — | — |
| `DerechoVoto` | usuario_id (FK), proceso_id (FK), en_calidad_de (estudiante/padre/docente), aula_snapshot, estado (pendiente/ejercido) | Único (usuario_id, proceso_id, en_calidad_de) — necesario porque una consulta a toda la comunidad da a un mismo usuario **dos** derechos (el propio y el de padre) | — |
| `Voto` | proceso_id (FK), derecho_voto_id (FK), eleccion (lista_id / opcion_id / candidato_id / blanco — exactamente uno), codigo_comprobante (único), hora_servidor (generado por la base de datos), clave_idempotencia | `UNIQUE (proceso_id, derecho_voto_id)` — la garantía de "0 votos duplicados" | La referencia polimórfica de elección depende de resolver la ambigüedad `Candidato` vs. `Lista` señalada arriba. |
| `JobCorreo` / `Notificación` | tipo, destinatario_usuario_id (FK), plantilla, variables (JSONB), estado (pendiente/enviado/fallido), intentos, entidad_relacionada | Solo la tabla — el *cableado* del outbox (inserción dentro de la transacción, despachador, consumo por el worker) es trabajo de #15 | — |
| `Configuración` | institucion_nombre, logo_url, director_nombre, comite (JSONB), año_activo_id (FK), zona_horaria, colores (JSONB), smtp_config, dominio_google_workspace | Fila singleton | **Riesgo**: las credenciales SMTP no deberían vivir como columna en texto plano en la base de datos; se recomienda referenciar en su lugar un gestor de secretos o variables de entorno y almacenar aquí solo metadatos SMTP no secretos (host/puerto/dirección remitente) — señalar para que #10 lo decida explícitamente. |
| `Acta` | tipo (apertura/cierre/escrutinio/oficial), proceso_id (FK), contenido_congelado (JSONB), pdf_url, estado, generado_en | Solo la tabla — la generación de PDF y la lógica de cuadre es trabajo de #17 | — |
| ~~`EventoAuditoría`~~ | — | — | **Diferido por completo a #3** (ver Q1). |

## Q3 — Prisma vs. SQL raw (corrigiendo la premisa del brief en un punto)

**Corrección**: el planteo del brief da a entender que `UNIQUE (proceso, derecho)` necesita SQL raw. No es así — una
restricción única compuesta simple es expresable de forma nativa como `@@unique([proceso_id, derecho_voto_id])` en
`schema.prisma`; Prisma genera un `CREATE UNIQUE INDEX` ordinario para ella. Verificado contra las capacidades
actuales del DSL de esquema de Prisma (el `@@unique` compuesto sin cláusula `WHERE` está soportado desde los primeros
Prisma 2.x).

Lo que sí **requiere SQL raw** porque el DSL de esquema de Prisma no puede expresarlo:

| Restricción | Por qué SQL raw |
|---|---|
| `AñoEscolar`: solo un `activo = true` a la vez | **Índice único parcial/filtrado** (`CREATE UNIQUE INDEX ... WHERE activo = true`) — Prisma no soporta cláusula `WHERE` en `@@unique`/`@@index`. |
| `Voto`: exactamente uno de {lista_id, opcion_id, candidato_id, blanco=true} establecido | **Restricción CHECK** (`ALTER TABLE ... ADD CONSTRAINT ... CHECK (...)`) — `schema.prisma` no tiene sintaxis de restricción CHECK en absoluto. |
| `EventoAuditoría` anti-`UPDATE`/`DELETE` (diferido a #3) | Triggers y permisos `REVOKE` — cero soporte en Prisma, siempre SQL raw. |

**Cómo mantener coherentes `schema.prisma` y el SQL raw:**

1. Generar la parte expresable en el DSL con `prisma migrate dev --create-only`, luego editar a mano el
   `migration.sql` generado para agregar la restricción en SQL raw **en el mismo archivo de migración** siempre que ese
   SQL raw forme parte de la misma tabla conceptual (p. ej. el CHECK de `Voto` pertenece a la misma migración que crea
   `Voto`) — esto mantiene atómico el `prisma migrate deploy` para esa tabla.
2. Agregar un comentario `// NOTE:` justo encima del modelo Prisma afectado que apunte al archivo de migración que
   lleva el SQL raw, dado que `schema.prisma` no puede mostrar la restricción en sí.
3. La garantía real de coherencia es la **suite de tests de integración** (Q7), no el comentario: los tests consultan
   `pg_constraint`/`pg_indexes` (o simplemente intentan violar la restricción) después de migrar, de modo que
   cualquier deriva entre la intención de `schema.prisma` y el SQL aplicado hace fallar CI de inmediato.

## Q4 — Restricciones de integridad clave impuestas a nivel de base de datos

| Garantía | Mecanismo | Responsable |
|---|---|---|
| Cero votos duplicados (backlog #14) | `@@unique([proceso_id, derecho_voto_id])` en `Voto` — DSL de Prisma plano | #2 |
| Un único año escolar activo (backlog #8) | Índice único parcial sobre `AñoEscolar.activo WHERE true` — SQL raw | #2 |
| La elección de Voto es exactamente una de {lista/opcion/candidato/blanco} | Restricción `CHECK` — SQL raw | #2 |
| Voto secreto (la identidad nunca vinculable a la elección fuera del propio comprobante del votante) | **No es una restricción de base de datos de #2.** ADR-0010 acepta explícitamente que el acceso directo a Postgres puede leer el vínculo identidad↔elección de `Voto` y lo trata como un riesgo de custodia del despliegue, no como algo que el esquema imponga; la separación real es (a) que `EventoAuditoría` nunca recibe columna `eleccion` alguna (impuesto por omisión, en el diseño de #3) y (b) la autorización a nivel de aplicación (#4/#14) que restringe qué endpoints exponen `Voto.eleccion`. La única responsabilidad de #2 aquí es **no** crear ninguna vista o join de conveniencia que una identidad con elección para roles distintos del votante. |
| Auditoría append-only | Triggers + `REVOKE` | #3 (diferido, ver Q1) |

## Q5 — Estrategia de migración

**Varias migraciones, agrupadas por clúster de entidades, apiladas directamente después de la baseline vacía de #1**
(sin cambio retroactivo sobre esa baseline):

1. `..._identity_and_academic_tree` — `Usuario`, `Apoderado`, `AñoEscolar`, `Nivel`, `Grado`, `Sección`,
   `Aula`, `Turno`, `Matrícula` (+ el índice único parcial en SQL raw)
2. `..._electoral_process_structure` — `ProcesoElectoral`, `Lista`, `Candidato`, `OpciónConsulta`, tablas de unión
   entre proceso y estructura académica
3. `..._voting_core` — `DerechoVoto`, `Voto` (+ la restricción CHECK en SQL raw) — la más pequeña, la de mayor valor,
   podría entregarse por separado dado que lleva la garantía de "0 votos duplicados"
4. `..._support_tables` — `JobCorreo`/`Notificación`, `Configuración`, `Acta`

Nomenclatura: las propias carpetas de migración de Prisma con prefijo de timestamp (`YYYYMMDDHHMMSS_description`) dan
orden cronológico automáticamente; usar slugs descriptivos que coincidan con los grupos de arriba.

**Ejecución de las migraciones:**

- Desarrollo local: `prisma migrate dev` contra el Postgres de Docker Compose establecido por #1.
- CI: `prisma migrate deploy` contra el service container efímero de Postgres ya cableado para los tests e2e del
  backend de #1 — reutilizarlo, no levantar un segundo fixture.
- Producción: todavía no está definido en ninguna parte del repositorio (ADR-0007 cubre la topología de VPS/Docker
  Compose pero hoy ningún paso del pipeline de release/despliegue ejecuta `prisma migrate deploy`) — señalado como
  hueco abierto para el change que primero entregue un camino de despliegue a producción, sin bloquear a #2.

**Reversibilidad:** Prisma no genera migraciones de bajada. Como esto es greenfield y todavía no hay datos de
producción en ningún lado, el rollback de cualquier slice que resulte inviable es `git revert` + (si ya se aplicó a
una base de datos compartida de dev/CI) una pequeña migración hacia adelante que elimine las tablas agregadas — nunca
una migración de bajada escrita a mano y mantenida a largo plazo. Esto refleja el precedente de rollback ya fijado por
la propuesta de #1.

## Q6 — Seeds mínimos

Dado que las columnas de credenciales de `Usuario` están explícitamente diferidas a #4/#5/#6 (Q2), el seed de #2 **no
puede** crear un login funcional de todos modos — esto resuelve estructuralmente, y no solo por procedimiento, la
preocupación de "ninguna credencial que sobreviva hasta producción":

- 1 `AñoEscolar` (`activo = true`)
- Un fixture mínimo de árbol académico (1 `Nivel` → 1 `Grado` → 1 `Sección` → 1 `Aula` → 1 `Turno`)
- 1 fila de `Usuario` por rol (`administrador`, `comite`, `docente`, `estudiante`) — solo campos de identidad; todavía
  no existen columnas de contraseña/OAuth que sembrar
- 1 fila singleton de `Configuración` con datos de institución de marcador de posición, **sin secretos SMTP**

Salvaguardas: restringir el script de seed para que solo corra en dev/test (verificación `NODE_ENV !== 'production'`,
o un script separado `pnpm --filter backend prisma:seed:dev` nunca conectado a ningún camino de despliegue a
producción) — este es el mecanismo real de imposición que pide el brief, ya que no hay credencial que filtrar una vez
diferidas las columnas de autenticación.

## Q7 — Probar un esquema bajo TDD estricto

RED → GREEN → REFACTOR aplicado a restricciones, no a lógica de negocio típica:

- **RED**: escribir primero un test de integración que realice la operación que una restricción debería rechazar
  (p. ej. insertar dos filas de `Voto` con el mismo `proceso_id`+`derecho_voto_id`) contra un Postgres descartable.
  Falla inicialmente — o bien la tabla todavía no existe, o bien la restricción todavía no está allí, así que no se
  lanza ningún error cuando se espera uno.
- **GREEN**: escribir/aplicar la migración real (DSL de Prisma + SQL raw editado a mano según Q3); volver a ejecutar —
  la inserción duplicada ahora lanza el error esperado de Postgres (violación de unicidad `23505`, violación de check
  `23514`, o el `P2002` de Prisma), y el test pasa porque el *rechazo* es la condición de éxito.
- **REFACTOR**: consolidar el SQL de la migración, limpiar nombres y comentarios, mantener el test en verde.

Suite concreta (por restricción de Q4):

- inserción duplicada de `Voto` con el mismo `(proceso_id, derecho_voto_id)` → se espera violación de unicidad
- segundo `AñoEscolar` con `activo = true` mientras ya hay uno activo → se espera violación del índice único parcial
- fila de `Voto` con dos elecciones establecidas (o ninguna) → se espera violación de CHECK
- verificación puntual de integridad de FK (p. ej. `Matrícula` referenciando un `Aula` inexistente) → se espera
  violación de FK

Herramental: reutilizar el fixture de Postgres para e2e del backend de #1 en lugar de introducir Testcontainers como
nueva dependencia — un proyecto/configuración dedicado de Jest (p. ej. `apps/backend/test/schema/**/*.spec.ts`)
ejecutado vía `pnpm --filter backend test:schema`, conectado a CI justo después de `prisma migrate deploy`. El
`tsc`/build ordinario ya valida la corrección sintáctica de `schema.prisma` como subproducto de generar el Prisma
Client — no hace falta un paso separado para esa parte.

## Q8 — Pronóstico de presupuesto de líneas (presupuesto de revisión de 400 líneas)

~14 tablas repartidas en 4 grupos de migración. Estimación aproximada por grupo: bloques de modelo Prisma (10–20
líneas cada uno) + SQL raw editado a mano (10–30 líneas para los grupos con restricciones CHECK/índice parcial) +
aporte al script de seed + tests de rechazo de restricciones (30–60 líneas por restricción, 4 o más restricciones). El
total de líneas autoradas entre los cuatro grupos cae de forma realista en el rango de 800–1400+ — muy por encima del
presupuesto de 400 líneas en un único PR.

**Forma de slices sugerida para `sdd-tasks`** (refleja los grupos de migración de Q5, cada uno fusionable y probable de
forma independiente):

- Slice A: identidad y árbol académico (mayor cantidad de tablas, sin restricciones transversales) — riesgo moderado
- Slice B: estructura del proceso electoral (`ProcesoElectoral`, `Lista`, `Candidato`, `OpciónConsulta`) — bloqueado
  hasta resolver la ambigüedad de granularidad de voto Candidato vs. Lista (Q2) antes de que este slice comience
- Slice C: `DerechoVoto` + `Voto` — el más pequeño, lleva la garantía de mayor valor (0 votos duplicados); se
  recomienda entregar este slice con la máxima atención de revisión
- Slice D: tablas de soporte (`JobCorreo`/`Notificación`, `Configuración`, `Acta`) + finalización del seed

Decisión necesaria antes de apply: **Sí** (ambigüedad Candidato/Lista, jerarquía del árbol académico). PR encadenados
recomendados: **Sí**. Riesgo respecto del presupuesto de 400 líneas: **Alto**.

## Q9 — Riesgos, incógnitas y conflictos con los ADR

- **Bloqueado por #1** — no se puede iniciar `sdd-apply` hasta que system-scaffolding esté realmente implementado
  (Prisma, Postgres en Docker Compose y CI hoy solo están planificados).
- **La granularidad de voto Candidato vs. Lista** es genuinamente ambigua en TECH-DESIGN y bloquea un diseño
  polimórfico limpio de `Voto.eleccion` (Slice B/C).
- **La jerarquía del árbol académico** (Nivel/Grado/Sección/Aula/Turno) está subespecificada; la estructura provisional
  propuesta aquí arriesga una migración posterior disruptiva una vez que #8 defina las reglas de negocio reales.
- **Las columnas de autenticación de `Usuario` están completamente ausentes de la lista de entidades del TDD** — un
  hueco real entre los métodos de autenticación declarados en el PRD y el modelo de datos documentado; #4/#5/#6 deben
  diseñarlas desde cero, no simplemente "agregar columnas" a una forma ya diseñada.
- **`Configuración.smtp_config`** no debería almacenar credenciales SMTP en texto plano en la tabla de dominio;
  señalar para que #10 decida un enfoque de gestor de secretos/variables de entorno antes de la implementación.
- No se encontraron conflictos con los ADR: ADR-0003 anticipa explícitamente la división Prisma+SQL raw usada aquí; los
  dos hallazgos críticos de la revisión adversarial (C1 voto secreto, C2 cuenta de padres) ya están ambos resueltos en
  el texto actual del TDD vía ADR-0010/ADR-0011, de modo que nada contradice este plan.
- **Corrección a la premisa del brief**: el `UNIQUE(proceso, derecho)` compuesto simple NO requiere SQL raw —
  verificado como expresable de forma nativa mediante el `@@unique` de Prisma. Solo el índice único parcial/filtrado
  (año escolar único activo) y la restricción CHECK de la elección de `Voto` requieren genuinamente SQL raw.

## Recomendación

Adoptar el alcance de esquema primero y comportamiento después (Q1), con `EventoAuditoría` movido íntegramente a #3.
Construir el esqueleto en cuatro grupos de migración (Q5), cada uno probable de forma independiente mediante tests de
integración de rechazo de restricciones que reutilizan el fixture de Postgres para e2e de #1 (Q7), sembrado con
fixtures solo estructurales que no puedan arrastrar credenciales a producción (Q6) porque las columnas de
autenticación están diferidas. Resolver la ambigüedad Candidato/Lista y fijar la estructura del árbol académico antes
de que `sdd-propose` congele la lista de entidades, ya que ambas afectan los límites de los grupos de migración.
Planificar slices de PR encadenados desde el principio dado el pronóstico de presupuesto de 400 líneas (Q8).

## Riesgos

- Bloqueado por la implementación de #1 (todavía no iniciada).
- La granularidad de voto Candidato vs. Lista está sin resolver y bloquea parte del esquema.
- La jerarquía del árbol académico es provisional; una suposición equivocada arriesga una migración disruptiva cuando
  aterrice #8.
- Las columnas de credenciales de `Usuario` están sin diseñar; #4/#5/#6 deben diseñarlas desde cero, no extender una
  forma existente.
- `Configuración.smtp_config` necesita una decisión de almacenamiento de secretos antes de #10.
- Presupuesto de líneas: la entrega en un único PR excederá las 400 líneas; se requieren slices encadenados (Q8).

## Listo para Proposal

Parcial. El límite de alcance, el inventario de entidades, la división Prisma/SQL raw, las restricciones de
integridad, la estrategia de migración, la política de seeds y el enfoque de testing son lo suficientemente concretos
para que `sdd-propose` redacte a partir de ellos — **pero** dos preguntas abiertas deberían resolverse primero (o
diferirse explícitamente con un valor por defecto documentado) ya que afectan los límites de los grupos de migración:
(1) la granularidad de voto Candidato vs. Lista, (2) la forma de la jerarquía del árbol académico. Ambas pueden
llevarse a `sdd-propose` como preguntas abiertas para confirmación del usuario en lugar de bloquear la exploración en
sí. El bloqueo duro es externo: #1 debe estar realmente implementado antes de que este change pueda llegar a
`sdd-apply`.
