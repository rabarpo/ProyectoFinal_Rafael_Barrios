# Propuesta: vote-casting (Backlog #14 — Emisión del voto en 3 pasos)

## Intención

Hoy no existe ningún camino de escritura para el voto: el esquema (#2) y el motor de auditoría
(#3) están propuestos pero no implementados, y ningún ítem anterior valida el derecho al voto ni
inserta una fila `Voto`. Este change entrega la garantía transaccional completa que el PRD exige
como criterio de éxito: **"0 votos duplicados"**. Es la pieza central del flujo de votación —
sin ella, ningún votante puede emitir un voto real, y sin su garantía de unicidad el sistema no
puede afirmar que un proceso electoral escolar produjo un resultado confiable.

**Bloqueo duro:** este change no puede llegar a `sdd-apply` hasta que toda la cadena de
dependencias aterrice, en orden: **#1 (`system-scaffolding`) → #2 (`base-schema-and-migrations`)
→ #3 (`append-only-audit-engine`) → #4 → #7 → #8/#10 → #11 → #12 → #13**. Ninguno de esos ítems
tiene hoy `sdd-apply` completo; #1 tiene planificación completa, #2 y #3 tienen exploración y
propuesta, el resto de la cadena (#4, #7, #8/#10, #11, #12, #13) no tiene ningún artefacto SDD
todavía. Siguiendo el precedente que #2 y #3 ya establecieron, esta propuesta avanza en
`sdd-propose` en paralelo con esa cadena, sin esperar a que el código exista — `sdd-design` y
`sdd-tasks` de #14 pueden hacer lo mismo, pero `sdd-apply` permanece bloqueado hasta entonces.

## Alcance

### Dentro de alcance

- `POST /votos`: la transacción única (validación del derecho, `UNIQUE`, idempotencia, inserción
  de `Voto`, cambio de estado de `DerechoVoto`, evento de auditoría `VOTO`, inserción **mínima**
  de la fila `JobCorreo`) — ver "La garantía transaccional completa" abajo
- Los dos mecanismos de idempotencia (clave de idempotencia del cliente + `UNIQUE` del motor) y su
  interacción con el error `23505` de Postgres
- Las cinco causas de rechazo del derecho al voto, su transacción `RECHAZO` independiente y sus
  pantallas específicas
- Los 3 pasos de la boleta mobile-first (información del proceso, boleta, confirmación), incluido
  el voto en blanco explícito
- La banda "Votando como…" y el soporte del doble derecho (`en_calidad_de`) del ADR-0011
- Código de comprobante derivado de `Voto.id` y sellado de hora con `now()`/`clock_timestamp()` de
  Postgres dentro de la transacción
- Suite de pruebas de integración bajo TDD estricto, incluido el arnés de concurrencia real de dos
  conexiones coordinadas (ver "Enfoque de pruebas")

### Fuera de alcance

- **Materialización del padrón** (`DerechoVoto` congelados, snapshot al abrir el proceso,
  `en_calidad_de`, `ocultar_resultados` inmutable, evento de apertura) — Backlog **#13**. Este
  change **lee/consume** filas `DerechoVoto` ya existentes; no las crea ni decide su contenido.
- **Todo lo que ocurre después de que la fila `JobCorreo` exista**: el despachador worker→BullMQ,
  el envío SMTP, reintentos, ritmo por lotes, contenido/plantilla del correo, el enlace autenticado
  al comprobante — Backlog **#15**. Ver la sección siguiente para el límite exacto entre #14 y #15
  sobre la fila `JobCorreo` misma.
- Vista agregada de "Mis votaciones" con todos los procesos de un usuario — probablemente #16 o
  #20; fuera de esta propuesta salvo la relectura puntual de un comprobante ya emitido (ver nota
  más abajo).
- Reglamento de "aula que no corresponde" como pantalla propia — tratado como comprobación
  defensiva sin pantalla dedicada; ver Riesgos.

### La restricción de no-descomposición del BACKLOG — no se reabre

`BACKLOG.md`, sección "Notas de decomposición", es explícito: *"#14 no se parte. Idempotencia,
restricción `UNIQUE` y validación del derecho al voto son una sola garantía transaccional ('0
votos duplicados'); separarlas dejaría media garantía implementada y un criterio de éxito del PRD
sin verificar."* Esta propuesta respeta esa restricción sin excepción: idempotencia, `UNIQUE` y
validación del derecho viven en la misma transacción de la sección "La garantía transaccional
completa" y no pueden entregarse como ítems parciales. Los cortes de PR que `sdd-tasks` decida
más adelante pueden existir (ver "Pronóstico de líneas"), pero cada slice que toque esa
transacción debe mantener las tres piezas juntas — nunca un slice con `UNIQUE` sin validación, o
con idempotencia sin `UNIQUE`.

### La fila `JobCorreo`: decisión del usuario, no la recomendación de la exploración

La exploración de este change (`openspec/changes/vote-casting/exploration.md`) recomendó que #14
insertara la fila `JobCorreo` mínima dentro de su transacción, citando el mandato textual del
ADR-0012. El usuario decidió, de forma consciente y explícita, **respetar la asignación literal
del BACKLOG**: la fila `JobCorreo` **NO se inserta en #14**. Queda íntegramente dentro del alcance
de **#15** ("Outbox de correo y comprobante autenticado"), incluida la inserción de la fila misma
— no solo el despachador que la consume.

Esta decisión tiene una consecuencia técnica que debe quedar documentada con precisión, sin
suavizarla:

- El **ADR-0006** y el **ADR-0012** exigen, ambos y de forma independiente, que la fila
  `JobCorreo` nazca **dentro de la misma transacción** que el voto que notifica.
- El **estado final del sistema sigue cumpliendo** ambos ADR, siempre que #15 implemente esa fila
  **agregando la inserción dentro de la transacción que este change construye** — no como un
  mecanismo desacoplado que lea votos ya confirmados desde fuera de la transacción original.
- Lo que queda abierto es una **ventana temporal intermedia**: mientras exista #14 desplegado sin
  #15, un voto confirmado puede quedar sin su job de correo si el proceso cae inmediatamente
  después del commit de la transacción del voto. Esta ventana es, exactamente, el hallazgo A1 de
  `REVISION-ADVERSARIAL.md`, que el ADR-0012 había cerrado — y que esta decisión de secuenciación
  vuelve a abrir de forma temporal y consciente.

**Por lo tanto, esta propuesta establece cuatro obligaciones concretas:**

1. Declarar esta desviación temporal como riesgo explícito y con nombre propio (ver "Riesgos").
2. Diseñar el servicio transaccional de #14 con un **punto de extensión evidente** — el mismo
   bloque `tx` de la transacción, en el punto donde hoy termina la escritura del voto — de modo
   que agregar la inserción de `JobCorreo` en #15 no exija reescribir la transacción, solo
   extenderla en ese punto ya identificado.
3. Dejar constancia, para cuando se escriba la propuesta de #15, de que su implementación
   **debe** insertar la fila dentro de la transacción existente de #14 y **no** como un
   despachador desacoplado que lea votos ya confirmados; esta propuesta lo señala como requisito
   heredado, no como sugerencia.
4. Recomendar que la desviación se registre en un ADR nuevo o en una enmienda a los ADR-0006/0012
   durante `sdd-design`, porque `openspec/config.yaml` prohíbe contradecir un ADR en silencio y
   esta es una desviación consciente y acotada en el tiempo, no un cambio de rumbo permanente.

## La garantía transaccional completa

Orden de operaciones dentro de la transacción única de `POST /votos` (ADR-0006):

1. **Abrir transacción interactiva** (`prisma.$transaction(async (tx) => { ... })` — no la forma
   de arreglo `$transaction([...])`, porque el `Voto.id` se genera dentro de la transacción y la
   forma de arreglo solo admite operaciones conocidas de antemano; el mismo argumento que adopta
   la propuesta de #3 para `AuditoriaService.log`).
2. **Resolver y bloquear el `DerechoVoto`** referenciado (`SELECT ... FOR UPDATE` por `id`),
   verificando primero que pertenece al `usuario_id` de la sesión autenticada (autorización, no
   regla de negocio — causa de rechazo 1 abajo).
3. **Validar el derecho al voto** (ver causas de rechazo abajo), usando `now()`/`clock_timestamp()`
   de Postgres sellado dentro de esta misma transacción para decidir si el proceso está abierto.
4. **Insertar `Voto`** — protegido por `UNIQUE (proceso_id, derecho_voto_id)` y por el `CHECK` de
   exactamente una elección (`{lista_id, opcion_id, candidato_id, blanco}`) que entrega #2.
5. **Marcar `DerechoVoto.estado = 'ejercido'`.**
6. **Registrar el evento de auditoría `VOTO`** vía `AuditoriaService.log(tx, 'VOTO', usuarioId,
   'Voto', voto.id, payload)` — payload sin la elección (ver "Secreto del voto").
7. **Commit.** Solo si los seis pasos anteriores tienen éxito se confirma; se responde `201` con
   el comprobante. El punto de extensión para #15 (inserción de `JobCorreo`) queda inmediatamente
   antes de este commit, después del paso 6.

**Qué ocurre si cada paso falla:** cualquier fallo en los pasos 2–6 hace rollback de **toda** la
transacción — cero fila en `Voto`, ninguna marca en `DerechoVoto`, ningún evento de auditoría
`VOTO`. Esto cumple el caso borde del PRD ("o se registra completo y se confirma, o no se
registra"). Un fallo del paso 6 (p. ej. el trigger de claves prohibidas de #3 rechazando un
payload malformado) aborta también el voto, por diseño, según el precedente que sienta la
propuesta de #3: una operación que no puede auditarse de forma durable no debe considerarse
ocurrida.

Un rechazo (proceso cerrado, derecho ya ejercido, etc., detectado en el paso 3) **no** es un
fallo de esta transacción — nunca llega al paso 4. Es su propia transacción, distinta y exitosa
(ver "Rechazo" abajo).

## Idempotencia

Dos mecanismos, dos amenazas distintas:

| Mecanismo | Protege de | No protege de |
|---|---|---|
| **Clave de idempotencia** (generada en el cliente al entrar al paso 3, persistida en `sessionStorage` por `proceso`+`derecho`, enviada en cada `POST /votos`) | Reintentos del mismo intento conceptual: doble clic, doble envío, reintento tras corte de conexión con la misma pestaña — devuelve exactamente la misma respuesta sin repetir el trabajo de la transacción | Un segundo intento genuino con una clave distinta (p. ej. recarga que regenera la clave) apuntando al mismo derecho |
| **`UNIQUE (proceso_id, derecho_voto_id)`** (ADR-0003) | Cualquier segundo `Voto` para el mismo derecho, sin importar la clave de idempotencia — la garantía de "0 votos duplicados" que no depende de que el código de aplicación se comporte bien | Nada por sí sola decide qué responder; solo impide que exista una segunda fila |

**Qué devuelve el endpoint:**

- **Reintento con la misma clave de idempotencia:** el servidor busca primero por clave antes de
  intentar el `INSERT` y devuelve el comprobante ya existente. El código HTTP exacto **queda
  abierto para `sdd-design`**; esta propuesta recomienda `200 OK` (para distinguirlo
  semánticamente del `201 Created` original) sin cerrar la decisión aquí.
- **Segundo voto genuino del mismo derecho (clave distinta), choca con `UNIQUE` en el `INSERT`:**
  Postgres lanza `23505` (`unique_violation`). La aplicación **debe** capturar ese error
  explícitamente (nunca dejarlo burbujear como `500`), hacer rollback de esa transacción, volver a
  consultar el `Voto` existente por `(proceso_id, derecho_voto_id)` y responder con el comprobante
  ya emitido — nunca una pantalla de error para quien sí votó, según manda ADR-0004
  literalmente.
- **Caso de concurrencia real** (dos pestañas, cada una con su propia clave de idempotencia):
  ambas transacciones pueden pasar la validación del paso 3 en paralelo; al llegar al `INSERT` del
  paso 4 solo una gana — la segunda se bloquea por el índice único y recibe `23505` al reanudar.
  El `SELECT ... FOR UPDATE` del paso 2 reduce trabajo desperdiciado pero **no reemplaza** al
  `UNIQUE`; es optimización de UX/carga, no la fuente de la garantía.

## Validación del derecho al voto (dentro de la transacción)

**Por qué debe vivir dentro de la transacción y no antes:** problema clásico de TOCTOU
(time-of-check-time-of-use). Si el estado del proceso o del derecho se valida en una consulta
previa y separada de la escritura, existe una ventana en la que el proceso puede cerrar o el
mismo derecho puede ser ejercido por otra petición concurrente antes del `INSERT`. El caso borde
del PRD ("vale la hora de confirmación, según el reloj del servidor") exige un solo instante
autoritativo, sellado con `now()`/`clock_timestamp()` de Postgres dentro de la misma transacción
del `INSERT` — nunca en una llamada HTTP previa ni en el reloj del proceso Node.js del backend.

**Causas de rechazo, en orden:**

1. **Sesión de otro usuario** — el `derecho_voto_id` no pertenece al `usuario_id` autenticado.
   Comprobación de autorización, previa a cualquier regla de negocio; produce `403`/redirección,
   sin evento `RECHAZO` de negocio.
2. **Sin derecho en ese proceso** — no existe fila `DerechoVoto` para `(usuario, proceso,
   calidad)`. Pantalla "No estás en el padrón" (Design.md `1c`).
3. **Proceso cerrado o no abierto** — `ProcesoElectoral.estado != 'abierto'`, o `now()` fuera de
   `[apertura, cierre)`. Pantalla "Votación cerrada" con la hora exacta de cierre.
4. **Derecho ya ejercido** — `DerechoVoto.estado = 'ejercido'`. Pantalla "Ya emitiste tu voto" con
   fecha y hora del registro original.
5. **Aula que no corresponde** — comprobación defensiva y redundante: dado que #13 congela el
   `DerechoVoto` con el aula correcta en el momento de apertura, este caso debería ser
   estructuralmente inalcanzable si #13 está bien implementado. Se mantiene como defensa en
   profundidad, no como causa de rechazo independiente con pantalla propia. Ambigüedad señalada en
   Riesgos.

"Sin conexión al confirmar" (Design.md `1c`) **no** es una causa de rechazo del servidor — es un
fallo detectado por el cliente cuando la petición nunca llega o la respuesta se pierde. El
servidor no tiene forma de saberlo, así que no genera evento `RECHAZO`.

## Rechazo: transacción propia, no rollback

Cada rechazo de negocio (causas 2–4) tiene su pantalla específica **y** su propio evento
`RECHAZO` en auditoría — pero ese evento no vive dentro de la transacción fallida del voto (que
nunca llegó a intentar el `INSERT`). Es, según la propuesta de #3, su propia transacción exitosa e
independiente que registra la decisión de rechazo en sí: la "operación de negocio" que allí se
registra ES el rechazo, no el voto. Esto significa que un rechazo siempre deja rastro durable en
auditoría, aunque el voto nunca haya sido intentado — a diferencia de un fallo interno real dentro
de la transacción del voto (p. ej. el trigger de claves prohibidas rechazando un payload
malformado), que hace rollback de todo, incluida la propia inserción de auditoría que se
intentaba.

## Secreto del voto en el camino de escritura

El evento `VOTO` que este change registra en el paso 6 lleva únicamente: `proceso_id`,
`derecho_voto_id` (o `entity_id = Voto.id`), código de comprobante y hora del servidor — **nunca**
la elección. Esto cumple por diseño el trigger `BEFORE INSERT` de claves prohibidas que #3
entrega, que rechaza cualquier payload de la "familia `VOTO`" que contenga `candidato_id`,
`lista_id`, `opcion_id`, `blanco` o `eleccion`.

**La propuesta de #3 fue enmendada** para incluir explícitamente los eventos `RECHAZO` dentro de
esa "familia `VOTO`" a efectos del trigger. En consecuencia, este change **nunca** incluye la
elección — ni ninguna pista de ella, como el estado del formulario en el momento del rechazo — en
el payload de un evento `RECHAZO`. Esta regla se verifica explícitamente en la suite de pruebas de
este change (ver "Enfoque de pruebas"), no solo se confía al trigger de #3 como única defensa.

## El doble derecho del ADR-0011

En consultas dirigidas a toda la comunidad, la cuenta de un estudiante porta dos filas
`DerechoVoto` para el mismo proceso: una con `en_calidad_de = 'estudiante'`, otra con
`en_calidad_de = 'padre'` (ambas materializadas por #13). "Mis votaciones" las muestra como dos
entradas separadas, cada una con su propio estado y comprobante.

- **Elección del derecho a ejercer:** ocurre **antes** de entrar al flujo de 3 pasos, al tocar una
  de las dos entradas en "Mis votaciones"; el `derecho_voto_id` correspondiente viaja como
  contexto de entrada al paso 1 y se envía en el `POST /votos` del paso 3.
- **Banda "Votando como…"** (Design.md `2a`/`8`): declara la calidad del derecho activo en ese
  recorrido concreto — "Votando como padre/apoderado de ▢ · 4° B" cuando `en_calidad_de = 'padre'`;
  solo nombre y aula del estudiante cuando es el derecho propio. La banda no permite cambiar de
  derecho a mitad de flujo (ADR-0011 retira explícitamente el salto "votar por mi otro hijo").
- **Prevención de doble uso:** el mismo mecanismo de `UNIQUE (proceso_id, derecho_voto_id)`; cada
  derecho es una fila distinta con su propio `id`, y compite por su propia fila `Voto` sin
  necesitar ninguna regla especial adicional.

## Los 3 pasos y la boleta mobile-first

| Paso | Qué ocurre | Dónde vive el estado |
|---|---|---|
| **1 — Información del proceso** | Lectura pura: nombre, descripción, hora de cierre, banda de calidad. No se crea estado nuevo. | — |
| **2 — Boleta** | Selección de una tarjeta (lista/candidato/opción) o el voto en blanco (opción de borde discontinuo, Design.md `8`). "Continuar" permanece deshabilitado hasta que exista una selección explícita. | Cliente únicamente — memoria del componente, no persistido |
| **3 — Confirmación** | Se genera la clave de idempotencia si no existe una para este `proceso`+`derecho`; resumen + casilla de consentimiento de copia por correo. Al confirmar, el botón pasa a "Registrando…" y se dispara `POST /votos` con `{derecho_voto_id, eleccion, clave_idempotencia}`. | Cliente genera y persiste la clave; servidor ejecuta la transacción atómica |

**Por qué el voto en blanco debe ser una opción explícita, nunca la ausencia de selección:**

1. ADR-0008 es categórico: "no existe voto nulo; solo voto en blanco explícito" — la única forma
   de expresar abstención de preferencia dentro de un intento de voto es una opción marcable como
   cualquier otra.
2. El `CHECK` de #2 exige que exactamente uno de `{lista_id, opcion_id, candidato_id, blanco}` esté
   establecido — nunca cero. Coaccionar silenciosamente "sin selección" a blanco perdería la
   garantía de consentimiento informado: el votante nunca habría elegido blanco, el sistema se lo
   habría asignado por omisión.
3. El cuadre de actas (`votos + blancos + nulos + abstenciones = padrón`) depende de que "blanco"
   sea un voto activo y registrado — distinto de "abstención" (nunca completar el paso 3).
   Confundir ambos rompería la aritmética que el Flujo 4 de `TECH-DESIGN.md` exige verificar.

## Código de comprobante y hora del servidor

**Código de comprobante:** se recomienda derivarlo del propio `Voto.id` (UUID, ya globalmente
único) en lugar de generar un código aleatorio independiente que necesitaría su propia
verificación de unicidad dentro de la transacción crítica. La forma exacta de presentación
(longitud, alfabeto legible) es decisión de `sdd-design`, no de esta propuesta.

**Hora del servidor:** se lee con `now()`/`clock_timestamp()` de Postgres dentro de la misma
transacción que valida el cierre y hace el `INSERT` — nunca `Date.now()` del proceso Node.js del
backend, porque con múltiples instancias de backend el reloj de cada proceso puede tener desfase
entre sí, y usar el mismo `now()` transaccional para validar el cierre y sellar la hora almacenada
garantiza que ambos usos se refieran exactamente al mismo instante.

## Enfoque de pruebas bajo TDD estricto

Integración/e2e contra Postgres real (Jest + Supertest, reutilizando el fixture e2e de #1), no
unitarias con mocks — la garantía que este change entrega vive en el motor, no en el código de
aplicación, siguiendo el mismo criterio que ya adoptaron #2 y #3.

- **Camino feliz:** `POST /votos` válido → `201` + comprobante; fila `Voto` creada; `DerechoVoto`
  pasa a `ejercido`; evento `VOTO` sin elección.
- **Reintento con la misma clave de idempotencia:** dos llamadas idénticas → una sola fila `Voto`,
  mismo comprobante en ambas respuestas.
- **Colisión de `UNIQUE` con clave distinta:** dos llamadas secuenciales, mismo derecho, claves
  distintas → segunda llamada devuelve el comprobante existente, nunca un error; exactamente una
  fila `Voto`.
- **Cada causa de rechazo:** pantalla/código esperado, evento `RECHAZO` creado, cero filas `Voto`.
- **Voto en blanco:** fila `Voto` con `blanco = true` y el resto de columnas de elección en null.
- **Frontera de cierre:** confirmación a `hh:cierre − 1s` aceptada, a `hh:cierre` rechazada.
- **No fuga de elección en `RECHAZO`:** el payload del evento `RECHAZO` no contiene
  `candidato_id`, `lista_id`, `opcion_id`, `blanco` ni `eleccion`, verificado tanto contra el
  trigger de #3 como contra el propio código de construcción del payload de este change.
- **El caso concurrente — advertencia explícita: no se verifica con `Promise.all`.** Dos
  peticiones HTTP lanzadas con `Promise.all` no garantizan una interleaving real de dos
  transacciones de Postgres — el pool de conexiones y el bucle de eventos de Node pueden serializar
  el trabajo sin que la carrera real ocurra. La garantía de "0 votos duplicados" bajo concurrencia
  real requiere un arnés de **dos conexiones Prisma/`pg` independientes, coordinadas
  manualmente por pasos**: abrir tx1, ejecutar su `SELECT`/validación; abrir tx2, ejecutar su
  `SELECT`/validación (ambas ven `pendiente`); disparar ambos `INSERT` casi simultáneamente y
  verificar que Postgres serialice el segundo y lo rechace con `23505`. Se complementa, no se
  reemplaza, con una prueba de carga probabilística (N peticiones concurrentes reales) como red de
  seguridad adicional de regresión.

## Plan de rollback

Greenfield, sin datos de producción en el momento en que este change se entrega (según el
precedente de rollback de #1, #2 y #3). Si un slice resulta inviable: `git revert` del o los PR
relevantes. Este change no introduce migraciones nuevas (el esquema ya existe desde #2) —
solo código de aplicación (servicio transaccional, endpoint, UI). El rollback de código de
aplicación no implica ningún riesgo de esquema en cascada. Si ya existen votos reales cuando se
detecta un problema, el rollback de código no borra filas `Voto` ya confirmadas — solo detiene la
emisión de votos nuevos hasta que se corrija y se vuelva a desplegar; ningún voto ya registrado se
pierde ni se revierte por un `git revert` de código.

## Riesgos

| Riesgo/incógnita | Naturaleza | Nota |
|---|---|---|
| Ventana `JobCorreo` sin #15: un voto confirmado puede quedar sin su job de correo si el proceso cae justo después del commit | **Riesgo aceptado y con nombre, consecuencia directa de la decisión del usuario de respetar la asignación literal del BACKLOG** | Reabre temporalmente el hallazgo A1 de `REVISION-ADVERSARIAL.md` que el ADR-0012 había cerrado. Mitigación: punto de extensión evidente en la transacción para que #15 lo cierre sin reescribirla; recomendar ADR nuevo/enmienda en `sdd-design` (ver sección dedicada arriba) |
| Ambigüedad de la "familia VOTO" del trigger de #3 respecto a `RECHAZO` | **Resuelto** — la propuesta de #3 fue enmendada para incluir `RECHAZO` | Este change ya diseña sus pruebas y payloads conforme a esa enmienda |
| Código HTTP para el reintento con la misma clave de idempotencia (200 vs 201) | Abierto, sin ADR ni TDD que lo fije | Recomendación: `200 OK`; decisión final en `sdd-design` |
| "Aula que no corresponde" como causa de rechazo | Ambiguo — probablemente subsumido por "sin derecho" si #13 está bien implementado | Aclarar en `sdd-design` si merece pantalla propia o queda como chequeo defensivo sin pantalla dedicada |
| Prueba determinista del cierre por hora requiere reloj congelable o ventanas relativas al reloj real | Riesgo técnico de testing | Puede requerir abstracción de reloj inyectable bajo TDD estricto; decisión de `sdd-design`/`sdd-tasks` |
| Prueba de la carrera real (concurrencia) exige arnés multi-conexión no trivial | Riesgo técnico de testing / velocidad de entrega | Recomendado como slice de PR aislado para revisión enfocada |
| Cadena de dependencias íntegramente sin implementar (#13←...←#1) | Riesgo de secuencia | `sdd-apply` de #14 no puede empezar hasta que toda la cadena aterrice; `sdd-propose`/`sdd-design`/`sdd-tasks` sí pueden avanzar en paralelo |
| Partes de la alta fidelidad de `Design.md` (`SEEI Votación.dc.html`) están marcadas "Pendiente en alta fidelidad": pantallas de rechazo y "Mis votaciones" con los dos derechos separados | Brecha de insumo de diseño | Este change tendrá que producir esos elementos de alta fidelidad que hoy no existen |
| Criterio "< 3 minutos en móvil" del PRD | No verificable solo con TDD automatizado | Requiere validación con usuarios reales; fuera del alcance que las pruebas de este change pueden probar por sí solas |
| **Pronóstico de líneas muy por encima del presupuesto de revisión de 400 líneas** | Alta probabilidad, señalado sin suavizar | Estimación aproximada: **900–1500+ líneas** entre backend (servicio transaccional), frontend (boleta de 3 pasos, banda de calidad, 5 pantallas de rechazo) y tests (incluido el arnés de concurrencia, el más costoso de escribir). El corte en slices de PR **lo decide `sdd-tasks`, no esta propuesta** — únicamente se señala aquí que la restricción de no-descomposición del BACKLOG (idempotencia + `UNIQUE` + validación en un mismo slice) debe respetarse en cualquier plan de cortes que `sdd-tasks` adopte |

## Criterios de éxito

- [ ] `POST /votos` inserta exactamente una fila `Voto` por `(proceso_id, derecho_voto_id)`, sin
      excepción, verificado bajo concurrencia real (arnés de dos conexiones coordinadas)
- [ ] La transacción completa (validación, `UNIQUE`, idempotencia, inserción de `Voto`, cambio de
      estado de `DerechoVoto`, evento `VOTO`) vive en una sola operación atómica; cualquier fallo
      intermedio deja el estado anterior intacto
- [ ] Un reintento con la misma clave de idempotencia devuelve el mismo comprobante sin crear una
      segunda fila `Voto`
- [ ] Una colisión `23505` (segundo voto genuino con clave distinta) se captura explícitamente y
      responde con el comprobante ya emitido, nunca con un error genérico
- [ ] Cada una de las cinco causas de rechazo del derecho al voto produce su pantalla específica y,
      cuando corresponde, un evento `RECHAZO` en su propia transacción exitosa, sin fila `Voto`
- [ ] Ningún payload de `VOTO` ni de `RECHAZO` contiene `candidato_id`, `lista_id`, `opcion_id`,
      `blanco` ni `eleccion`
- [ ] El voto en blanco se registra únicamente por selección explícita del votante, nunca por
      ausencia de selección, respetando el `CHECK` de #2
- [ ] La hora almacenada y la validación de cierre usan el mismo `now()`/`clock_timestamp()` de
      Postgres, sellado dentro de la transacción
- [ ] El doble derecho del ADR-0011 (`estudiante`/`padre`) se ejerce de forma independiente, cada
      uno protegido por su propio `UNIQUE`, sin salto entre derechos a mitad de flujo
- [ ] La transacción deja un punto de extensión evidente, documentado, donde #15 puede insertar la
      fila `JobCorreo` sin reescribir la transacción
- [ ] La suite de pruebas de integración corre contra un Postgres real e incluye el caso de
      concurrencia determinista (no solo `Promise.all`)
- [ ] La desviación temporal de la ventana `JobCorreo` está documentada como riesgo con nombre y
      recomendada para registro en ADR nuevo o enmienda durante `sdd-design`

## Proposal question round

Siguiendo las instrucciones de la sesión, las dos decisiones abiertas que normalmente
requerirían una ronda de preguntas ya fueron resueltas explícitamente por el usuario antes de
escribir esta propuesta (ver contexto de sesión): (1) la fila `JobCorreo` queda fuera de #14 y
dentro de #15, con la ventana temporal aceptada como riesgo con nombre; (2) el trigger de claves
prohibidas de #3 cubre también `RECHAZO`. No se abre una ronda de preguntas adicional en esta
fase. Quedan, no obstante, decisiones menores explícitamente diferidas a `sdd-design` (ver
"Riesgos"): el código HTTP del reintento de idempotencia, el tratamiento de "aula que no
corresponde", y la estrategia de reloj inyectable para las pruebas de frontera de cierre. Si el
usuario prefiere resolver alguna de ellas ahora en lugar de en `sdd-design`, puede indicarlo antes
de continuar.
