# Diseño: administracion-academica (Backlog #8)

## Enfoque técnico

Un módulo nuevo `AcademicoModule` (`apps/backend/src/academico/`) con seis controladores planos
—`/anios-escolares`, `/niveles`, `/grados`, `/secciones`, `/aulas`, `/matriculas`— sobre
`PrismaService`, `AuthGuard`/`RolesGuard`/`@Roles()` de #4 y `AuditoriaService.log(tx, ...)` de #3.
**Sin migración de Prisma**: el esquema de #2 cubre las seis entidades, sus `@@unique` y el índice
único parcial `anio_escolar_activo_unico_idx`; se confirma que nada aditivo hace falta. Se mantiene
literal el idioma de #7: sin `ValidationPipe`, sin `class-validator`, sin filtro global de
excepciones; validación manual en el servicio y `HttpException` lanzada en el punto exacto de la
regla, con catálogo de códigos local al módulo.

## Decisiones de arquitectura

### D0 — Estructura: un único `AcademicoModule`, no tres módulos por entidad

**Elección**: `AcademicoModule` único, con un controlador y un servicio por entidad, **un** catálogo
de errores y **un** traductor de errores de Prisma compartidos.

| Opción | Veredicto |
|---|---|
| `AniosEscolaresModule` + `ArbolAcademicoModule` + `MatriculasModule` | Triplica el wiring idéntico (`imports: [AuthModule, AuditoriaModule]`, `providers: [PrismaService, …]`, `cookieParser()` vía `NestModule`, registro en `app.module.ts`) sin ganar ningún aislamiento: los tres dependerían de los mismos tres proveedores. Además obliga a **tres** catálogos de error para un solo contexto acotado, o a inventar un cuarto módulo compartido que no existe en el vocabulario del proyecto. **Descartada** |
| `AcademicoModule` con un solo controlador y un solo servicio para las 6 entidades | Un controlador de ~30 handlers y un servicio de ~900 líneas. **Descartada** |
| `AcademicoModule` con 6 controladores + 6 servicios + helpers compartidos | **Elegida** |

**Fundamento**: el argumento a favor de separar módulos era "cortes de PR más naturales", y es
**falso** — el corte de PR es una decisión de entrega, no de frontera de módulo, y #7 ya lo demostró
entregando un único `UsersModule` en tres PR encadenados. Descartado ese argumento, la decisión se
toma por cohesión y acoplamiento: las seis entidades forman un solo contexto acotado (la
configuración académica de un año escolar), comparten el mismo catálogo de errores, el mismo
traductor `P2002`/`P2003` y los mismos tres proveedores. La convención de #7 es **un catálogo por
módulo** (`users.errors.ts`); tres módulos la romperían.

```
apps/backend/src/academico/
├── academico.module.ts          imports [AuthModule, AuditoriaModule]; NestModule → cookieParser() a los 6 controladores
├── academico.errors.ts          catálogo de códigos (D2), local al módulo
├── prisma-errores.ts            esP2002 / esP2003 / traducirRestriccion (D1, D2) — funciones puras
├── anios-escolares.controller.ts · anios-escolares.service.ts
├── niveles.controller.ts        · niveles.service.ts
├── grados.controller.ts         · grados.service.ts
├── secciones.controller.ts      · secciones.service.ts
├── aulas.controller.ts          · aulas.service.ts
├── matriculas.controller.ts     · matriculas.service.ts
└── dto/   crear-*.dto.ts · actualizar-*.dto.ts · *-respuesta.dto.ts · listar-*.query.ts
```

**Wiring**: `AcademicoModule implements NestModule` y aplica `cookieParser()` a **los seis**
controladores (D6 de #4: middleware de módulo, nunca en `main.ts`); omitir uno hace que todas sus
rutas respondan `401`. A diferencia de #7, **`auth.module.ts` no se toca**: el `exports:
[SessionService]` que `AuthGuard` necesita ya fue agregado por #7, y este módulo no revoca sesiones.
`AppModule.imports += AcademicoModule`. Ningún proveedor abre conexión al instanciarse, así que
`src/openapi.ts` sigue extrayendo el contrato sin Postgres vivo (gotcha D1 de #1).

### D1 — Activación de año escolar: desactivar y luego activar, en ese orden, en una `$transaction`

**Elección**:

```ts
async activar(id: string, actorId: string) {
  try {
    return await this.prisma.$transaction(async (tx) => {
      const objetivo = await tx.anioEscolar.findUnique({ where: { id } });
      if (!objetivo) throw new NotFoundException('Año escolar no encontrado');
      if (objetivo.activo) return { id, activo: true, cambio: false };   // idempotente: no audita

      const previo = await tx.anioEscolar.findFirst({ where: { activo: true } });
      await tx.anioEscolar.updateMany({ where: { activo: true }, data: { activo: false } });
      const activado = await tx.anioEscolar.update({ where: { id }, data: { activo: true } });

      await this.auditoria.log(tx, AUDIT_EVENT_TYPES.ANIO_ESCOLAR_ACTIVADO, actorId,
        'AnioEscolar', activado.id, { anio_escolar_anterior_id: previo?.id ?? null });
      return { id: activado.id, activo: true, cambio: true };
    });
  } catch (error) {
    if (esP2002(error) && objetivoContiene(error.meta?.target, 'activo')) {
      throw new ConflictException({ codigo: ACADEMICO_ERROR_CODES.ACTIVACION_CONCURRENTE });
    }
    throw error;
  }
}
```

**El orden desactivar → activar es obligatorio, no estilístico**: `anio_escolar_activo_unico_idx` se
creó con `CREATE UNIQUE INDEX … WHERE "activo" = true`
(`migrations/20260807033309_identity_and_academic_tree/migration.sql:152`). En Postgres un índice
único creado así **no es diferible** (solo un `UNIQUE CONSTRAINT` admite `DEFERRABLE`), de modo que
se evalúa sentencia a sentencia dentro de la transacción. Activar primero y desactivar después
fallaría con `23505` **siempre**, no solo bajo concurrencia.

**Comportamiento bajo concurrencia (READ COMMITTED, aislamiento por defecto)**:

| Escenario | Resultado |
|---|---|
| Existe un año activo; T1 y T2 activan años distintos | El `updateMany` de T1 toma el lock de fila del año activo; T2 se bloquea, y al desbloquearse **reevalúa** su `where` (READ COMMITTED) y desactiva el año que T1 acababa de activar. Gana el último: exactamente un activo, sin error |
| No existe ningún año activo; T1 y T2 concurrentes | Ambos `updateMany` afectan 0 filas; el segundo `update` colisiona contra el índice parcial ⇒ `P2002` ⇒ `409 ACTIVACION_CONCURRENTE`. Nunca `500`, nunca dos activos |

**Alternativas descartadas**: (a) `Serializable` — obligaría a lógica de reintento sobre `40001` que
el proyecto no tiene en ninguna parte; el índice parcial ya es la garantía dura. (b) `SELECT … FOR
UPDATE` explícito vía `$queryRaw` — el `updateMany` ya toma el mismo lock sin SQL crudo. (c) Dos
llamadas del cliente (`PATCH` desactivar + `PATCH` activar) — deja una ventana con cero o dos años
activos; ya descartada en la propuesta.

`ACTIVACION_CONCURRENTE` se distingue de un `nombre` duplicado por `error.meta.target`: la colisión
del índice parcial reporta la columna `activo`, la del `@unique` reporta `nombre`. Mismo precedente
que `campoDesdeTarget()` de #7.

### D2 — `P2003` significa cosas opuestas según la operación; el desambiguador es el verbo

**Elección**: precomprobación explícita **más** `catch` residual, exactamente el idioma de #7
(`clasificarColision()` antes del `INSERT` + `catch P2002` como red).

| Operación | Qué significa el `P2003` | Traducción |
|---|---|---|
| `POST` / `PATCH` (FK saliente) | El **padre** referenciado no existe | `409 REFERENCIA_INEXISTENTE { entidad, campo, valor }` |
| `DELETE` (FK entrante `onDelete: Restrict`) | Existen **hijos** que bloquean el borrado | `409 ENTIDAD_CON_DEPENDIENTES { entidad, relacion }` |

En ambos casos Prisma devuelve el mismo código `P2003`; el significado lo fija la sentencia que lo
provocó, no el error. Por eso cada servicio traduce en su propio `catch`, con el verbo ya conocido,
y **no** existe un traductor global que intente adivinarlo.

**Precomprobación (mensaje preciso)**: antes del `delete`, dentro de la misma `$transaction`, se
cuentan las relaciones dependientes declaradas en el esquema y se lanza
`ENTIDAD_CON_DEPENDIENTES { relacion }` nombrando la primera que bloquea:

| Entidad | Relaciones dependientes verificadas (todas `onDelete: Restrict`) |
|---|---|
| `AnioEscolar` | `Seccion`, `Aula`, `Matricula`, `Configuracion` |
| `Nivel` | `Grado` |
| `Grado` | `Seccion`, `Aula` |
| `Seccion` | `Aula` |
| `Aula` | `Matricula`, `ProcesoAula` |
| `Matricula` | ninguna — el `DELETE` no puede fallar por FK entrante |

**`catch P2003` residual (red de seguridad)**: la precomprobación no elimina la carrera entre el
`SELECT COUNT` y el `DELETE`. El `catch` traduce el `P2003` que escape al **mismo** `409
ENTIDAD_CON_DEPENDIENTES`, derivando `relacion` de `error.meta.field_name` en modo *best-effort*
(su formato varía entre versiones de Prisma: puede llegar como `"Grado_nivel_id_fkey (index)"`),
con un valor genérico cuando no se puede parsear. Ninguna violación de FK escapa como `500`.

**Alternativa descartada**: confiar solo en el `catch`. Ahorraría N consultas pero produciría un
mensaje que no puede nombrar qué relación bloquea cuando `meta.field_name` no es parseable — y "no
se puede eliminar" sin decir por qué es exactamente el error ilegible que la spec prohíbe.

**Nota sobre `Aula` → `ProcesoAula`**: el esquema de #2 declara esa FK con `Restrict`. Aunque #11
todavía no crea filas, la guarda se implementa desde ahora: cuando #11 exista, el `DELETE` de un
`Aula` con proceso electoral asociado ya devolverá un error legible sin tocar este módulo.

### D3 — Rutas planas para las seis entidades, jerarquía expresada por filtros

**Elección**: `/anios-escolares`, `/niveles`, `/grados`, `/secciones`, `/aulas`, `/matriculas`, todas
bajo el prefijo global `api`, todas colecciones de primer nivel. Ninguna ruta anidada.

| Opción | Veredicto |
|---|---|
| Anidamiento completo (`/niveles/:id/grados/:id/secciones/…`) | URLs de cuatro segmentos variables, y aun así `Seccion` necesitaría `anio_escolar_id` en el body porque su segundo padre no cabe en la ruta. **Descartada** |
| Anidar solo donde hay un único padre (`/niveles/:id/grados`, resto plano) | Deja el árbol con dos gramáticas distintas: peor que una uniforme. **Descartada** |
| Todas planas + filtros de query | **Elegida** |

**Fundamento**: #7 anidó `/usuarios/:usuarioId/apoderados` porque `Apoderado` tiene **exactamente un**
padre y ninguna identidad independiente. Aquí la situación es la opuesta: `Seccion` tiene dos padres
(`Grado`, `AnioEscolar`), y `Aula` y `Matricula` tienen tres. Una ruta anidada obliga a elegir
arbitrariamente un padre como "dueño del path" mientras los demás siguen viajando en el body — el
anidamiento no ahorra nada y duplica las reglas de direccionamiento. Además rompe el listado
transversal que #9 y #11 necesitan (`GET /aulas?anio_escolar_id=X` a través de todos los grados).

El acotamiento por padre se expresa como **filtros de query** en el listado, con el mismo contrato
que `GET /usuarios?rol=&estado=` de #7 (valor desconocido ⇒ `400 CAMPO_INVALIDO`, nunca un `500` de
Prisma sobre un enum inválido), y como **campos de body** en la creación.

**Sin re-parentado en ningún `PATCH`**: los DTO de actualización **no declaran** las FK
(`nivel_id`, `grado_id`, `seccion_id`, `anio_escolar_id`) ni `usuario_id`/`aula_id`. Mover un `Grado`
de `Nivel` reasignaría en silencio todo un subárbol de secciones y aulas. Igual que D1 de #7, lo
prohibido **ni siquiera compila** porque el campo no existe en el tipo. `Matricula` no tiene `PATCH`
en absoluto (la spec no lo define): un traslado es `DELETE` + `POST`, lo que deja dos eventos de
auditoría explícitos en vez de una mutación opaca.

### D4 — Dieciocho claves de auditoría, aditivas, fuera del `WHEN` de ADR-0016

**Elección** (aditivas en `apps/backend/src/auditoria/audit-event-types.ts`):

| Entidad | Claves | `entity_type` | payload |
|---|---|---|---|
| `AnioEscolar` | `ANIO_ESCOLAR_CREADO` · `_ACTUALIZADO` · `_ACTIVADO` · `_ELIMINADO` | `AnioEscolar` | `{ nombre }` / `{ campos: [...] }` / `{ anio_escolar_anterior_id }` / `{ nombre }` |
| `Nivel` | `NIVEL_CREADO` · `_ACTUALIZADO` · `_ELIMINADO` | `Nivel` | `{ nombre }` / `{ campos }` / `{ nombre }` |
| `Grado` | `GRADO_CREADO` · `_ACTUALIZADO` · `_ELIMINADO` | `Grado` | `{ nivel_id, nombre }` |
| `Seccion` | `SECCION_CREADA` · `_ACTUALIZADA` · `_ELIMINADA` | `Seccion` | `{ grado_id, anio_escolar_id, nombre }` |
| `Aula` | `AULA_CREADA` · `_ACTUALIZADA` · `_ELIMINADA` | `Aula` | `{ grado_id, seccion_id, anio_escolar_id, turno }` |
| `Matricula` | `MATRICULA_CREADA` · `MATRICULA_ELIMINADA` | `Matricula` | `{ usuario_id, aula_id, anio_escolar_id }` |

**Verificación de no-ruptura (patrón D4 de #7)**: la cláusula versionada de ADR-0016 es
`FOR EACH ROW WHEN (NEW.event_type IN ('VOTO','RECHAZO'))`
(`prisma/migrations/20260807052206_append_only_audit/migration.sql:81`). Ninguna de las dieciocho
claves toca un `Voto`, así que la obligación versionada **no se activa**: el cambio es un objeto
`as const` más grande y **cero SQL**. Sin migración nueva. Se agrega el caso al test de contrato
`test/schema/auditoria.spec.ts` [TM4].

**Claves por entidad y no una genérica** (`ACADEMICO_ENTIDAD_CREADA` + `entity_type`): `event_type`
es el eje consultable del stream append-only y las dieciocho claves ya existentes son
específicas por entidad; una clave genérica obligaría a todo consumidor futuro (#21) a discriminar
por `entity_type`. Además el `WHEN` de ADR-0016 opera sobre `event_type`, así que mantenerlas
específicas conserva la capacidad de expresar obligaciones futuras.

**Payload sin datos personales**: los payload solo llevan identificadores y nombres de entidad
académica. `MATRICULA_ELIMINADA` es un borrado físico que destruye la única copia del vínculo, así
que lleva los tres ids (no nombres, DNI ni correo del estudiante) — suficiente para reconstruir la
matrícula sin replicar datos personales en un stream que nunca se puede corregir (ADR-0010).

### D5 — Catálogo de errores local y reparto 400 / 404 / 409

`apps/backend/src/academico/academico.errors.ts`, constante `as const` + union type, local al
módulo — mismo formato que `users.errors.ts`.

| Caso | HTTP | Body |
|---|---|---|
| `@unique` / `@@unique` violado (`nombre`, `(nivel_id,nombre)`, `(grado_id,anio_escolar_id,nombre)`, `(grado_id,seccion_id,anio_escolar_id)`, `(usuario_id,aula_id,anio_escolar_id)`) | `409` | `{ codigo: 'RESTRICCION_UNICA', entidad, campos: string[] }` |
| FK saliente hacia una fila inexistente (padre en el body) | `409` | `{ codigo: 'REFERENCIA_INEXISTENTE', entidad, campo, valor }` |
| `DELETE` bloqueado por `onDelete: Restrict` | `409` | `{ codigo: 'ENTIDAD_CON_DEPENDIENTES', entidad, relacion }` |
| Colisión del índice parcial de año activo | `409` | `{ codigo: 'ACTIVACION_CONCURRENTE' }` |
| `turno` fuera de `{manana, tarde}`, filtro de query desconocido, campo requerido ausente | `400` | `{ codigo: 'CAMPO_INVALIDO', campo, motivo: 'requerido' \| 'formato' }` |
| Recurso direccionado por `:id` inexistente | `404` | `'Nivel no encontrado'` … (body por defecto de Nest, como #7) |
| `:id` con UUID malformado | `400` | `ParseUUIDPipe` |
| Sin cookie / rol no autorizado | `401` / `403` | `AuthGuard` / `RolesGuard`, sin cambios |

**Reparto**, heredado literalmente de D2 de #7: `400` cuando el valor es inaceptable **por sí mismo**;
`409` cuando el request está bien formado y lo que lo impide es el **estado actual de la base**.
`REFERENCIA_INEXISTENTE` es `409` y no `404` deliberadamente: el recurso direccionado (la colección
`/grados`) sí existe; lo que falla es una referencia del payload. Reservar `404` estrictamente para
el recurso del path mantiene inequívoca la semántica de `:id`. `422` sigue sin usarse en el proyecto.

### D6 — Coherencia jerárquica de `Aula` y `Matricula`

El esquema **no** garantiza que `Aula.grado_id` coincida con `Aula.seccion.grado_id`, ni que
`Aula.anio_escolar_id` coincida con `Aula.seccion.anio_escolar_id`, ni que
`Matricula.anio_escolar_id` coincida con `Matricula.aula.anio_escolar_id`. Las tres FK son
independientes, así que un `POST` bien formado puede crear un `Aula` que apunte a una `Seccion` de
otro grado o de otro año. Esto envenenaría el padrón de #11/#13 en silencio.

**Elección**: guarda de aplicación en `AulasService.crear()` y `MatriculasService.crear()` que, tras
resolver los padres dentro de la misma `$transaction`, compara los campos redundantes y lanza
`409 { codigo: 'COHERENCIA_JERARQUICA', campo, esperado, recibido }`. Se descarta resolverlo por
migración (un `CHECK` no puede mirar otra tabla; exigiría FK compuestas y por lo tanto índices y
migración nuevos, fuera del alcance declarado del change).

**Resuelto**: se agregaron los requisitos "Coherencia jerárquica de `Aula` con su `Sección`" en
`academic-tree-management` y "Coherencia jerárquica de `Matrícula` con su `Aula`" en
`student-enrollment`, con sus escenarios de rechazo. La guarda de este diseño ya no excede la spec.

## Flujo de datos — activación de año escolar

    Cliente   AniosEscolaresController(AuthGuard,RolesGuard,@Roles(admin,director))   Service      Prisma
      │ PATCH api/anios-escolares/{id}/activar            │                              │           │
      │──────────────────────────────────────────────────>│──activar(id, actorId)───────>│           │
      │                                                   │  $transaction:               │           │
      │                                                   │    findUnique(id) ⇒ null ⇒ 404           │
      │                                                   │    objetivo.activo ⇒ return {cambio:false} (sin auditar)
      │                                                   │    findFirst({activo:true}) ⇒ previo      │
      │                                                   │    updateMany({activo:true} → false) ── lock de fila ──>│
      │                                                   │    update({id} → activo:true) ───────────>│
      │                                                   │    log(tx, ANIO_ESCOLAR_ACTIVADO, {anterior_id})
      │                                                   │  catch P2002(target='activo') ⇒ 409 ACTIVACION_CONCURRENTE
      │<──────── 200 { id, activo:true, cambio } ─────────│                              │           │

## Flujo de datos — `DELETE` con guarda de integridad referencial

    Cliente   NivelesController   NivelesService                        Prisma
      │ DELETE api/niveles/{id} │                    │                     │
      │────────────────────────>│──eliminar(id, actorId)─────────────────>│
      │                         │  $transaction:     │                     │
      │                         │    findUnique ⇒ null ⇒ 404 'Nivel no encontrado'
      │                         │    count(grado where nivel_id) > 0 ⇒ 409 ENTIDAD_CON_DEPENDIENTES {relacion:'Grado'}
      │                         │    delete({id}) ───────────────────────>│
      │                         │    log(tx, NIVEL_ELIMINADO, 'Nivel', id, {nombre})
      │                         │  catch P2003 (carrera SELECT↔DELETE) ⇒ 409 ENTIDAD_CON_DEPENDIENTES (mismo body)
      │<────── 204 ─────────────│                    │                     │

## Contratos HTTP

Todas bajo el prefijo global `api`, todas con `@UseGuards(AuthGuard, RolesGuard)` y
`@Roles('administrador', 'director')` **a nivel de clase**; todo `:id` vía `ParseUUIDPipe`.

| Recurso | Rutas | Body de creación | Campos de `PATCH` | Filtros de `GET` |
|---|---|---|---|---|
| `anios-escolares` | `POST` · `GET` · `GET /:id` · `PATCH /:id` · `PATCH /:id/activar` · `DELETE /:id` | `{ nombre }` | `nombre` | `activo?` |
| `niveles` | `POST` · `GET` · `GET /:id` · `PATCH /:id` · `DELETE /:id` | `{ nombre }` | `nombre` | — |
| `grados` | idem | `{ nombre, nivel_id }` | `nombre` | `nivel_id?` |
| `secciones` | idem | `{ nombre, grado_id, anio_escolar_id }` | `nombre` | `grado_id?`, `anio_escolar_id?` |
| `aulas` | idem | `{ turno, grado_id, seccion_id, anio_escolar_id }` | `turno` | `grado_id?`, `seccion_id?`, `anio_escolar_id?`, `turno?` |
| `matriculas` | `POST` · `GET` · `GET /:id` · `DELETE /:id` (sin `PATCH`) | `{ usuario_id, aula_id, anio_escolar_id }` | — | `usuario_id?`, `aula_id?`, `anio_escolar_id?` |

Los `GET` de listado devuelven arreglo desnudo sin paginación, `orderBy nombre asc` (o
`creado_en`/`id` donde no hay `nombre`), mismo criterio que `GET /usuarios` de #7. Todos los DTO son
clases con `@ApiProperty` **únicamente**, sin `class-validator`, como los DTO de #5/#6/#7. Los DTO de
respuesta exponen los ids de las FK, nunca objetos anidados expandidos (evita filtrar campos de
`Usuario` a través de `Matricula`).

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/src/academico/**` (~33 archivos de D0) | Crear | Módulo, 6 controladores, 6 servicios, catálogo de errores, traductor de errores de Prisma, ~20 DTO |
| `apps/backend/src/app.module.ts` | Modificar | `AcademicoModule` en `imports` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | Aditivo: las 18 claves de D4 + comentario de trazabilidad, como #4/#5/#6/#7 |
| `apps/backend/test/academico/*.e2e-spec.ts`, `src/academico/*.spec.ts` | Crear | Ver estrategia de pruebas |
| `apps/backend/test/schema/auditoria.spec.ts` | Modificar | Caso [TM4]: el `WHEN` de ADR-0016 sigue siendo `IN ('VOTO','RECHAZO')` con 18 claves más |
| `packages/contracts/openapi.json` + tipos | Regenerar | `pnpm generate:contracts` tras cerrar el último controlador |

**Sin cambios en `schema.prisma` ni migraciones nuevas** — confirmado contra las seis entidades y sus
`@@unique`. `apps/backend/src/auth/auth.module.ts` tampoco se toca (a diferencia de #7).

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit | `esP2002`/`esP2003`; derivación de `campos` desde `meta.target` y de `relacion` desde `meta.field_name` incluidos los formatos no parseables; `objetivoContiene(target,'activo')` distingue índice parcial de `@unique nombre`; validadores de `turno` y de filtros de query | Jest puro, sin base |
| Integración | Orden desactivar→activar dentro de la `$transaction`; idempotencia de activar un año ya activo (sin fila de auditoría); precomprobación de dependientes vs. `catch P2003` residual | Postgres de `docker-compose.test.yml` |
| E2E | CRUD completo de las 6 entidades; `PATCH /:id/activar` desactiva el previo y audita una sola fila; `DELETE` exitoso sin dependientes verificado por consulta directa; `DELETE` con dependientes ⇒ `409` y la fila **permanece**; `403` para `comite`/`docente`/`estudiante` en las 6 rutas; `director` ≡ `administrador`; mismo `nombre` de `Grado` bajo `Nivel` distinto se acepta | `supertest` + `Test.createTestingModule` |
| Adversarial (RED obligatorio) | Dos activaciones concurrentes ⇒ a lo sumo un `activo = true` y `409`, nunca `500` ni dos activos; activación concurrente **sin** año activo previo ⇒ misma garantía; `PATCH` con `nivel_id`/`anio_escolar_id` en el body no re-parenta (no está en el DTO); `Aula` apuntando a una `Seccion` de otro grado/año ⇒ `409 COHERENCIA_JERARQUICA` (D6); `DELETE` de `AnioEscolar` con `Configuracion` asociada ⇒ `409`; `:id` inexistente ⇒ `404`, malformado ⇒ `400`; ninguna violación de constraint escapa como `500` | `Promise.all` sobre supertest / Prisma |
| Contrato | `WHEN` del trigger de ADR-0016 intacto tras las 18 claves; `anio_escolar_activo_unico_idx` sigue presente en `pg_indexes` | `test/schema/auditoria.spec.ts`, patrón de #2/#3 |

## Matriz de amenazas

N/A — este change no toca enrutamiento de comandos, shell, subprocesos, automatización de VCS/PR,
clasificación de archivos ejecutables ni integración de procesos. Sus casos adversarios (carrera de
activación, borrado que rompe integridad referencial, escalada por re-parentado, incoherencia
jerárquica silenciosa) están en D1/D2/D3/D6 y en la fila "Adversarial" de la tabla anterior.

## Migración / rollout

Sin migración de datos, sin backfill, sin feature flag: el módulo es puramente aditivo y ninguna ruta
existente cambia de comportamiento. Los dos únicos toques fuera de `src/academico/` —el `imports` de
`AppModule` y las claves de `AUDIT_EVENT_TYPES`— son aditivos. Rollback: `git revert` del merge; las
filas académicas creadas sobreviven al revert sin romper nada (`AUDIT_EVENT_TYPES` es tipado de
TypeScript, no una restricción en la base). Regenerar `packages/contracts` es obligatorio en el PR
que cierra el último controlador.

## Corte de PR recomendado (insumo para `sdd-tasks`)

Presupuesto de 400 líneas autoradas (`additions + deletions`, código + tests). El corte es
**ortogonal a D0**: un solo módulo entregado en cadena, igual que `UsersModule` de #7 en tres PR.
Cadena de ramas: PR1 → rama de feature; cada PR siguiente apunta a la rama del anterior.

| PR | Contenido | Estimación | Riesgo de presupuesto |
|---|---|---|---|
| 1 | Cimientos: `academico.module.ts` (sin controladores), `academico.errors.ts`, `prisma-errores.ts`, 18 claves de auditoría, registro en `app.module.ts`, unit specs del traductor + contrato ADR-0016 | ~250 | Bajo |
| 2 | `AnioEscolar` CRUD (`POST`/`GET`/`GET :id`/`PATCH`/`DELETE` con guarda de 4 dependientes) + DTO + e2e | ~400 | Medio |
| 3 | Activación: `PATCH /:id/activar`, idempotencia, auditoría y tests de concurrencia (D1) | ~250 | Bajo |
| 4 | `Nivel` + `Grado` (las dos entidades más simples, se agrupan) | ~430 | Medio |
| 5 | `Seccion` | ~380 | Bajo |
| 6 | `Aula` + guarda de coherencia jerárquica (D6) | ~420 | Medio |
| 7 | `Matricula` + regeneración de `packages/contracts` | ~380 | Bajo |

Cada slice es autónomo, verificable por sus propios tests y reversible por separado. Si al
implementar el PR2 o el PR6 se supera el presupuesto, el corte de respaldo es separar el `DELETE` +
su guarda en un PR propio (el `DELETE` es la mitad más cara de cada entidad). El PR3 se mantiene
separado del PR2 a propósito: la lógica de activación es la de mayor riesgo de todo el change y
merece atención de revisión sin competir con cinco handlers de CRUD.

## Preguntas abiertas

- [x] **Coherencia jerárquica (D6)** — resuelto: los requisitos y escenarios ya están en
      `academic-tree-management` y `student-enrollment`. La guarda `COHERENCIA_JERARQUICA` de D6
      queda cubierta por la spec.
- [x] **`Matricula` restringe `Usuario.rol = 'estudiante'`** — resuelto: nuevo requisito en
      `student-enrollment` ("Alta de `Matrícula`...") exige `rol = 'estudiante'` y rechaza con
      error de negocio legible en caso contrario, mismo código `USUARIO_NO_ES_ESTUDIANTE` que #7
      usó para `Apoderado`. `MatriculasService.crear()` debe verificarlo junto con la existencia
      del `Usuario`.
- [ ] **CSRF** — abierta desde #4/#5/#6/#7. Este change agrega ~29 rutas autenticadas que mutan
      estado de negocio; `sameSite: 'lax'` sigue siendo la única defensa.
- [ ] **Sin paginación en los seis listados** — coherente con #7, pero `GET /matriculas` a escala de
      padrón institucional completo (#13) devolverá miles de filas en un arreglo desnudo.
- [ ] **`DELETE` de `AnioEscolar` es prácticamente inalcanzable en producción**: cualquier año con
      secciones, aulas, matrículas o configuración queda bloqueado por D2. Es el comportamiento
      correcto, pero implica que en la práctica un año escolar no se borra, se archiva — y "archivar"
      no existe como concepto en este change ni en #13.
