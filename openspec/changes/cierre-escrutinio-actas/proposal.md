# Propuesta: cierre-escrutinio-actas (Backlog #17 — Cierre, escrutinio y actas)

## Intención

Hoy no existe ninguna acción de backend que cierre un proceso electoral: `EstadoProceso` ya declara
`cerrado`/`acta_emitida` en el schema desde `#2`, y `ProcesoElectoral.cierre_real` existe como
columna, pero ningún servicio los escribe. El rechazo de voto tras la hora prevista
(`votos.service.ts`) es puramente temporal, nunca toca `estado`. Tampoco existe generación de PDF
en ningún punto del monorepo, ni uso real del modelo `Acta` (existente desde `#2` pero sin ningún
consumidor). Sin este change, la jornada electoral termina sin cierre formal, sin escrutinio
oficial y sin las 4 actas que el criterio de éxito 10 del PRD exige, dejando el Flujo 4 de
TECH-DESIGN.md a medio implementar (`#16` cubrió solo la vista en vivo).

`#17` está listado explícitamente en la sección "Ausencia de reglamento previo" de `BACKLOG.md`: la
institución no tiene reglamento electoral escrito ni formato oficial de actas, así que **esta spec
define la norma**, no la sigue. Cada regla de negocio adoptada abajo se declara explícitamente y se
marca **configurable/revisable** para que un futuro reglamento institucional pueda ajustarla sin
forzar una reescritura del modelo de datos ni del flujo de cierre.

## Decisiones del proposal — resuelven las 7 preguntas abiertas de la exploración

Sesión en modo automático: no se abre una ronda de preguntas al usuario antes de fijar estas
decisiones. Quedan documentadas con su justificación y su estado de revisabilidad; el usuario puede
corregir cualquiera antes de `sdd-spec`/`sdd-design` (ver sección final).

### 1. Migración de `TipoActa`: se agregan `escrutinio` y `oficial`, `resultados` queda deprecado

**Decisión:** migración Prisma que agrega los valores `escrutinio` y `oficial` al enum `TipoActa`
(Postgres no permite `DROP VALUE`, así que `resultados` permanece en el tipo pero se documenta como
deprecado y ningún código nuevo lo usa). El enum queda con 5 valores declarados, 4 usados por
`#17`: `apertura`, `cierre`, `escrutinio`, `oficial`.

Contenido de cada acta (las 4 se generan atómicamente al cerrar, no en el momento real de apertura):
`apertura` = snapshot del padrón congelado y la hora de apertura real; `cierre` = snapshot de
participación al momento del cierre (votos emitidos, hora de cierre real, quórum informativo);
`escrutinio` = desglose completo por candidato/lista/opción (catálogo completo, incluyendo bajas,
igual que `ResultadosService.catalogoCompleto()`), cuadre, empate; `oficial` = documento consolidado
que combina las tres anteriores con los firmantes, pensado como el acta que se imprime/archiva
formalmente. **Configurable/revisable**: si un futuro reglamento define un formato distinto para
`oficial` (p. ej. fusionarla con `escrutinio`), es un cambio de plantilla, no de modelo de datos.

### 2. Transición `cerrado` → `acta_emitida`: la hace el worker, no el backend

**Decisión:** el worker, dentro de la misma transacción en la que marca la 4ª `Acta` como
`emitida`, verifica `COUNT(Acta WHERE proceso_id = $1 AND estado = 'emitida') = 4` y, si se cumple,
actualiza `ProcesoElectoral.estado = 'acta_emitida'`. El backend nunca hace esta transición en una
relectura; solo la observa. Se elige el worker porque ya es el actor que escribe el estado terminal
de cada `Acta` (mismo patrón que `outbox-dispatcher.ts` marca `JobCorreo.estado = 'enviado'`), y
mover la responsabilidad al backend requeriría un polling adicional sin beneficio. **Configurable**:
si en el futuro se necesita que un humano confirme la emisión final antes de esa transición (p. ej.
revisión manual del comité), se puede insertar un estado intermedio sin tocar el enum de `Acta`.

### 3. Cierre por hora vs. cierre manual: el cierre es siempre una acción manual del comité

**Decisión:** `cerrar()` es siempre una acción explícita del comité (`POST /procesos/:id/cerrar`,
mismo patrón `confirmar: boolean` que `abrir()`), nunca disparada automáticamente por
`fecha_cierre_prevista`. El rechazo de voto por hora (`votos.service.ts`, `VOTACION_CERRADA`)
permanece sin cambios — es una regla temporal independiente del `estado`. Esto crea una ventana
aceptada: entre la hora prevista y el cierre manual, el proceso ya no acepta votos pero
`estado` sigue `abierto`. Se elige esta opción porque ninguna fuente (PRD/ADR) exige un cierre
automático, y automatizarlo introduciría un cron/job nuevo sin requerimiento que lo respalde — el
comité siempre puede cerrar tan pronto como quiera después de la hora prevista, y `cerrar()` es
idempotente (200 no-op si ya está `cerrado`). **Configurable/revisable**: un futuro reglamento que
exija cierre automático a la hora exacta puede agregarse como un job separado que llama al mismo
`cerrar()` interno, sin cambiar su contrato.

### 4. Librería de PDF: `pdfkit`

**Decisión:** `pdfkit` para el worker.

| Opción | Por qué se descarta / por qué se elige |
|---|---|
| **pdfkit** (elegida) | API imperativa pura Node (sin dependencias nativas, sin motor de navegador) — encaja con un worker BullMQ en una imagen Docker de VPS pequeña (ADR-0007): footprint mínimo, arranque rápido, sin Chromium que descargar/mantener. Suficiente para el layout de un acta (tablas de conteos, texto, firmantes, sin diseño gráfico complejo). |
| `puppeteer`/`playwright` | Requieren un binario de Chromium completo (cientos de MB extra en la imagen del worker, más superficie de fallos en un VPS con recursos acotados) para renderizar HTML→PDF; sobredimensionado para un documento tabular simple. |
| `@react-pdf/renderer` | Viable, pero acopla el layout del acta a JSX/React en un paquete de worker que hoy es Node puro sin ninguna dependencia de React — agrega una capa de build innecesaria para el caso de uso. |

`pdfkit` es la opción de menor huella de despliegue para exactamente el tipo de documento
(tabular, texto, sin gráficos) que piden las 4 actas.

### 5. Firmantes: captura manual en el propio flujo de cierre, no un campo nuevo de `Configuracion`

**Decisión:** `TECH-DESIGN.md` afirma que `Configuracion` guarda "comité (nombres que se imprimen
en actas)", pero el modelo real (`schema.prisma`) **no tiene ese campo** — solo `director`. En vez
de agregar una migración a `Configuracion` sin fuente de verdad clara, `CerrarProcesoDto` agrega un
campo `firmantes: { nombre: string; cargo: string }[]` (mínimo 1 elemento) que el comité completa al
confirmar el cierre — mismo momento y mismo patrón que `confirmar: boolean` de `abrir()`. Los
firmantes quedan congelados dentro del snapshot `Acta.contenido` de la transacción de cierre, igual
que el padrón se congela al abrir: el acta es reproducible después de cambios de personal porque no
depende de una consulta en vivo a `Usuario WHERE rol='comite'`. **Configurable/revisable**: un
futuro reglamento puede agregar `Configuracion.comite` como lista por defecto que el comité edita
(no reemplaza) al cerrar, sin cambiar el contrato de `CerrarProcesoDto`.

### 6. Empate: 2+ opciones comparten el máximo del único desglose del proceso

**Decisión (revisada en `sdd-design`, ver Reconciliación abajo):** el schema no tiene ningún
modelo de agrupación intra-proceso — `Candidato.cargo` es `String?` libre sin FK, y
`resultados.service.ts` confirma que `catalogoDe(tipo)` produce **una sola dimensión de conteo por
proceso** (`groupBy` único sobre `lista_id`/`candidato_id`/`opcion_id` según el tipo). No existe
soporte de datos para "varios cargos compitiendo dentro del mismo proceso" (ej. presidente y
vicepresidente en la misma boleta con conteos separados). La decisión original de la propuesta
("empate por agrupación: cargo o pregunta") **no es implementable sin agregar un modelo `Cargo`
nuevo**, algo que ni PRD ni ADR piden y que ampliaría el alcance de este change.

Empate se declara cuando 2 o más candidatos/listas/opciones comparten el conteo máximo del único
desglose del proceso (no hay sub-agrupación). Empates en posiciones inferiores del desglose no se
marcan como "empate" a nivel de acta (el desglose completo ya los muestra con sus conteos exactos).
El acta de escrutinio incluye `empate: boolean` + el listado de IDs empatados; la resolución queda
**siempre** en manos del comité (PRD: "la resolución es decisión del comité electoral, no del
sistema") — el sistema nunca desempata, ni bloquea el cierre por empate.

**Fuera de alcance, explícito:** procesos con múltiples cargos compitiendo dentro de un mismo
proceso electoral (agrupación por `cargo`) — confirmado con el usuario. Si un futuro reglamento o
requerimiento de producto lo necesita, requiere un modelo `Cargo` nuevo y una revisión del cálculo
de escrutinio y de la agrupación de resultados de `#16`; no es un cambio de plantilla del acta.
**Configurable/revisable**: el umbral "solo primer lugar del desglose" en sí (no la agrupación) sí
es ajustable por plantilla si un futuro reglamento exige reportar cualquier empate en cualquier
posición del ranking.

### 7. `EstadoActa` gana un tercer valor `fallido`

**Decisión:** dado que la migración de `Acta`/`TipoActa` ya es obligatoria (sección 1), se aprovecha
para agregar `fallido` a `EstadoActa` (`borrador | emitida | fallido`), en paridad exacta con
`EstadoJobCorreo`. El dispatcher del worker usa primero los reintentos nativos de BullMQ
(`attempts`/`backoff`, mismo patrón que `outbox-dispatcher.ts`); solo cuando se agotan los intentos,
marca la fila `Acta.estado = 'fallido'` para que quede visible en una consulta directa (sin depender
de inspeccionar la cola de BullMQ) y quede disponible para reintento manual/alertamiento futuro. Sin
este estado, una acta que falla permanentemente quedaría indistinguible de una que simplemente aún
no fue procesada (`borrador`). No configurable — es una decisión de robustez operativa, no una regla
electoral.

### Reglas adicionales sin pregunta explícita en la exploración, pero exigidas por `BACKLOG.md`

- **Cuadre**: `votos_por_opción + blancos + abstenciones = padrón`, nulos siempre en 0 (ya
  anticipado por ADR-0008). Nota explicativa fija: *"Los votos nulos se reportan en 0: el sistema no
  permite emitir un voto nulo; toda boleta enviada es válida o en blanco."* **Configurable**: el
  texto exacto es responsabilidad de plantilla, ajustable sin tocar el cálculo.
- **Participación cero**: `cerrar()` nunca bloquea por `votos_emitidos = 0`; los porcentajes se
  calculan con guarda de división por cero (si además `padron_total = 0`, el acta reporta `0%` con
  nota, no un error).
- **Quórum**: campo puramente informativo (`votos_emitidos / padron_total`) en el acta de cierre.
  No existe ningún umbral que invalide o bloquee el cierre — el PRD no lo exige. **Configurable**:
  un futuro reglamento puede convertirlo en condición de bloqueo; hoy es solo dato reportado.
- **Candidato/lista dado de baja**: el acta de escrutinio reutiliza `catalogoCompleto()` (sin
  filtrar por `estado`) y expone `estado` + `baja_en` por fila — requiere extender el DTO de
  escrutinio, no el cálculo.
- **Reproducibilidad**: `Acta.contenido` guarda el snapshot completo en JSON estructurado (conteos,
  firmantes, timestamp de cálculo, hora real de apertura/cierre), calculado una sola vez dentro de
  la transacción de `cerrar()` — nunca recalculado después ni servido desde la caché de `#16`. El
  PDF se renderiza a partir de ese JSON, nunca al revés.

## Alcance

### Dentro de alcance

- `POST /procesos/:id/cerrar`: mismo patrón concurrency-safe/idempotente de `abrir()`
  (`ProcesosService.abrir()`), `UPDATE estado='cerrado', cierre_real=clock_timestamp() WHERE estado
  = 'abierto'`, no-op 200 si ya `cerrado`, `ConflictException` con código `PROCESO_NO_CERRABLE` si
  el estado no lo permite. `CerrarProcesoDto` con `confirmar: boolean` + `firmantes: {nombre, cargo}
  []` (mínimo 1).
- Dentro de la misma transacción de cierre: cálculo fresco del escrutinio (extraer
  `calcular()`/`catalogoCompleto()` de `ResultadosService` a una función pura compartida, sin caché
  ni gate de `ocultar_resultados`) y creación atómica de las 4 filas `Acta` (`estado: 'borrador'`,
  `contenido` = snapshot JSON con conteos/firmantes/cuadre/empate/quórum).
- Migración Prisma: `TipoActa` +`escrutinio`/`oficial`; `EstadoActa` +`fallido`; `Acta` +`pdf
  Bytes?`, `+pdf_mime String?` (mismo patrón que `Lista.plan_trabajo`/`Candidato.foto`).
- Worker: nuevo dispatcher análogo a `outbox-dispatcher.ts` sobre `Acta WHERE estado='borrador'`,
  render con `pdfkit`, persiste `pdf`/`pdf_mime`, marca `emitida` o `fallido` (agotados los
  reintentos de BullMQ), transiciona `ProcesoElectoral.estado = 'acta_emitida'` cuando las 4 están
  `emitida` (ver decisión 2).
- Auditoría (append-only): `PROCESO_CERRADO` (análoga a `PROCESO_ABIERTO`, con conteos en el
  payload) y `ACTA_GENERADA` (con `tipo` en el payload).
- Endpoint de lectura de actas para descarga (`GET /procesos/:id/actas` o similar) — necesario para
  que el comité acceda a los PDFs generados; alcance exacto de rutas/roles se resuelve en
  `sdd-design`.

### Fuera de alcance

- Cierre automático disparado por `fecha_cierre_prevista` (decisión 3) — el rechazo de voto por hora
  sigue siendo puramente temporal, sin cambios.
- Firma digital certificada de actas — excluida explícitamente por el PRD.
- Migración de `Configuracion` para agregar un campo `comité` — decisión 5 la difiere a un futuro
  reglamento.
- Umbral de quórum como condición bloqueante de cierre — hoy es puramente informativo (ver reglas
  adicionales).
- Reportes/exportaciones agregadas (Excel/CSV) de resultados — Backlog `#18`, fuera de este change.
- Contingencia de jornada (extensión de hora de cierre, revoto) — Backlog `#22`, fuera de este
  change.
- Múltiples cargos compitiendo dentro de un mismo proceso electoral (agrupación de resultados por
  `cargo`) — el schema no tiene modelo de agrupación intra-proceso; confirmado fuera de alcance con
  el usuario tras la reconciliación de `sdd-design` (ver decisión 6).

## Enfoque

1. Extraer `calcular()`/`catalogoCompleto()` de `ResultadosService` a una función pura compartida
   (p. ej. `calcularEscrutinio()`), sin caché ni gate de `ocultar_resultados`, consumida por
   `ResultadosService` (con caché+gate encima, sin cambios) y por el nuevo servicio de cierre.
2. `ProcesosService.cerrar()`: transacción única que valida `estado='abierto'`, actualiza `estado`/
   `cierre_real`, calcula el escrutinio fresco y crea las 4 filas `Acta` en `borrador`, registra
   `PROCESO_CERRADO` en auditoría.
3. Migración Prisma sobre `Acta`/`TipoActa`/`EstadoActa` (sección "Dentro de alcance").
4. Worker: dispatcher de actas (polling sobre `Acta WHERE estado='borrador'`, `addBulk` con `jobId`
   determinístico `acta:<id>`), processor con `pdfkit`, persistencia de bytes, transición de estado
   y auditoría `ACTA_GENERADA`.
5. Cuando las 4 actas de un proceso están `emitida`, el mismo worker transiciona
   `ProcesoElectoral.estado = 'acta_emitida'` (decisión 2).
6. Endpoint(s) de lectura/descarga de actas.

## Capabilities

### New Capabilities
- `cierre-escrutinio-actas`: acción de cierre transaccional del proceso electoral, cálculo de
  escrutinio oficial reutilizando la agregación de `#16`, generación atómica (outbox) de 4 actas en
  PDF por el worker, con reglas de negocio explícitas para cuadre, empate, participación cero,
  candidato de baja, firmantes y quórum.

### Modified Capabilities
- `resultados-en-vivo` (`#16`): sin cambio de requisitos — se extrae su lógica de cálculo interna a
  una función compartida, pero el contrato del endpoint `GET /procesos/:id/resultados` y su spec no
  cambian.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/prisma/schema.prisma` | Modified | Migración: `TipoActa`+2, `EstadoActa`+1, `Acta`+`pdf`/`pdf_mime` |
| `apps/backend/src/procesos/procesos.service.ts` | Modified | Nuevo método `cerrar()`, patrón de `abrir()` |
| `apps/backend/src/procesos/procesos.errors.ts` | Modified | Código nuevo `PROCESO_NO_CERRABLE` |
| `apps/backend/src/procesos/dto/` | New | `CerrarProcesoDto`, `CierreRespuestaDto` |
| `apps/backend/src/procesos/resultados.service.ts` | Modified | Extracción de `calcularEscrutinio()` compartida |
| `apps/backend/src/procesos/actas/` (nuevo módulo) | New | Servicio de escrutinio/actas, endpoint de lectura/descarga |
| `apps/worker/src/outbox/actas-dispatcher.ts` (nuevo) | New | Dispatcher análogo a `outbox-dispatcher.ts`, render con `pdfkit` |
| `apps/worker/src/main.ts` | Modified | Registro del nuevo `Worker`/cola de actas |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modified | Claves nuevas `PROCESO_CERRADO`, `ACTA_GENERADA` |
| `apps/worker/package.json` | Modified | Nueva dependencia `pdfkit` |
| `apps/backend/test/` | New | Pruebas de cierre (idempotencia, cuadre, empate, participación cero) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Migración de `Acta`/`TipoActa`/`EstadoActa` se subestima como "el modelo ya existe" | Media | Declarada explícitamente arriba como obligatoria; exploration.md ya la identificó |
| `pdfkit` resulta insuficiente para maquetar el layout final del acta (tablas complejas, firmas) | Baja | API suficientemente flexible para tablas/texto simples; si `sdd-design` descubre un límite real, el cambio de librería no afecta el contrato JSON→PDF (el snapshot ya es la fuente de verdad) |
| Ventana entre hora de cierre prevista y cierre manual del comité genera confusión operativa | Media | Aceptada explícitamente (decisión 3); UI del comité debe mostrar claramente "cierre pendiente de confirmación" — detalle de `sdd-design` |
| Firmantes capturados manualmente pueden tener errores tipográficos sin validación contra un padrón de usuarios | Baja | Aceptado: son texto libre igual que otros campos de captura manual del sistema (p. ej. `director` en `Configuracion`); un futuro reglamento puede formalizar la fuente |
| Reglas de empate/quórum/cuadre definidas aquí no coinciden con el futuro reglamento institucional | Media | Mandato explícito de `BACKLOG.md`: cada regla se marca configurable/revisable arriba, aislada de la migración de datos |

## Rollback Plan

Sin datos de producción. La migración de `Acta`/`TipoActa`/`EstadoActa` es aditiva (nuevos valores
de enum, columnas nullable `pdf`/`pdf_mime`) — revertirla requiere recrear los enums sin los valores
nuevos, solo seguro si ninguna fila los usa todavía (verificar antes de revertir en un entorno con
datos). El código de aplicación (`cerrar()`, dispatcher del worker, endpoints) se revierte con `git
revert` sin dejar estado huérfano: las filas `Acta` en `borrador` sin PDF simplemente no se procesan
más (el worker deja de correr), y `ProcesoElectoral.estado` puede quedar en `cerrado` sin avanzar a
`acta_emitida` — estado válido y consistente con el enum ya existente.

## Dependencies

- `#16` (`resultados-en-vivo`) — provee `ResultadosService.calcular()`/`catalogoCompleto()`, que
  este change extrae a una función compartida; ya implementado y archivado.
- `#13` (`apertura-proceso-congelamiento-padron`) — provee `DerechoVoto` congelado, base del
  padrón usado en el cuadre; ya implementado y archivado.
- ADR-0008 (reglas operativas de jornada), ADR-0012/ADR-0018 (patrón outbox, vinculantes para el
  dispatcher de actas).

## Success Criteria

- [ ] `POST /procesos/:id/cerrar` transiciona `abierto → cerrado`, es idempotente (200 no-op si ya
      `cerrado`) y devuelve `PROCESO_NO_CERRABLE` si el estado no lo permite
- [ ] El cierre crea las 4 filas `Acta` (`apertura`, `cierre`, `escrutinio`, `oficial`) en `borrador`
      dentro de la misma transacción que el `UPDATE` de `estado`
- [ ] El escrutinio se calcula una sola vez, dentro de la transacción de cierre, sin pasar por la
      caché de `#16`
- [ ] El cuadre `padrón = votos_por_opción + blancos + abstenciones` se cumple con nulos siempre en
      0 y su nota explicativa
- [ ] Un proceso con `votos_emitidos = 0` cierra sin error y genera las 4 actas reportando
      abstención total, sin división por cero
- [ ] El acta de escrutinio refleja candidatos/listas dados de baja con su `estado`/`baja_en`
- [ ] El acta de escrutinio marca `empate: true` cuando 2+ opciones comparten el máximo dentro de la
      misma agrupación, sin resolución automática
- [ ] El worker renderiza los 4 PDFs con `pdfkit`, persiste `pdf`/`pdf_mime`, marca `emitida` (o
      `fallido` tras agotar reintentos de BullMQ)
- [ ] `ProcesoElectoral.estado` transiciona a `acta_emitida` únicamente cuando las 4 actas están
      `emitida`
- [ ] `PROCESO_CERRADO` y `ACTA_GENERADA` quedan registrados en auditoría con conteos/`tipo` en el
      payload

## Proposal question round

Sesión en modo automático: no se abrió una ronda de preguntas al usuario en esta fase. Las 7
preguntas que `exploration.md` (sección 10) dejó explícitamente abiertas se resolvieron arriba con
decisiones concretas y trazables a `BACKLOG.md`/PRD/ADR-0008/ADR-0012/ADR-0018 y al código real del
repo (`abrir()`, `outbox-dispatcher.ts`, `ResultadosService`). Siguiendo el mandato de "ausencia de
reglamento previo", cada regla de negocio sin fuente institucional previa (cuadre, empate,
participación cero, quórum, firmantes) queda marcada **configurable/revisable** en su sección
correspondiente, para que un futuro reglamento escrito pueda ajustarla sin forzar una migración de
datos ni una reescritura del flujo de cierre. Si el usuario prefiere resolver alguna decisión de
forma distinta — en particular la librería de PDF (decisión 4) o la fuente de firmantes (decisión
5), las dos con mayor superficie de cambio si se revisan — puede indicarlo antes de continuar a
`sdd-spec`/`sdd-design`.
