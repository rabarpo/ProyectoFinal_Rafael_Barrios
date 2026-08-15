# Exploración: vote-casting (Backlog #14 — Emisión del voto en 3 pasos)

## Estado del backlog y bloqueo — léase primero

El repositorio sigue siendo solo documentación: **no hay código fuente**. Este change está
bloqueado por una cadena larga: **#14 ← #13 ← #12 ← #11 ← #8/#10 ← #7 ← #4 ← #3 ← #2 ← #1**.
Solo el #1 (`system-scaffolding`) tiene planificación completa (exploración, propuesta, spec,
diseño, tareas). El #2 (`base-schema-and-migrations`) y el #3 (`append-only-audit-engine`) tienen
exploración y propuesta, pero no `sdd-apply`. El resto de la cadena (#4, #7, #8/#10, #11, #12,
#13) no tiene ningún artefacto SDD todavía. Esta exploración de #14 se escribe contra ese vacío:
usa las decisiones ya *propuestas* (no implementadas) de #2 y #3, y contra el TECH-DESIGN.md /
ADRs, que son las únicas fuentes con autoridad real hoy. `sdd-apply` de #14 permanece bloqueado
hasta que toda la cadena aterrice — pero, siguiendo el precedente que #2 y #3 ya establecieron
(exploración + propuesta documentales, pese a estar bloqueados en `sdd-apply`), esta exploración
deja lista la base para que `sdd-propose` de #14 avance en paralelo, sin esperar a que el código
exista.

**Restricción de descomposición ya decidida — no se re-litiga.** `BACKLOG.md`, sección "Notas de
decomposición": *"#14 no se parte. Idempotencia, restricción `UNIQUE` y validación del derecho al
voto son una sola garantía transaccional ('0 votos duplicados'); separarlas dejaría media
garantía implementada y un criterio de éxito del PRD sin verificar."* Esta exploración no propone
separar esas tres piezas. Los cortes de PR que se sugieren más abajo (sección "Pronóstico de
líneas") mantienen las tres piezas dentro de un mismo slice.

## Fuentes leídas

`PRD.md` (flujo de votación, criterios de éxito, casos borde), `TECH-DESIGN.md` (Flujo 1 y Flujo
2 completos, modelo de datos), `Design.md` (secciones 2.1–2.3, 8 — wireframes `1a`–`1i` y alta
fidelidad `SEEI Votación.dc.html`), `BACKLOG.md` (#13, #14, #15, notas de decomposición y de
ausencia de reglamento), `REVISION-ADVERSARIAL.md` (hallazgos C1, C2, A1, A3, A4), ADR-0003,
0004, 0006, 0008, 0010, 0011, 0012; `openspec/changes/system-scaffolding/{proposal,design}.md`;
`openspec/changes/base-schema-and-migrations/proposal.md`;
`openspec/changes/append-only-audit-engine/proposal.md`; `openspec/config.yaml`.

---

## 1. Límite de alcance — qué es de #13, qué es de #14, qué es de #15

| Pieza | Dueño | Por qué |
|---|---|---|
| Materialización de `DerechoVoto` congelados (snapshot del padrón), `en_calidad_de`, `ocultar_resultados` inmutable, evento de apertura | **#13** | "Apertura del proceso y congelamiento del padrón" — #14 solo **lee/consume** filas `DerechoVoto` ya existentes; no las crea. |
| Validación del derecho, inserción de `Voto`, cambio de estado de `DerechoVoto` a `ejercido`, evento `VOTO`/`RECHAZO`, clave de idempotencia, `UNIQUE (proceso, derecho)` | **#14** | Es la garantía transaccional completa que este ítem entrega — ver sección 2. |
| Fila `JobCorreo` (inserción mínima, dentro de la transacción del voto) | **#14** (inserción únicamente) | Ver el argumento completo abajo — tensión resuelta a favor de ADR-0012, no del backlog literal. |
| Despachador worker→BullMQ, envío SMTP, reintentos, ritmo por lotes, contenido/plantilla del correo, enlace autenticado al comprobante | **#15** | "Outbox de correo y comprobante autenticado" — todo lo que ocurre *después* de que la fila exista. |

### La tensión JobCorreo: #14 vs #15 — resuelta

El backlog asigna la fila `JobCorreo` a #15 en su columna "Alcance". Pero ADR-0012 es explícito y
no admite ambigüedad: *"La fila `JobCorreo` se inserta **dentro de la misma transacción** que el
hecho que notifica — el voto (ADR-0006) [...]. Si el voto existe, su job existe; si la
transacción no confirma, no existe ninguno de los dos."* Y el criterio de aceptación del Flujo 2
del TDD lo repite: *"La fila `JobCorreo` nace en la misma transacción que el voto (outbox): no
puede existir un voto confirmado sin su job de correo, ni siquiera si el backend cae
inmediatamente después del commit."*

Esto no es una preferencia de diseño — es una garantía atómica que **solo puede cumplirse si el
código que abre la transacción del voto es el mismo que inserta la fila `JobCorreo`**. Si #14
implementara la transacción del voto sin la inserción del `JobCorreo`, y #15 la agregara después
como un cambio aislado, se reabriría exactamente el hallazgo A1 de `REVISION-ADVERSARIAL.md` (la
ventana commit→encolado) que ADR-0012 cerró — el riesgo volvería a existir hasta que #15 se
implemente, y el propio criterio de éxito del PRD ("100% de los votos emitidos genera su copia de
confirmación") quedaría sin verificar durante todo el tiempo que exista #14 sin #15.

**Resolución adoptada para esta exploración:** #14 inserta una fila `JobCorreo` **mínima**
(`voto_id`, `tipo = 'CONFIRMACION_VOTO'`, `estado = 'pendiente'`) dentro de su misma transacción,
usando el esquema que #2 ya entrega (`JobCorreo`/`Notificación` está dentro del alcance de #2,
tabla de soporte del cuarto grupo de migración). #14 **no** implementa el despachador, el
`worker`, el envío SMTP, las plantillas ni el enlace autenticado — eso sigue siendo
íntegramente de #15, que consume filas ya insertadas por #14 (y por cualquier otro hecho
notificable futuro). Esto no contradice la nota de decomposición de #14 en `BACKLOG.md` (que
protege específicamente idempotencia + `UNIQUE` + validación del derecho, no menciona
`JobCorreo`), y sí resuelve el mandato explícito y textual de ADR-0012. Se recomienda declarar
este ajuste de alcance explícitamente en la propuesta de #14 y anotarlo también en la propuesta
de #15 cuando se escriba, para que ambas coincidan.

### Nota: acceso al comprobante sin depender del correo

El Flujo 2 del TDD dice "el comprobante es accesible sin el correo desde 'Mis votaciones' →
`VOTADO`". La emisión inicial del comprobante (pantalla de confirmación tras el paso 3) es
responsabilidad de #14 (la respuesta del propio `POST /votos`). Un acceso *posterior* de solo
lectura al mismo comprobante (p. ej. `GET` idempotente reconsultando por `derecho_voto_id`) puede
implementarse dentro de #14 reutilizando la misma lógica de "buscar el voto existente" que ya
necesita el manejo de idempotencia (ver sección 3); una vista agregada de "Mis votaciones" con
todos los procesos de un usuario probablemente pertenece a un ítem de panel/dashboard posterior
(#20) o a #16. Se señala como límite difuso menor, sin bloquear a #14.

---

## 2. La garantía transaccional completa

Orden de operaciones dentro de la transacción única de `POST /votos` (ADR-0006 + ADR-0012):

1. **Abrir transacción** (`prisma.$transaction(async (tx) => { ... })` — la forma interactiva,
   no la de arreglo, según el mismo argumento que usa la propuesta de #3 para
   `AuditoriaService.log`: los IDs generados sobre la marcha, como `Voto.id`, impiden usar
   `$transaction([...])`).
2. **Resolver y bloquear el `DerechoVoto`** referenciado (`SELECT ... FOR UPDATE` sobre la fila
   por su `id`), verificando primero que pertenece al `usuario_id` de la sesión autenticada
   (autorización, no regla de negocio — ver sección 4, causa 5).
3. **Validar derecho al voto** (ver sección 4 para el detalle de cada causa de rechazo), usando
   `now()`/`clock_timestamp()` de Postgres sellado dentro de esta misma transacción para decidir
   si el proceso está abierto.
4. **Insertar `Voto`** — protegido por `UNIQUE (proceso_id, derecho_voto_id)` y por el `CHECK` de
   exactamente una elección (`{lista_id, opcion_id, candidato_id, blanco}`) que entrega #2.
5. **Marcar `DerechoVoto.estado = 'ejercido'`.**
6. **Registrar el evento de auditoría `VOTO`** vía `AuditoriaService.log(tx, 'VOTO', usuarioId,
   'Voto', voto.id, payload)` — payload sin la elección (ver sección 6).
7. **Insertar la fila `JobCorreo` mínima** (`voto_id`, `pendiente`) — ver sección 1.
8. **Commit.** Solo si los siete pasos anteriores tienen éxito se confirma; se responde `201` con
   el comprobante.

**Qué pasa si cada paso falla:** cualquier fallo en 2–7 hace rollback de **toda** la transacción
— cero fila en `Voto`, ninguna marca en `DerechoVoto`, ningún evento de auditoría `VOTO`, ninguna
fila `JobCorreo`. Esto es exactamente el comportamiento que exige el caso borde del PRD ("o se
registra completo y se confirma, o no se registra") y que ya adoptó #3 para su propio servicio de
auditoría ("una transacción de negocio con rollback deja cero filas de auditoría"). Un fallo del
paso 6 (p. ej. el trigger de claves prohibidas de #3 rechazando un payload malformado) aborta
también el voto — por diseño, según el propio precedente que sienta la propuesta de #3: *"que
falle la escritura de auditoría aborta la operación de negocio — por diseño [...] una operación
que no puede auditarse de forma durable no debe considerarse ocurrida."*

Un rechazo (proceso cerrado, derecho ya ejercido, etc., detectado en el paso 3) **no** es un fallo
de esta transacción — nunca llega al paso 4. Es su propia transacción, distinta y exitosa, que
registra el evento `RECHAZO` (ver sección 5).

---

## 3. Idempotencia — dos mecanismos, dos amenazas distintas

| Mecanismo | Protege de | No protege de |
|---|---|---|
| **Clave de idempotencia** (generada en el cliente al entrar al paso 3, persistida en `sessionStorage` por `proceso`+`derecho`, enviada en cada `POST /votos`) | Reintentos del **mismo intento conceptual**: doble clic, doble envío, reintento tras corte de conexión con la misma pestaña — evita repetir el trabajo de la transacción y garantiza devolver *exactamente* la misma respuesta | Un segundo intento genuino con una clave *distinta* (p. ej. recarga de página que regenera la clave) apuntando al mismo derecho |
| **`UNIQUE (proceso_id, derecho_voto_id)`** (garantía del motor, ADR-0003) | Cualquier segundo `Voto` para el mismo derecho, **sin importar la clave de idempotencia** — es la garantía de "0 votos duplicados" que no depende de que el código de aplicación se comporte bien | Nada por sí sola decide *qué responder*; solo impide que exista una segunda fila |

**Qué devuelve el endpoint:**

- **Reintento con la misma clave de idempotencia:** el servidor busca primero por clave antes de
  intentar el `INSERT` (evita reintentar trabajo innecesario) y devuelve el comprobante ya
  existente. Ningún ADR ni el TDD fijan el código HTTP exacto para este caso — es una decisión
  abierta para `sdd-design`; esta exploración recomienda `200 OK` con el comprobante (para
  distinguirlo semánticamente del `201 Created` original), dejando la decisión final documentada
  ahí, no aquí.
- **Segundo voto genuino del mismo derecho (clave distinta), llega tras el paso 4 y choca con el
  `UNIQUE`:** Postgres lanza `23505` (`unique_violation`) en el `INSERT`. La aplicación **debe**
  capturar ese error explícitamente (nunca dejarlo burbujear como `500`), hacer rollback de esa
  transacción, volver a consultar el `Voto` existente por `(proceso_id, derecho_voto_id)` y
  responder con el comprobante ya emitido — nunca una pantalla de error para quien sí votó, según
  manda ADR-0004 literalmente.

**Caso de concurrencia real — dos peticiones simultáneas del mismo votante** (p. ej. dos
pestañas, cada una con su propia clave de idempotencia porque `sessionStorage` es por pestaña en
la mayoría de navegadores): ambas transacciones pueden pasar la validación del paso 3 en paralelo
(ninguna ha confirmado todavía, así que ambas ven `DerechoVoto.estado = 'pendiente'`). Al llegar
al `INSERT` del paso 4, solo una gana: la segunda transacción se bloquea hasta que la primera
confirme (por el índice único), y al reanudar recibe el mismo `23505`. El bloqueo `SELECT ... FOR
UPDATE` del paso 2 reduce la ventana de trabajo desperdiciado pero **no reemplaza** al `UNIQUE`
— es una optimización de UX/carga, no la fuente de la garantía. La aplicación debe manejar ese
`23505` exactamente igual que el caso de "clave distinta" de arriba: sin excepción no capturada,
sin error mostrado a quien sí votó.

---

## 4. Validación del derecho al voto

**Por qué debe vivir dentro de la transacción y no antes:** es un problema clásico de
TOCTOU (time-of-check-time-of-use). Si el estado del proceso o del derecho se valida en una
consulta previa, separada de la escritura, existe una ventana entre el check y el `INSERT` en la
que el proceso puede cerrar, o el mismo derecho puede ser ejercido por otra petición concurrente.
El caso borde más citado del PRD — "vale la hora de confirmación, según el reloj del servidor" —
exige que exista **un solo instante autoritativo**, y ese instante solo puede sellarse leyendo
`now()`/`clock_timestamp()` de Postgres **dentro** de la misma transacción que hace el `INSERT`,
no en una llamada HTTP anterior ni en el reloj del proceso Node.js del backend (que podría tener
distinto desfase entre réplicas).

**Orden y causas de rechazo:**

1. **Sesión de otro usuario** — el `derecho_voto_id` recibido no pertenece al `usuario_id`
   autenticado. Es una comprobación de autorización, previa a cualquier regla de negocio; su
   fallo no genera una pantalla de rechazo "de negocio" sino un `403`/redirección, sin evento
   `RECHAZO` de negocio (podría generar un evento de seguridad distinto, fuera del alcance de
   #14 salvo que se decida lo contrario en `sdd-design`).
2. **Sin derecho en ese proceso** — no existe fila `DerechoVoto` para `(usuario, proceso,
   calidad)`. Pantalla "No estás en el padrón" (Design.md `1c`).
3. **Proceso cerrado o no abierto** — `ProcesoElectoral.estado != 'abierto'`, o `now()` fuera de
   `[apertura, cierre)`. Pantalla "Votación cerrada" con la hora exacta de cierre.
4. **Derecho ya ejercido** — `DerechoVoto.estado = 'ejercido'`. Pantalla "Ya emitiste tu voto" con
   fecha y hora del registro original.
5. **Aula que no corresponde** — comprobación defensiva y redundante: dado que #13 congela el
   `DerechoVoto` con el aula correcta en el momento de apertura, este caso debería ser
   estructuralmente inalcanzable si #13 está bien implementado; se mantiene como defensa en
   profundidad (verificar que el aula congelada en `DerechoVoto` siga siendo compatible con el
   público objetivo del proceso), no como una causa de rechazo independiente con pantalla propia.
   Esto es una ambigüedad genuina — ver Riesgos.

La opción "sin conexión al confirmar" (Design.md `1c`) **no es una causa de rechazo del
servidor** — es un fallo detectado por el cliente cuando la petición nunca llega o la respuesta
se pierde en tránsito. El servidor no tiene forma de saber que ocurrió, así que no existe un
evento `RECHAZO` para este caso (ver matiz en sección 5).

---

## 5. Pantallas de rechazo y auditoría — transacción propia, no rollback

Cada rechazo de negocio (causas 2–4 de la sección 4) tiene su pantalla específica **y** su propio
evento `RECHAZO` en auditoría — pero ese evento **no** vive dentro de la transacción fallida del
voto (que nunca llegó a intentar el `INSERT`, según el orden de la sección 2). Es, según la
propuesta de #3, **su propia transacción exitosa e independiente**: *"El rechazo de un voto
[...] no está anidado dentro de una transacción de negocio fallida — es su propia transacción
exitosa que registra la decisión de rechazo en sí. [...] la 'operación de negocio' que allí se
registra ES el rechazo, no el voto."*

**Consecuencia práctica:** un rechazo siempre deja rastro durable en auditoría, aunque el voto en
sí nunca haya sido intentado. Esto es lo que permite reconstruir la cadena completa "creación →
apertura → votos/rechazos → cierre → actas" que exige el Flujo 7 del TDD. Contraste con un fallo
real dentro de la transacción del voto (p. ej. el trigger de claves prohibidas rechazando un
payload malformado): ese caso hace rollback de **todo**, incluida la propia inserción de
auditoría que se intentaba — no queda ningún rastro, porque ahí sí se trata de una operación que
"no ocurrió" en sentido pleno. La distinción es: `RECHAZO` registra una decisión tomada (el
sistema decidió no permitir el voto — eso sí ocurrió y debe quedar trazado); un fallo interno de
la transacción del voto registra que la operación completa nunca llegó a un estado válido y por
tanto no debe dejar huella parcial.

La excepción es "sin conexión al confirmar": al no llegar la petición al servidor, no hay
transacción que abrir ni evento que registrar — el propio cliente muestra la pantalla y ofrece
reintentar, sin rastro server-side de ese intento fallido específico (el servidor solo verá,
como mucho, el reintento posterior).

---

## 6. Secreto del voto en el camino de escritura

La propuesta de #3 (`append-only-audit-engine`) entrega un trigger `BEFORE INSERT` que rechaza
todo evento de la "familia `VOTO`" cuyo payload JSONB contenga `candidato_id`, `lista_id`,
`opcion_id`, `blanco` o `eleccion`. El evento `VOTO` que #14 registra en el paso 6 (sección 2)
debe llevar únicamente: `proceso_id`, `derecho_voto_id` (o el `entity_id` = `Voto.id`), código de
comprobante y hora del servidor — **nunca** la elección. Esto es compatible por diseño con la
firma `AuditoriaService.log(tx, eventType, actorId, entityType, entityId, payload)` que #3
propone: basta con que #14 nunca construya un payload que incluya esas claves para el `event_type
= 'VOTO'`.

**Ambigüedad no resuelta, señalada como riesgo:** la propuesta de #3 dice que el trigger rechaza
"todo evento de la familia `VOTO`", sin definir explícitamente si el evento `RECHAZO` (que el
Flujo 1 del TDD exige como tipo distinto) cuenta como parte de esa "familia" a efectos del
trigger, o si es un `event_type` separado no cubierto por esa regla. Aunque un `RECHAZO` nunca
debería necesitar transportar una elección real (el voto nunca se emitió), un implementador
descuidado de #14 podría, por error, incluir en el payload de `RECHAZO` qué opción intentaba
marcar el votante (p. ej. registrando el estado del formulario en el momento del rechazo) — lo
cual filtraría intención de voto igual de sensible que la elección misma en un entorno escolar.
Se recomienda, en `sdd-design` de #14 (y/o `#3`), decidir explícitamente si el trigger de #3 debe
cubrir también `RECHAZO`, o si #14 debe autoimponerse la misma restricción por disciplina de
implementación aunque el trigger no la fuerce.

---

## 7. El doble derecho del ADR-0011

En consultas dirigidas a toda la comunidad, la cuenta de un estudiante porta **dos filas
`DerechoVoto`** para el mismo proceso: una con `en_calidad_de = 'estudiante'`, otra con
`en_calidad_de = 'padre'` (ambas materializadas por #13 al abrir el proceso). "Mis votaciones"
(Design.md `1d`) las muestra como dos entradas separadas, cada una con su propio estado
pendiente/`VOTADO` y su propio comprobante.

- **Cómo se elige el derecho al emitir:** no hay pantalla de selección dentro del flujo de 3
  pasos — la elección de *cuál* de los dos derechos se va a ejercer ocurre **antes** de entrar al
  flujo, al tocar una de las dos entradas en "Mis votaciones". El `derecho_voto_id` correspondiente
  viaja como contexto de entrada al paso 1 y se envía en el `POST /votos` del paso 3.
- **Cómo lo refleja la banda:** la banda fija "Votando como…" (Design.md `2a`/`8`) declara la
  calidad del derecho activo en ese recorrido concreto — "Votando como padre/apoderado de ▢ · 4°
  B" cuando `en_calidad_de = 'padre'`; solo nombre y aula del estudiante cuando es el derecho
  propio. La banda no permite cambiar de derecho a mitad de flujo (ADR-0011 retira explícitamente
  el salto "votar por mi otro hijo").
- **Cómo se evita el doble uso:** el mismo mecanismo de la sección 2–3 — cada derecho es una fila
  `DerechoVoto` distinta con su propio `id`, y el `UNIQUE (proceso_id, derecho_voto_id)` protege a
  cada una independientemente. No hace falta ninguna regla especial: los dos derechos del mismo
  usuario son, a efectos de la transacción del voto, dos derechos cualesquiera que compiten cada
  uno por su propia fila `Voto`.

---

## 8. Los 3 pasos y la boleta mobile-first

| Paso | Qué ocurre | Dónde vive el estado |
|---|---|---|
| **1 — Información del proceso** | Lectura pura: nombre, descripción, hora de cierre, banda de calidad. No se crea ningún estado nuevo. | — |
| **2 — Boleta** | El votante selecciona una tarjeta (lista/candidato/opción) o el voto en blanco (opción de borde discontinuo, Design.md `8`). "Continuar" permanece deshabilitado hasta que exista una selección explícita. | **Cliente únicamente** — estado de componente en memoria, no persistido en el servidor ni en `sessionStorage` todavía |
| **3 — Confirmación** | Se genera la clave de idempotencia (si no existe ya una para este `proceso`+`derecho` en `sessionStorage`), se muestra el resumen + casilla de consentimiento de copia por correo. Al confirmar: el botón se deshabilita y pasa a "Registrando…"; se dispara `POST /votos` con `{derecho_voto_id, eleccion, clave_idempotencia}`. | **Cliente** genera y persiste la clave; **servidor** ejecuta la transacción atómica de la sección 2 |

**Si el votante abandona a mitad de camino** (cierra la pestaña entre el paso 1 y antes de tocar
"Registrar" en el paso 3): no existe ningún estado server-side que limpiar, porque nada se
escribió — la única escritura ocurre en el `POST /votos` final. Al volver, el votante simplemente
reinicia desde el paso 1/2 (la selección del paso 2, al vivir solo en memoria del componente, se
pierde; la clave de idempotencia en `sessionStorage`, si ya se había generado al haber llegado
antes al paso 3, sobrevive a una recarga de la misma pestaña — lo cual es exactamente el
comportamiento que ADR-0004 diseña para el reintento tras corte de conexión).

**Por qué el voto en blanco debe ser una opción explícita, nunca la ausencia de selección:**

1. ADR-0008 es categórico: "no existe voto nulo; solo voto en blanco explícito" — la boleta
   digital no tiene marcas inválidas posibles, así que la única forma de expresar abstención de
   preferencia *dentro* de un intento de voto es una opción marcable como cualquier otra.
2. El `CHECK` de #2 exige que exactamente uno de `{lista_id, opcion_id, candidato_id, blanco}`
   esté establecido — nunca cero. Si "sin selección" se coaccionara silenciosamente a blanco, se
   perdería la garantía de consentimiento informado: el votante nunca habría *elegido* blanco, el
   sistema se lo habría asignado por omisión.
3. El cuadre de actas (`votos + blancos + nulos + abstenciones = padrón`) depende de que "blanco"
   sea un voto activo y registrado — distinto de "abstención" (que es, precisamente, nunca llegar
   a completar el paso 3). Confundir ambos rompería la aritmética que el Flujo 4 del TDD exige
   verificar contra la tabla `Voto`.

---

## 9. Código de comprobante y hora del servidor

**Código de comprobante:** se recomienda derivarlo del propio `Voto.id` (UUID, ya globalmente
único por construcción de Postgres/Prisma) en lugar de generar un código aleatorio independiente
que necesitaría su propia verificación de unicidad (una segunda consulta o un segundo índice
único dentro de la misma transacción crítica). Derivarlo del PK (p. ej. una codificación
base32/legible de los primeros bytes del UUID) da unicidad gratis, sin round-trip adicional ni
lógica de reintento ante colisión, dentro de una transacción cuya latencia ya está en la ruta
crítica del usuario según ADR-0006. La forma exacta de presentación (longitud, alfabeto legible)
es una decisión de `sdd-design`, no de esta exploración.

**Hora del servidor:** debe leerse con `now()`/`clock_timestamp()` de Postgres **dentro de la
misma transacción** que valida el cierre y hace el `INSERT` — nunca `Date.now()` del proceso
Node.js del backend. Razones: (1) con múltiples instancias de backend, el reloj de cada proceso
puede tener desfase entre sí; (2) usar el mismo `now()` transaccional para validar el cierre *y*
para sellar la hora almacenada garantiza que ambos usos se refieran exactamente al mismo instante
— cumple literalmente el mandato repetido de TECH-DESIGN.md ("hora del servidor sellada en la
transacción") y el caso borde del PRD sobre el reloj del dispositivo del votante.

---

## 10. Enfoque de pruebas bajo TDD estricto

Integración/e2e contra Postgres real (Jest + Supertest, reutilizando el fixture e2e de #1), no
unitarias con mocks — la garantía que #14 entrega vive en el motor, no en el código de
aplicación, siguiendo el mismo criterio que ya adoptaron #2 y #3.

- **Camino feliz:** `POST /votos` válido → `201` + comprobante; fila `Voto` creada; `DerechoVoto`
  pasa a `ejercido`; evento `VOTO` sin elección; fila `JobCorreo` pendiente.
- **Reintento con la misma clave de idempotencia:** dos llamadas idénticas → una sola fila
  `Voto`, mismo comprobante en ambas respuestas.
- **Colisión de `UNIQUE` con clave distinta:** dos llamadas secuenciales, mismo derecho, claves
  distintas → segunda llamada devuelve el comprobante existente, nunca un error; exactamente una
  fila `Voto`.
- **Cada causa de rechazo** (sección 4): pantalla/código esperado, evento `RECHAZO` creado, cero
  filas `Voto`.
- **Voto en blanco:** fila `Voto` con `blanco = true` y el resto de columnas de elección en null,
  respetando el `CHECK` de #2.
- **Frontera de cierre:** confirmación a `hh:cierre − 1s` aceptada, a `hh:cierre` rechazada. Riesgo
  de prueba: Postgres `now()` no se puede congelar trivialmente sin un mecanismo de reloj
  inyectable; construir la ventana `apertura`/`cierre` del proceso de prueba relativa al reloj
  real con un margen corto es viable pero propenso a *flakiness* — señalado como riesgo técnico
  para `sdd-design`/`sdd-tasks`, puede requerir una abstracción de reloj inyectable si se exige
  determinismo estricto.
- **El caso concurrente — no verificable con un test secuencial común.** Dos peticiones lanzadas
  con `Promise.all` sobre HTTP no garantizan una interleaving real de dos transacciones de
  Postgres (el pool de conexiones y el bucle de eventos de Node pueden serializar el trabajo sin
  que la carrera real ocurra). Para una prueba determinista de la garantía bajo carrera real se
  recomienda: dos clientes Prisma/`pg` con conexiones propias, coordinados manualmente por pasos
  (abrir tx1, ejecutar su `SELECT`/validación, abrir tx2, ejecutar su `SELECT`/validación —
  ambas ven `pendiente` — luego disparar ambos `INSERT` casi simultáneamente y esperar a que
  Postgres serialice el segundo y lo rechace con `23505`), en vez de depender de `Promise.all`
  sin coordinación. Alternativa más simple pero solo probabilística: una prueba de carga breve
  (disparar N peticiones concurrentes reales) que verifica invariantes finales (una sola fila
  `Voto`) a través de muchas repeticiones — útil como red de seguridad adicional, no como
  sustituto de la prueba determinista. Se recomienda incluir ambas: la determinista como prueba
  de la garantía, la probabilística como humo de regresión.
- **No fuga de elección en `RECHAZO`:** verificar contra la restricción del trigger de #3 (ver
  sección 6) una vez que se resuelva la ambigüedad de la "familia VOTO".

---

## 11. Pronóstico de líneas y forma de corte de PR (contra el presupuesto de 400)

La superficie completa de #14 — servicio transaccional del backend, la UI móvil de 3 pasos
completa (boleta en tarjetas, banda de calidad, voto en blanco), 5 pantallas de rechazo
específicas, y la suite de pruebas (que incluye el arnés de concurrencia determinista, el más
costoso de escribir) — excede holgadamente las 400 líneas de presupuesto de revisión. Estimación
aproximada: 900–1500+ líneas totales entre backend, frontend y tests. Forma de corte sugerida
para `sdd-tasks` (no se decide aquí, según la convención del guard de 400 líneas):

1. **Slice 1 — núcleo transaccional del backend.** `POST /votos`, `VotoService` con la
   transacción completa de la sección 2 (validación, `UNIQUE`, idempotencia, inserción mínima de
   `JobCorreo`, llamadas a `AuditoriaService.log` para `VOTO` y `RECHAZO`) + tests de integración
   del camino feliz, idempotencia, colisión de `UNIQUE`, y las cuatro causas de rechazo
   server-detectables. Máxima prioridad de revisión — lleva la garantía de "0 duplicados".
2. **Slice 2 — arnés de concurrencia dedicado.** El test determinista de dos transacciones en
   carrera real, aislado porque el código de coordinación multi-conexión es no trivial y merece
   revisión enfocada por separado del resto de la suite.
3. **Slice 3 — UI de los 3 pasos.** Paso 1/2/3 mobile-first, boleta en tarjetas, banda de
   calidad, opción de voto en blanco, generación/persistencia de la clave de idempotencia,
   casilla de consentimiento, estado "Registrando…" + tests de componente.
4. **Slice 4 — las 5 pantallas de rechazo** cableadas a las respuestas del backend del Slice 1 +
   sus tests de componente.

Cada slice: inicio y fin claros, alcance autónomo, verificable de forma independiente, sin
migraciones destructivas (el esquema ya existe desde #2) — rollback seguro vía `git revert`.

---

## 12. Riesgos, incógnitas y conflictos con los ADR

| Riesgo/incógnita | Naturaleza | Nota |
|---|---|---|
| Tensión `JobCorreo` #14 vs #15 | Resuelto en esta exploración a favor de ADR-0012 (inserción mínima en #14) | Debe declararse explícitamente en las propuestas de #14 y #15 para que coincidan |
| Ambigüedad de la "familia VOTO" del trigger de #3 respecto a `RECHAZO` | Abierto | Necesita resolverse en `sdd-design` de #14 y/o enmienda de #3, antes de implementar los payloads de `RECHAZO` |
| Código HTTP para el reintento con la misma clave de idempotencia (200 vs 201) | Abierto, sin ADR ni TDD que lo fije | Se recomienda `200 OK`; decisión final en `sdd-design` |
| "Aula que no corresponde" como causa de rechazo | Ambiguo — probablemente subsumido por "sin derecho" si #13 está bien implementado | Aclarar en `sdd-design` si merece pantalla propia o queda como chequeo defensivo sin pantalla dedicada |
| Prueba determinista del cierre por hora requiere reloj congelable o ventanas relativas al reloj real (riesgo de *flakiness*) | Riesgo técnico de testing | Puede requerir abstracción de reloj inyectable bajo TDD estricto |
| Prueba de la carrera real (concurrencia) exige arnés multi-conexión no trivial | Riesgo técnico de testing / velocidad de entrega | Aislado como Slice 2 para revisión enfocada |
| Cadena de dependencias íntegramente sin implementar (#13←...←#1) | Riesgo de secuencia, ya declarado por el orquestador | `sdd-apply` de #14 no puede empezar hasta que toda la cadena aterrice; `sdd-propose` sí puede avanzar en paralelo, como ya hicieron #2 y #3 |
| Partes de la alta fidelidad del Design.md (`SEEI Votación.dc.html`) están marcadas "Pendiente en alta fidelidad": pantallas de rechazo y la vista de "Mis votaciones" con los dos derechos separados | Brecha de insumo de diseño | #14 tendrá que producir esos elementos de alta fidelidad que hoy no existen, no solo implementarlos a partir de una referencia visual ya cerrada |
| Criterio "< 3 minutos en móvil" del PRD | No verificable solo con TDD automatizado | Requiere validación con usuarios reales; queda fuera del alcance que las pruebas de #14 pueden probar por sí solas |

---

## Recomendación

Proceder a `sdd-propose` para #14 ahora, documentando explícitamente el ajuste de alcance del
`JobCorreo` (sección 1) y dejando abiertas, para `sdd-design`, las decisiones aún no fijadas
(código HTTP de reintento, alcance exacto del trigger de #3 sobre `RECHAZO`, causa "aula que no
corresponde", estrategia de reloj inyectable para pruebas). El límite entre #13/#14/#15 queda
razonablemente claro salvo la matización del outbox, que esta exploración resuelve con
fundamento textual de ADR-0012. La garantía transaccional (validación + `UNIQUE` + idempotencia)
se mantiene como una sola pieza indivisible, conforme al mandato explícito de `BACKLOG.md`.

## Listo para propuesta

**Sí** — para `sdd-propose`, no para `sdd-apply` (bloqueado por la cadena de dependencias
declarada arriba). #14 puede avanzar en propuesta, diseño y tareas documentales en paralelo con
el resto de la cadena, siguiendo el mismo patrón que ya se aplicó a #2 y #3.
