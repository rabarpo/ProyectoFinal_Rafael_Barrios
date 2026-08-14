# Diseño: apertura-proceso-congelamiento-padron (Backlog #13)

## Enfoque técnico

Un método nuevo `ProcesosService.abrir(id, dto, actorId)` en el módulo ya existente
(`apps/backend/src/procesos/`), expuesto por `POST /procesos/:id/abrir` en el `ProcesosController`
vigente. No hay módulo nuevo, ni servicio nuevo, ni dependencia nueva: se conserva el idioma de
`#11`/`#12` (DTO planos con `@ApiProperty` únicamente, sin `class-validator`, validación manual en
el servicio, catálogo de errores local, `AuditoriaService.log(tx, …)` dentro de la misma
`$transaction`).

La diferencia estructural con `crear()`/`editar()` es una sola y es deliberada: **la escritura de
estado va primero y las lecturas de elegibilidad van después, todas dentro de la transacción**
(D4). `crear()`/`editar()` leen fuera de la transacción porque su única invariante es la atomicidad
de las escrituras; `abrir()` además necesita exclusión mutua sobre la fila del proceso, y esa
exclusión la da el `UPDATE` condicional, no un `findUnique` previo.

El sello de `apertura_real` con el reloj de Postgres obliga al primer `$queryRaw` de lógica de
negocio del repo (D3): Prisma no expresa `clock_timestamp()` en `update`/`updateMany`. El
precedente de SQL crudo existe (índice parcial de `AnioEscolar`, CHECK de `Voto`), pero vivía solo
en migraciones — esta es la primera vez en un servicio, y se acota a **una** sentencia
parametrizada.

En frontend, una ruta dedicada `/procesos/:id/abrir` (variante nueva de la unión `Ruta` de `#12`)
con contenedor `AperturaProcesoPage` + pieza presentacional que espeja `DialogoVinculacion.tsx`
(tarjeta `role="dialog"` en flujo, sin overlay ni portal): el repo no tiene primitiva de modal y
este change no la inventa.

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Unicidad de `DerechoVoto` | `@@unique([proceso_id, usuario_id, en_calidad_de])` — **verificado** contra las columnas reales del modelo (`id`, `proceso_id`, `usuario_id`, `en_calidad_de`, `aula_snapshot`, `schema.prisma:297`); las tres existen | `@@unique([proceso_id, usuario_id])`; unicidad incluyendo `aula_snapshot` | `[proceso_id, usuario_id]` haría imposible el doble derecho de ADR-0011 (misma cuenta, `estudiante` + `padre`, procesos `comunidad`). Incluir `aula_snapshot` permitiría duplicar el derecho ante un traslado de aula entre dos intentos de apertura, que es exactamente la carrera que la restricción debe cerrar. El prefijo `(proceso_id, usuario_id)` del índice sirve además la búsqueda que `#14` hará en cada voto, sin índice adicional |
| D2 | Forma de `aula_snapshot` | `aula_id` (UUID) plano de `ProcesoAula.aula_id`, con `@db.Uuid` agregado y **sin** relación Prisma ni FK | FK a `Aula`; JSON con grado/sección/turno denormalizados; conservar `String` sin `@db.Uuid` | Inmutabilidad de ADR-0003/ADR-0010: ningún cambio futuro en `Aula` puede alcanzar un `DerechoVoto` congelado, y una FK lo permitiría (aunque sea `Restrict`, acopla el borrado). Un JSON denormalizado duplicaría datos que `#17` puede resolver por `join` explícito cuando los necesite. `@db.Uuid` es gratis: la tabla no tiene ni una fila (`DerechoVoto` nunca se escribió, ver exploración), así que el `ALTER … USING ::uuid` no puede fallar por datos |
| D3 | Sello de `apertura_real` + guarda de concurrencia | **Una sola sentencia**: `tx.$queryRaw` con `UPDATE "ProcesoElectoral" SET estado='abierto', apertura_real=clock_timestamp() WHERE id=$1 AND estado='borrador' RETURNING id, apertura_real, ocultar_resultados`. El largo del arreglo devuelto **es** el resultado de la guarda | `updateMany` con `new Date()` de Node; `updateMany` + `$executeRaw` posterior solo para la hora; `SELECT … FOR UPDATE` + `update` | Prisma no tiene forma de escribir una expresión SQL del lado del servidor, y `Date.now()` de Node contradice `vote-casting/exploration.md` §9 y el `@default(now())` que usa todo el schema (el reloj de la app no es prueba). Partirlo en dos sentencias deja una ventana en la que `apertura_real` es la hora de Node. `FOR UPDATE` + `update` son dos viajes y dos sentencias para la misma exclusión que el `UPDATE` condicional ya da gratis. `RETURNING` evita releer el proceso en el camino feliz. `clock_timestamp()` (no `now()`): `now()` es la hora de **inicio de la transacción**, y en una transacción que después inserta miles de filas eso adelanta el sello |
| D4 | Orden dentro de la transacción | 1) guarda/`UPDATE` · 2) lecturas de elegibilidad · 3) `createMany` de `DerechoVoto` · 4) `auditoria.log`. Todo dentro del mismo callback de `$transaction` | Leer elegibilidad antes de la transacción (patrón de `crear()`/`editar()`) | Es la desviación consciente del patrón vigente y su justificación es la corrección: con las lecturas primero, dos peticiones concurrentes calculan el mismo padrón y ambas intentan insertarlo; con el `UPDATE` primero, la segunda queda bloqueada en el lock de fila y, al commitear la primera, Postgres re-evalúa el `WHERE` bajo `READ COMMITTED` (EvalPlanQual) y devuelve 0 filas. El costo es una transacción más larga; la alternativa es una carrera real |
| D5 | Guarda con 0 filas | Releer el proceso **dentro** de la misma transacción: inexistente ⇒ `404` (`NotFoundException`, igual que `editar()`/`eliminar()`); `estado='abierto'` ⇒ **200 idempotente silencioso**; `cerrado`/`acta_emitida` ⇒ `409 PROCESO_NO_ABRIBLE` con el `estado` real leído | `409 PROCESO_YA_ABIERTO` también para `abierto`; `204` sin cuerpo; `410` para `cerrado` | Regla 6 de la propuesta, confirmada por el usuario: doble clic y reintento de red son el caso normal de un botón destructivo, no un error. Se emite **una sola** clave de error nueva, con la forma exacta de `PROCESO_NO_EDITABLE` (`{ codigo, estado }`, `procesos.errors.ts`), para que el cliente discrimine por `estado` y no por código. `PROCESO_YA_ABIERTO` y `AULA_SIN_CANDIDATOS` (candidatos de la exploración) **no** se agregan: el primero contradice la idempotencia y el segundo quedó fuera de alcance por la regla 2 |
| D6 | Materialización por fila | Dos `findMany` sobre `Matricula` dentro de la transacción, espejo exacto de las dos `groupBy` de `PadronService.calcular()`: (a) todas las matrículas elegibles ⇒ filas `en_calidad_de='estudiante'`; (b) las que además cumplen `usuario.apoderados: { some: {} }` ⇒ filas `en_calidad_de='padre'`. `derechosPorAula()` decide **cuáles** de los dos conjuntos se emiten según `publico_objetivo` | `$queryRaw` con `INSERT … SELECT` en una sentencia; recorrer `resolverAulas()` otra vez; una consulta con `include: { usuario: { apoderados } }` | El conjunto de aulas ya está congelado en `ProcesoAula` desde `crear()`/`editar()`, así que `resolverAulas()` **no** se vuelve a llamar en `abrir()` (llamarla recalcularía el alcance contra el árbol académico actual y podría cambiar el conjunto de aulas, violando la regla 1: se recalcula *quién*, nunca *qué aulas*). Espejar las dos consultas de `PadronService` garantiza que el conteo previsto por el asistente y el padrón materializado usen el mismo criterio de elegibilidad. Un `INSERT … SELECT` sería una sola sentencia pero mueve la regla de negocio a SQL crudo, fuera del alcance de los tests unitarios |
| D7 | Tamaño del lote | `createMany` en trozos de **5000 filas**, constante local `LOTE_DERECHOS` | Un único `createMany` sin trocear; `skipDuplicates: true` | `DerechoVoto` inserta 5 columnas por fila (Prisma genera el `uuid` del lado del cliente), y el protocolo de Postgres tope en 65535 parámetros por sentencia ⇒ ~13k filas. Un proceso institucional `comunidad` (matrícula ×2) puede rozarlo. 5000 deja margen sin depender del troceado interno de Prisma — **verificar en apply** si Prisma ya trocea, y si lo hace, dejar la constante documentada igual (es barata y explícita). `skipDuplicates` está prohibido: silenciaría exactamente la violación que D1 existe para detectar |
| D8 | Padrón vacío y `P2002` residual | Padrón de 0 filas ⇒ `409 SEGMENTACION_SIN_ELEGIBLES` (código ya existente) lanzado **después** de la guarda, con rollback completo: el proceso vuelve a `borrador`. `P2002` sobre la restricción de D1 **no** se traduce: propaga como `500` y revierte todo | Abrir con padrón vacío; traducir `P2002` a `409` | Un proceso abierto sin ni un derecho es inservible y `#14` no tendría contra qué validar; reusar el código de `crear()`/`editar()` mantiene un único código para "esta segmentación no tiene a nadie". El `P2002` es inalcanzable dado el lock de D4: si aparece, es una violación de invariante real y convertirla en un `409` benigno la escondería. En ambos casos la transacción revierte entera — nunca queda un padrón a medias |
| D9 | Contrato del endpoint | `POST /procesos/:id/abrir` con `@Param('id', ParseUUIDPipe)` y body `AbrirProcesoDto { confirmar: boolean }`; `confirmar !== true` ⇒ `400 CAMPO_INVALIDO { campo: 'confirmar', motivo: 'requerido' }`. Guards y roles **heredados de la clase** (`AuthGuard`, `RolesGuard`, `@Roles('administrador','director','comite')`) | Par de endpoints `preview` + `confirmar`; `PATCH /procesos/:id` con `estado`; restringir a `administrador`/`director` | Regla 7 confirmada por el usuario. Un `preview` separado duplicaría el cálculo del padrón sin persistir nada y quedaría desincronizado del que ejecuta la apertura. `PATCH` con `estado` contradice la exclusión deliberada de `estado` en `ActualizarProcesoDto` (#11 D3). Los tres roles son equivalentes por la decisión 4 de `#11`; agregar un `@Roles` de método introduciría una jerarquía que el proyecto no tiene. La ruta tiene sufijo literal, así que no compite con `POST /procesos/padron` ni con `POST /procesos` |
| D10 | DTO de respuesta | `AperturaRespuestaDto` nuevo: `{ id, estado, apertura_real, ocultar_resultados, aulas: number, derechos_totales, derechos_estudiante, derechos_padre }` | Reusar `ProcesoRespuestaDto`; devolver `204` | `ProcesoRespuestaDto` no expone `apertura_real` (`mapearRespuesta()` no lo mapea) y el cliente necesita justamente eso más los conteos para el panel de éxito. En el camino idempotente los conteos se leen con `count()` del padrón ya materializado: el cuerpo describe el **estado vigente**, no "lo que se creó ahora" — así el 200 idempotente y el 200 real tienen exactamente la misma forma, sin bandera `ya_estaba_abierto` (silencioso, confirmado por el usuario) |
| D11 | Auditoría | Una clave aditiva `PROCESO_ABIERTO` en `audit-event-types.ts`, emitida una sola vez con `auditoria.log(tx, …, 'ProcesoElectoral', id, payload)`; payload `{ tipo, publico_objetivo, aulas, derechos_totales, derechos_estudiante, derechos_padre, ocultar_resultados, apertura_real }` | Un evento por fila de `DerechoVoto`; clave separada para el congelamiento de `ocultar_resultados` | Espeja `PROCESO_CREADO`, que ya emite **un** evento con `aulas: N` en vez de uno por `ProcesoAula` (#11 D6). `ocultar_resultados` viaja en el mismo payload porque se congela en el mismo acto, no en uno aparte. `PROCESO_ABIERTO` no escribe ni referencia un `Voto`, así que **no** activa la obligación versionada de ADR-0016 (cláusula `WHEN` de `eventoauditoria_claves_eleccion_trg`, caso `[TM4]` de `test/schema/auditoria.spec.ts`) — se documenta en el comentario de bitácora del archivo, igual que las 14 claves de `#12` |
| D12 | Congelamiento de `ocultar_resultados` | **Sin código nuevo**: `editar()` y `eliminar()` ya lanzan `409 PROCESO_NO_EDITABLE` cuando `estado !== 'borrador'`, y `ActualizarProcesoDto` no expone `estado`. Se cubre con tests de regresión, no con una guarda nueva | Bandera `campos_congelados`; validación explícita de `ocultar_resultados` en `editar()` | ADR-0008 se satisface con el comportamiento vigente en cuanto `abrir()` mueve el estado; agregar una segunda guarda para el mismo invariante crea dos fuentes de verdad. La spec de `#11` declaraba esto "fuera de alcance"; este change lo convierte en comportamiento verificado (criterio de éxito 5 de la propuesta) |
| D13 | Superficie de UI | Ruta dedicada `/procesos/:id/abrir` ⇒ variante `{ nombre: 'apertura'; procesoId }` en `rutas.ts` + caso en `Enrutador.tsx`; contenedor `AperturaProcesoPage` (todos los efectos) + pieza `piezas/PanelConfirmacionApertura.tsx` (presentacional puro, tarjeta `role="dialog"` en flujo, espejo literal de `auth/DialogoVinculacion.tsx`). Se alcanza con un botón "Abrir proceso" en `ProcesosIndexPage`, visible **solo** cuando `proceso.estado === 'borrador'` | Overlay/portal modal nuevo; paso 5 del asistente de 4 pasos; diálogo en línea dentro de `ProcesosIndexPage` | El repo no tiene ninguna primitiva de modal (`role="dialog"` aparece una sola vez en todo `apps/frontend/src`, sin overlay ni portal) e inventarla para una pantalla contradice el "sin librería nueva" de `#12` y el sistema visual ya archivado de `#24`. La propuesta excluye explícitamente la apertura del asistente. Una ruta propia da enlace profundo y botón atrás — el mismo fundamento de D10/D12 de `#12` — y da lugar suficiente para mostrar `ocultar_resultados` de forma prominente, que es el requisito de `TECH-DESIGN.md`. Solo tokens vigentes de `index.css` (`primary`, `surface-white`, `border-gray`, `rounded-card`, `shadow-elevation`, `text-headline-lg`, `max-page`): cero tokens nuevos |
| D14 | Datos de la pantalla de confirmación | Únicamente `GET /procesos/:id` (`procesos-api.detalle()`, ya escrito y tipado): nombre, tipo, `publico_objetivo`, `alcance`, `aulas.length` y `ocultar_resultados`. Los conteos reales del padrón llegan en el `200` de `abrir` y se muestran en el panel de éxito | Reusar `POST /procesos/padron` para previsualizar los conteos; endpoint nuevo `GET /procesos/:id/padron-previo` | `POST /procesos/padron` resuelve las aulas **desde la segmentación**, no desde el `ProcesoAula[]` congelado: si el árbol académico cambió desde la creación, mostraría un número que la apertura no va a producir — peor que no mostrar ninguno. Un endpoint de previsualización dedicado es superficie nueva de backend que la propuesta no autoriza (queda como pregunta abierta) |

## Flujo de datos

```
POST /procesos/:id/abrir   { confirmar: true }
  └→ AuthGuard → RolesGuard(@Roles administrador,director,comite) → ParseUUIDPipe
     └→ ProcesosService.abrir(id, dto, actorId)
          ├─ dto.confirmar !== true ⇒ 400 CAMPO_INVALIDO { campo: 'confirmar' }
          ├─ configuracionLectura.anioEscolarActivoId() ⇒ null ⇒ 409 SIN_ANIO_ESCOLAR_ACTIVO
          └─ prisma.$transaction(tx):
               1. tx.$queryRaw`UPDATE "ProcesoElectoral"
                     SET estado='abierto', apertura_real=clock_timestamp()
                     WHERE id=${id} AND estado='borrador'
                     RETURNING id, apertura_real, ocultar_resultados`      ← guarda (D3/D4)
                  filas.length === 0 ⇒ tx.procesoElectoral.findUnique:
                        null              ⇒ 404
                        'abierto'         ⇒ 200 idempotente (conteos por count(), D10)
                        cerrado/acta      ⇒ 409 PROCESO_NO_ABRIBLE { estado }
               2. tx.procesoAula.findMany({ proceso_id: id })              ← aulas YA congeladas
               3. tx.matricula.findMany(elegibles)          ⇒ filas 'estudiante'
                  tx.matricula.findMany(elegibles + apoderados.some)  ⇒ filas 'padre'
                  derechosPorAula(publico_objetivo, …) decide qué conjuntos se emiten
               4. total === 0 ⇒ 409 SEGMENTACION_SIN_ELEGIBLES   (rollback ⇒ vuelve a borrador)
               5. tx.derechoVoto.createMany(trozos de 5000)               ← D7
               6. auditoria.log(tx, PROCESO_ABIERTO, actorId, 'ProcesoElectoral', id, {…})
```

Secuencia de la carrera (dos clics simultáneos, D4/D5):

```
Petición A                    Postgres                     Petición B
   │ BEGIN                                                    │ BEGIN
   │ UPDATE …WHERE estado='borrador' ─► lock de fila           │
   │ ◄─ 1 fila (apertura_real sellada)                         │ UPDATE …WHERE estado='borrador'
   │ createMany(DerechoVoto)                                   │    ⏸ bloqueada en el lock de A
   │ log(PROCESO_ABIERTO)                                      │
   │ COMMIT ─────────────────────────►                         │ ⏵ EvalPlanQual re-evalúa el WHERE
   │                                                           │ ◄─ 0 filas (estado ya es 'abierto')
   │ 200 { derechos_totales: N }                               │ SELECT proceso ⇒ 'abierto'
   │                                                           │ COMMIT ⇒ 200, 0 filas nuevas
```

```
Navegación (D13)
  Enrutador
    ├ '/procesos'              → ProcesosIndexPage   ── botón "Abrir proceso" (solo estado='borrador')
    └ '/procesos/:id/abrir'    → AperturaProcesoPage → PanelConfirmacionApertura (presentacional)
```

## Contratos HTTP

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /procesos/:id/abrir` | JSON `AbrirProcesoDto` (`confirmar: boolean`) | `200 AperturaRespuestaDto`; `400 CAMPO_INVALIDO` (`confirmar`, o `:id` no-UUID por `ParseUUIDPipe`); `401` sin cookie; `403` rol ajeno; `404` proceso inexistente; `409 PROCESO_NO_ABRIBLE` / `SEGMENTACION_SIN_ELEGIBLES` / `SIN_ANIO_ESCOLAR_ACTIVO` |

`@HttpCode(200)` explícito: el default de `@Post()` en Nest es `201`, y esto no crea un recurso
direccionable (mismo criterio que `POST /procesos/padron`).

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modify | D1: `@@unique([proceso_id, usuario_id, en_calidad_de])` en `DerechoVoto`; D2: `aula_snapshot String @db.Uuid` |
| `apps/backend/prisma/migrations/2026…_derecho_voto_unicidad_apertura/migration.sql` | Create | D1/D2: `CREATE UNIQUE INDEX` + `ALTER COLUMN … TYPE UUID USING` |
| `apps/backend/src/procesos/procesos.service.ts` | Modify | D3-D8: método `abrir()` + helper de materialización |
| `apps/backend/src/procesos/procesos.controller.ts` | Modify | D9: `POST :id/abrir`, `@HttpCode(200)`, `@ApiOperation`/`@ApiResponse` |
| `apps/backend/src/procesos/dto/abrir-proceso.dto.ts` | Create | D9: `confirmar: boolean` con `@ApiProperty` |
| `apps/backend/src/procesos/dto/apertura-respuesta.dto.ts` | Create | D10 |
| `apps/backend/src/procesos/procesos.errors.ts` | Modify | D5: `PROCESO_NO_ABRIBLE` (única clave nueva) |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modify | D11: `PROCESO_ABIERTO` + comentario de bitácora |
| `packages/contracts/openapi.json` | Modify | Regenerar (`pnpm openapi:extract`) antes del frontend |
| `apps/frontend/src/app/rutas.ts` · `Enrutador.tsx` | Modify | D13: variante `apertura` + caso del `switch` |
| `apps/frontend/src/procesos/procesos-api.ts` | Modify | D13: wrapper `abrir(id)` |
| `apps/frontend/src/procesos/AperturaProcesoPage.tsx` | Create | D13/D14: contenedor con los efectos |
| `apps/frontend/src/procesos/piezas/PanelConfirmacionApertura.tsx` | Create | D13: presentacional puro |
| `apps/frontend/src/procesos/ProcesosIndexPage.tsx` | Modify | D13: botón "Abrir proceso" condicionado a `estado === 'borrador'` |
| `apps/backend/test/procesos/procesos-abrir.e2e-spec.ts` | Create | Suite e2e nueva |
| `apps/backend/test/schema/voting.spec.ts` | Modify | Asserción de `DerechoVoto_proceso_id_usuario_id_en_calidad_de_key` |

## Interfaces / Contratos

```prisma
model DerechoVoto {
  // … sin cambios salvo lo indicado
  aula_snapshot String @db.Uuid   // D2: espejo de ProcesoAula.aula_id, deliberadamente SIN relación

  @@unique([proceso_id, usuario_id, en_calidad_de])   // D1
}
```

```ts
// procesos.service.ts — D3. Única sentencia cruda del servicio. La plantilla etiquetada de Prisma
// parametriza `${id}` como $1 (no interpolación de texto). Los literales 'abierto'/'borrador' los
// coerciona Postgres al tipo enum "EstadoProceso" por contexto — no hace falta cast explícito.
const filas = await tx.$queryRaw<{ id: string; apertura_real: Date; ocultar_resultados: boolean }[]>`
  UPDATE "ProcesoElectoral"
     SET estado = 'abierto', apertura_real = clock_timestamp()
   WHERE id = ${id}::uuid AND estado = 'borrador'
  RETURNING id, apertura_real, ocultar_resultados`;
```

```ts
// D6/D8. `en_calidad_de` sigue siendo `String` en el schema (no hay enum `CalidadVotante`): se fija
// como unión TS local para no arrastrar una segunda migración ni comprometer a #14.
const CALIDADES = { ESTUDIANTE: 'estudiante', PADRE: 'padre' } as const;
const LOTE_DERECHOS = 5000; // D7
```

Clave de auditoría nueva (D11): `PROCESO_ABIERTO`.

## Reconciliación con `vote-casting/exploration.md` (#14)

| Supuesto de `#14` | Estado |
|---|---|
| "el aula congelada en `DerechoVoto`" (§4, defensa en profundidad) | **Compatible.** D2 la fija como `aula_id` UUID plano; `#14` puede comparar contra `Matricula.aula_id` o resolver la `Aula` por `id` sin FK |
| Dos filas `DerechoVoto` por cuenta en `comunidad`, `en_calidad_de = 'estudiante' \| 'padre'` (§7) | **Compatible.** D1 lo permite explícitamente y D6 lo materializa |
| `UNIQUE (proceso_id, derecho_voto_id)` sobre `Voto` protege cada derecho por separado (§3) | **Compatible.** Ya existe en el schema; `#13` no lo toca |
| `DerechoVoto.estado = 'pendiente' \| 'ejercido'` (§2 paso 5, §4 causa 4) | **CONFLICTO REAL, señalado, no resuelto aquí.** El modelo `DerechoVoto` **no tiene** columna `estado` hoy (`schema.prisma:297-307`). `#13` **no** la agrega: la propuesta no la contempla y materializar un `estado` cuya máquina de transiciones pertenece al voto ataría `#13` a decisiones de `#14`. `#14` deberá agregar la columna o derivar "ejercido" de la existencia de un `Voto` con ese `derecho_voto_id` (el `@@unique([proceso_id, derecho_voto_id])` ya lo hace consultable en O(1)). Queda como pregunta abierta y como dependencia declarada de `#14` |

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (Jest, backend) | `confirmar` ausente/`false` ⇒ `400`; guarda con 0 filas ⇒ `404` / 200 idempotente / `409 PROCESO_NO_ABRIBLE` según el estado releído; padrón vacío ⇒ `409 SEGMENTACION_SIN_ELEGIBLES`; selección de conjuntos por `publico_objetivo` (`estudiantes`/`padres`/`comunidad` ⇒ doble fila); troceado en `LOTE_DERECHOS`; payload de auditoría | `PrismaService`/`AuditoriaService` mockeados (patrón `procesos.service.spec.ts`), con `$queryRaw` como `jest.fn()` |
| Unit (Vitest, frontend) | `parsearRuta('/procesos/<id>/abrir')` ida y vuelta; `PanelConfirmacionApertura` sin efectos, muestra `ocultar_resultados` de forma prominente y no habilita confirmar sin el gesto explícito; el botón "Abrir proceso" solo aparece con `estado === 'borrador'` | `@testing-library/react` |
| Integration / e2e (Postgres real) | `apertura_real` cae entre el `clock_timestamp()` previo y el posterior de la propia base, **nunca** se compara contra `Date.now()` de Node; auditoría en la misma transacción (rollback ⇒ sin fila); conteo exacto de `DerechoVoto` por tipo de proceso; `editar()`/`eliminar()` ⇒ `409 PROCESO_NO_EDITABLE` tras abrir | `apps/backend/test/procesos/procesos-abrir.e2e-spec.ts`, patrón de las suites de `#11` |
| Concurrencia (e2e) | Dos `POST …/abrir` disparados con `Promise.all` ⇒ exactamente un conjunto de `DerechoVoto`, ambas respuestas `200`, cero `P2002` observado | Misma suite, con `count()` posterior como asserción principal |
| Schema | El índice único existe con el nombre `DerechoVoto_proceso_id_usuario_id_en_calidad_de_key`; el `INSERT` duplicado devuelve `23505` sobre esa restricción; `aula_snapshot` es `uuid` en `information_schema` | `test/schema/voting.spec.ts` + `helpers/catalog.ts`/`expect-pg-error.ts` |
| Contract | `pnpm openapi:extract` sin Postgres ni Redis; `POST /procesos/{id}/abrir` aparece con `AbrirProcesoDto`/`AperturaRespuestaDto` | Job de CI existente |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| SQL crudo parametrizado (D3) | `:id` no-UUID; `:id` con `'; DROP …`; literal de enum inválido | **Applicable** — primera sentencia cruda en un servicio | `ParseUUIDPipe` rechaza antes del servicio (`400`); la plantilla etiquetada de Prisma parametriza `${id}` como `$1`, nunca concatena; el cast `::uuid` hace que cualquier valor no-UUID falle en Postgres en vez de coincidir por casualidad | `:id` no-UUID ⇒ `400`; payload de inyección en `:id` ⇒ `400`, cero filas afectadas |
| Transición de estado concurrente (D4/D5) | Doble clic; reintento tras timeout; `abrir` sobre `cerrado`/`acta_emitida`; `abrir` durante un `PATCH` | **Applicable** — es el núcleo del change | `UPDATE` condicional con lock de fila + re-evaluación EvalPlanQual; `@@unique` de D1 como red de seguridad; rollback total ante cualquier fallo posterior | Los cuatro casos, más la asserción de "cero filas duplicadas" |
| Autorización de escritura | Sin cookie; rol `estudiante`/`docente`; actor válido sobre proceso ajeno | **Applicable** | `AuthGuard` + `RolesGuard` de clase, sin excepción de método | `401` sin cookie; `403` con `estudiante` |
| Enrutamiento (cliente) | `/procesos/<id>/abrir` sin sesión; `:id` no-UUID; `/procesos/../abrir` | **Applicable** | El enrutador sigue montado dentro de `AuthGuard` (#12 D11); `parsearRuta` sigue siendo total y cae en `no-encontrada` | Sin sesión ⇒ `LoginPage`; segmentos `..` ⇒ `no-encontrada` |
| Shell / subprocesos / Git / PR / clasificación de archivos ejecutables | — | N/A: el change no ejecuta shell, no toca Git ni automatiza PR, no sube ni sirve archivos | — | — |

## Migración / Rollout

```sql
-- D2: la tabla está vacía (DerechoVoto nunca se escribió), el USING no puede fallar por datos.
ALTER TABLE "DerechoVoto" ALTER COLUMN "aula_snapshot" TYPE UUID USING "aula_snapshot"::uuid;

-- D1
CREATE UNIQUE INDEX "DerechoVoto_proceso_id_usuario_id_en_calidad_de_key"
  ON "DerechoVoto"("proceso_id", "usuario_id", "en_calidad_de");
```

| # | Paso | Verificación de salida |
|---|---|---|
| R1 | **Antes** de migrar: `SELECT count(*) FROM "DerechoVoto";` | Debe ser `0`. Si no lo es, DETENERSE: la premisa de D2 no se cumple y hay que validar que todo `aula_snapshot` sea un UUID antes del `ALTER … USING` |
| R2 | `pnpm prisma migrate deploy` | Índice único presente; `aula_snapshot` de tipo `uuid` |
| R3 | `pnpm openapi:extract` y commit del contrato | El frontend no compila contra `/procesos/{id}/abrir` hasta este paso |
| R4 | Desplegar backend y frontend | Abrir un proceso de prueba end-to-end; reintentar el `POST` y confirmar `200` sin filas nuevas |

Rollback: revertir el commit y aplicar la migración inversa (`DROP INDEX` + `ALTER COLUMN … TYPE
TEXT`). Sin pérdida de datos: no hay procesos abiertos en ningún entorno.

**Corte de PR sugerido para `sdd-tasks`** (el change supera el presupuesto de 400 líneas por la
transacción nueva + schema + endpoint + frontend): **PR1** migración + schema + `PROCESO_ABIERTO` +
`PROCESO_NO_ABRIBLE` + tests de schema; **PR2** `abrir()` + endpoint + DTO + unit/e2e (incluida la
suite de concurrencia); **PR3** ruta, `AperturaProcesoPage`, panel de confirmación y botón del
índice.

## Preguntas abiertas

- [ ] `DerechoVoto.estado` (`pendiente`/`ejercido`) que `vote-casting/exploration.md` asume no
      existe en el schema — `#14` debe decidir entre agregar la columna o derivar el estado de la
      existencia de un `Voto`. Bloquea a `#14`, no a `#13`.
- [ ] `en_calidad_de` sigue siendo `String` libre (D8). ¿Se promueve a enum `CalidadVotante` en
      `#14`, cuando exista un segundo consumidor que lo lea?
- [ ] La pantalla de confirmación no muestra el conteo previsto del padrón (D14). ¿Se agrega un
      `GET /procesos/:id/padron-previo` sobre el `ProcesoAula[]` congelado, o alcanza con los
      conteos posteriores a la apertura?
- [ ] Prueba de carga de la transacción de materialización (`comunidad` institucional): fuera de
      alcance por la propuesta, con seguimiento explícito post-merge. `LOTE_DERECHOS = 5000` es una
      elección defensiva sin medición todavía.
- [ ] Regla 2 (aula sin candidatos en `representante_aula`) sigue sin validarse: requiere una FK
      `Candidato.aula_id` que hoy no existe.
