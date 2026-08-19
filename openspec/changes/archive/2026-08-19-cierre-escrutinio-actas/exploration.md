# Exploración: Cierre, escrutinio y actas (Backlog #17)

## Estado del backlog y contexto de dependencias

`#17` depende de `#16` (Resultados en vivo), ya implementado y archivado en
`openspec/changes/archive/2026-08-15-resultados-en-vivo/`. El repo tiene código real hasta `#16`
(commits `bcf5196`..`4cda56e`). `#17` es el ítem que TECH-DESIGN.md llama "Flujo 4 — Resultados,
escrutinio y actas", marcado explícitamente como **parcialmente implementado**: la parte de
resultados en vivo está hecha, cierre/escrutinio/actas están pendientes.

`#17` está en la lista de specs afectadas por la sección "Ausencia de reglamento previo" de
`BACKLOG.md`: la institución no tiene reglamento electoral ni formato oficial de actas, así que
esta spec **define la norma**, no la sigue. Cada regla adoptada debe declararse explícitamente y
marcarse configurable/revisable.

## Fuentes leídas

`BACKLOG.md` (fila #17 y sección "Ausencia de reglamento previo"), `PRD.md` (criterio de éxito 10
"Actas electorales", casos borde de empate/participación cero/candidato de baja, "fuera de
alcance: firma digital certificada"), `TECH-DESIGN.md` (modelo de datos completo, "Flujo 4 —
Resultados, escrutinio y actas"), `adrs/0008-reglas-operativas-jornada.md`,
`adrs/0018-ventana-temporal-jobcorreo-diferido.md`, `apps/backend/prisma/schema.prisma` (grupos 2 y
4 completos), `apps/backend/src/procesos/{procesos.service.ts,procesos.controller.ts,
procesos.errors.ts,resultados.service.ts,resultados.controller.ts,resultados-cache.ts}`,
`apps/backend/src/procesos/dto/{abrir-proceso.dto.ts,apertura-respuesta.dto.ts,
resultados-respuesta.dto.ts}`, `apps/backend/src/votos/votos.service.ts` (rechazo por hora de
cierre), `apps/backend/src/auditoria/audit-event-types.ts`, `apps/worker/src/main.ts`,
`apps/worker/src/outbox/outbox-dispatcher.ts`, `apps/backend/src/votos/comprobante.service.ts`
(precedente de generación de comprobante — sin PDF), `openspec/config.yaml`,
`openspec/changes/archive/2026-08-15-resultados-en-vivo/exploration.md` (como plantilla y fuente
de patrones de #16).

---

## 1. Estado del proceso electoral — el cierre NO existe como acción hoy

`EstadoProceso` (schema.prisma) ya declara **4 valores**: `borrador | abierto | cerrado |
acta_emitida`. Pero:

- **No hay ninguna acción de backend que transicione a `cerrado`.** El único campo relacionado,
  `ProcesoElectoral.cierre_real` (`DateTime?`), existe en el schema pero ninguna consulta ni
  servicio lo escribe.
- **El rechazo de voto tras la hora de cierre es puramente temporal, no de estado**:
  `votos.service.ts` calcula `(now() >= p.fecha_cierre_prevista) AS cerrado_por_hora` en SQL crudo
  y rechaza con `VOTACION_CERRADA` — nunca consulta `estado`. Esto significa que hoy un proceso
  puede estar "cerrado por hora" indefinidamente sin que `estado` lo refleje, y viceversa: si #17
  introduce una acción `cerrar()` explícita que cambia `estado`, hay que decidir si el cierre por
  hora automático también debe transicionar `estado` (cron/job) o si el cierre es siempre una
  acción manual del comité que ocurre *después* de la hora prevista — **pregunta de diseño
  abierta**, no resuelta por el código actual.
- **Patrón exacto a reutilizar para `cerrar()`**: `ProcesosService.abrir()`
  (`apps/backend/src/procesos/procesos.service.ts:560`) es la plantilla ideal — `UPDATE
  "ProcesoElectoral" SET estado = 'cerrado', cierre_real = clock_timestamp() WHERE id = $1 AND
  estado = 'abierto' RETURNING ...` dentro de `$transaction`, no-op idempotente con 200 si ya
  estaba `cerrado`, `ConflictException` con un código nuevo (`PROCESO_NO_CERRABLE`, mismo idioma
  que `PROCESO_NO_ABRIBLE` en `procesos.errors.ts`) si el estado no lo permite. `AbrirProcesoDto`
  (`{ confirmar: boolean }`) y `AperturaRespuestaDto` son plantillas directas para `CerrarProcesoDto`
  / `CierreRespuestaDto`.
- **`acta_emitida` como estado final explícito**: el enum ya anticipa que el cierre y la emisión de
  actas son dos transiciones distintas (`cerrado` → `acta_emitida`), coherente con un patrón outbox
  donde `cerrar()` deja el proceso en `cerrado` y el worker completa la transición a `acta_emitida`
  solo cuando las 4 actas están generadas. Esto es una decisión de diseño que #17 debe declarar
  explícitamente (quién y cuándo mueve `cerrado` → `acta_emitida`).

## 2. El modelo `Acta` ya existe en el schema — con gaps reales frente al alcance pedido

`apps/backend/prisma/schema.prisma` (grupo 4, desde `#2`, **sin ningún uso** en `apps/backend/src`
ni `apps/worker/src` — confirmado por el propio TECH-DESIGN.md línea 220 y por búsqueda en el
código):

```prisma
enum TipoActa {
  apertura
  cierre
  resultados
}

enum EstadoActa {
  borrador
  emitida
}

model Acta {
  id         String     @id @default(uuid()) @db.Uuid
  proceso_id String     @db.Uuid
  tipo       TipoActa
  estado     EstadoActa @default(borrador)
  contenido  String
  creado_en  DateTime   @default(now()) @db.Timestamptz(3)

  proceso ProcesoElectoral @relation(fields: [proceso_id], references: [id], onDelete: Restrict)
}
```

**Gaps frente a lo que pide `BACKLOG.md`/`PRD.md`/`TECH-DESIGN.md` (los tres coinciden en "4 actas:
apertura, cierre, escrutinio, oficial")**:

- `TipoActa` solo tiene **3** valores (`apertura`, `cierre`, `resultados`) y usa `resultados` en vez
  de `escrutinio`/`oficial`. **Falta una migración** que agregue `escrutinio` y `oficial` (y decida
  si `resultados` se renombra o se elimina — un enum de Postgres no permite `DROP VALUE` sin
  recrear el tipo, así que probablemente se agregan los dos nuevos y `resultados` queda sin uso o se
  reutiliza como alias de uno de ellos; **decisión explícita para sdd-design**).
- `contenido` es `String` — no hay ninguna columna `Bytes` para el PDF binario generado, a
  diferencia del patrón ya establecido en el repo para blobs (`Lista.plan_trabajo Bytes?`,
  `Candidato.foto Bytes?`, `Configuracion.logo Bytes?`, todos con su columna `_mime` hermana). #17
  necesita agregar algo como `pdf Bytes?` / `pdf_mime String?` (o un `pdf_generado_en
  DateTime?`) a `Acta`.
- `EstadoActa` solo tiene `borrador`/`emitida` — sin un tercer estado tipo `fallido` para el caso
  en que el worker no pueda renderizar el PDF (a diferencia de `EstadoJobCorreo`, que sí tiene
  `pendiente | enviado | fallido`). Vale la pena declarar esto como decisión explícita: ¿el patrón
  de reintentos de BullMQ (`attempts`/`backoff`, igual que `outbox-dispatcher.ts`) es suficiente sin
  un estado terminal de fallo visible en la tabla, o se necesita paridad con `JobCorreo`?
- No hay ningún campo para "firmantes"/"observaciones"/"quórum" — ver sección 5.

**Consecuencia directa**: #17 **no puede evitar una migración Prisma** sobre `Acta`/`TipoActa`/
`EstadoActa`, pese a que el modelo ya "existe". Cualquier lectura que asuma "el modelo ya está
listo, solo falta el service" es incorrecta.

## 3. No existe generación de PDF en ningún lugar del repo — sorpresa de dependencia nueva

Igual que #16 descubrió que React Query/gráficos no estaban instalados pese a que el ADR los daba
por decididos, #17 tiene una sorpresa equivalente: **ninguna librería de generación de PDF está
instalada ni usada en todo el monorepo** (busqué `pdf`/`PDF` en `apps/`: los únicos matches son
sobre `plan_trabajo` de listas — un archivo PDF que el comité **sube**, no que el sistema
**genera**). El comprobante de voto de `#15` (`ComprobanteDto`,
`apps/backend/src/votos/comprobante.service.ts`) es JSON/vista HTML autenticada — **nunca produce
un PDF**, pese a que la wording original del backlog invita a pensar "reusar el patrón de PDF del
worker de #15": ese patrón no existe, hay que inventarlo.

**Lo que sí existe y es reutilizable de #15** es el patrón de comunicación backend→worker (outbox),
no un patrón de PDF:

- `apps/worker/src/outbox/outbox-dispatcher.ts` — polling liviano sobre filas `estado='pendiente'`
  (barato gracias a `@@index([estado, creado_en])`), `addBulk` a BullMQ con `jobId` determinístico
  (`jobcorreo:<id>`) como primera capa de idempotencia.
- `apps/worker/src/main.ts` — un `Worker` de BullMQ por cola, con puerto de repo inyectado
  (`OutboxCorreoRepo`), nunca Prisma directo en el processor puro.
- **ADR-0012/ADR-0018, vinculantes**: la fila que dispara el trabajo del worker (`JobCorreo`, y por
  extensión `Acta`) **debe nacer en la misma transacción** que el hecho que la origina (el voto para
  `JobCorreo`, el cierre del proceso para `Acta`). Un despachador que lea "desde fuera" de esa
  transacción original (barrido periódico externo a la escritura, trigger `AFTER COMMIT`) está
  **vetado explícitamente**, no solo desaconsejado.

**Recomendación de diseño**: `cerrar()` crea las 4 filas `Acta` (`estado: 'borrador'`, `contenido`
= snapshot JSON/texto calculado dentro de la misma transacción de cierre) atómicamente con el
`UPDATE estado='cerrado'`. El worker agrega un despachador análogo a
`outbox-dispatcher.ts` que hace polling sobre `Acta WHERE estado='borrador'`, renderiza el PDF
(librería nueva a elegir: `pdfkit`, `puppeteer`/`playwright`, `@react-pdf/renderer`, etc. — ninguna
elegida por ningún ADR, decisión abierta), persiste los bytes, marca `estado='emitida'`, registra
auditoría, y solo cuando las 4 actas de un proceso están `emitida` alguien (¿el mismo worker? ¿el
backend en la siguiente lectura?) transiciona `ProcesoElectoral.estado` a `acta_emitida`.

## 4. Lógica de cálculo reutilizable de #16 — no duplicar el escrutinio

`ResultadosService.calcular()` (`apps/backend/src/procesos/resultados.service.ts:82-172`) ya
implementa exactamente los números que el escrutinio necesita:

- `padron_total = count(DerechoVoto WHERE proceso_id)` — padrón congelado, nunca `Matricula`/
  `Usuario` en vivo (ya establecido por `#13`).
- `votos_emitidos = count(Voto WHERE proceso_id)`.
- `blancos = count(Voto WHERE proceso_id AND blanco = true)`.
- `catalogoCompleto()` — `groupBy` sobre `Voto` por `lista_id`/`candidato_id`/`opcion_id` según
  `catalogoDe(proceso.tipo)`, **sin filtrar `estado: 'activo'`** (comentario explícito en el código:
  "el resultado es 'qué se eligió', no 'qué se podía elegir'") — el catálogo completo incluye
  candidatos/listas dados de baja con su `estado` visible en la fila. **Este es exactamente el
  comportamiento que el acta de escrutinio necesita para el caso borde "candidato dado de baja"**
  (PRD: "el acta de escrutinio refleja la baja y su momento").

**Diferencias que impiden reutilizar `ResultadosService.obtener()` tal cual**:

- Pasa por caché Redis de 8 s (`resultados-cache.ts`, D7/D8 de #16) — el acta oficial no puede
  depender de una caché de lectura pública; necesita el cálculo fresco, hecho una sola vez, dentro
  de la transacción de cierre.
- Respeta `ocultar_resultados` (devuelve solo participación si está oculto) — el acta interna
  **siempre** necesita el desglose completo, independientemente de si el público lo ve.
- No expone `baja_en` (solo `estado: 'activo' | 'baja'`) — el acta de escrutinio necesita el
  momento de la baja, no solo el estado; requiere un DTO nuevo o extender `ResultadoOpcionDto`.

**Recomendación**: extraer la función interna `calcular()`/`catalogoCompleto()` a un servicio o
función pura compartida (p. ej. `TallyService` o `calcularEscrutinio()`), parametrizada sin caché
ni gate de visibilidad, consumida tanto por `ResultadosService` (con caché+gate encima) como por el
nuevo servicio de cierre. Evita reimplementar el mismo `groupBy` dos veces.

## 5. Reglas de negocio sin reglamento previo — lo que #17 debe declarar explícitamente

Por la sección "Ausencia de reglamento previo" de `BACKLOG.md`, base de buenas prácticas a aplicar:
"actas con quórum/participación/resultados/firmantes y observaciones, empate declarado sin
resolución automática". Ninguno de estos campos existe hoy en el modelo de datos salvo lo que ya
cubre `ResultadosService`.

- **Cuadre**: `votos_por_opción + blancos + abstenciones = padrón`, con **nulos siempre 0** y nota
  explicativa — ya anticipado literalmente por ADR-0008 ("los reportes y actas muestran la columna
  de nulos siempre en 0, con nota explicativa en el acta de escrutinio"). `abstenciones =
  padron_total - votos_emitidos` (aritmético, sin tabla propia). La "nota explicativa" es texto que
  #17 debe fijar (o hacer configurable) — no hay redacción previa en ningún ADR/PRD.
- **Empate**: PRD lo dice explícito — "el sistema debe reflejar el empate en el acta; la resolución
  es decisión del comité electoral, no del sistema". #17 debe definir la regla de detección: ¿empate
  = 2+ candidatos/listas/opciones comparten el máximo de votos del desglose? ¿Solo relevante para el
  primer lugar, o cualquier empate en cualquier posición se declara? El PRD no lo precisa —
  **decisión a declarar en sdd-propose**, y marcarla revisable.
- **Participación cero**: "el cierre y las actas deben generarse igualmente, reportando abstención
  total" (PRD, caso borde). Implica: (a) `cerrar()` no debe bloquear si `votos_emitidos = 0`; (b) el
  cálculo de porcentajes debe guardar contra división por cero si además `padron_total = 0` (proceso
  sin nadie elegible, caso más extremo aún no cubierto por ningún test visto).
- **Candidato/lista dado de baja**: el schema ya tiene `estado: EstadoParticipacion` + `baja_en` en
  `Candidato`/`Lista`, y `ResultadosService` ya no filtra por `estado` — el patrón de "catálogo
  completo" ya existe y se reutiliza. Falta exponer `baja_en` en el DTO del escrutinio.
- **Firmantes/observaciones/quórum**: **sin fuente en el modelo de datos actual**. TECH-DESIGN.md
  (línea 130) afirma que `Configuracion` guarda "comité (nombres que se imprimen en actas)", pero el
  `Configuracion` real en `schema.prisma` **no tiene ese campo** — solo `director: String?`. La
  fuente real de "firmantes" tendría que ser una consulta a `Usuario WHERE rol='comite'` en el
  momento del cierre, o un campo nuevo en `Configuracion`, o campos libres capturados en el momento
  del cierre (p. ej. el comité escribe los nombres al confirmar el cierre, similar al patrón
  `confirmar: boolean` de `AbrirProcesoDto`). Ninguna opción está decidida — **pregunta abierta
  central para sdd-propose**, y la más directamente ligada al mandato de "declarar la regla, no
  dejarla implícita" de `BACKLOG.md`.
- **Quórum**: no hay concepto de quórum mínimo en ningún ADR/PRD para invalidar una elección — el
  PRD no lo menciona en absoluto. Si `#17` lo incluye por buena práctica (como sugiere la lista de
  `BACKLOG.md`), debe declararse como campo puramente informativo en el acta, no como condición de
  cierre (el PRD no exige rechazar el cierre por baja participación).

## 6. Auditoría — claves nuevas a agregar (registro aditivo)

`apps/backend/src/auditoria/audit-event-types.ts` es un catálogo append-only por convención (cada
change agrega sus propias claves con un comentario explicativo, nunca modifica las existentes). Hoy
no existe `PROCESO_CERRADO` ni ninguna clave de generación de acta. #17 necesita al menos:
`PROCESO_CERRADO` (análogo a `PROCESO_ABIERTO`, con conteos en el payload) y una o varias claves
para la generación de actas (`ACTA_GENERADA` genérica con `tipo` en el payload, o una clave por
tipo — `ACTA_APERTURA_GENERADA`, etc., siguiendo el patrón granular que ya usa el catálogo para
`LISTA_DADA_DE_BAJA`/`LISTA_REACTIVADA`). Ninguna de estas claves toca `Voto` directamente en su
payload (el acta agrega conteos, no elecciones individuales), así que en principio no activan la
cláusula `WHEN` del trigger de ADR-0016 — a confirmar en `sdd-design` con el mismo test
`[TM4]` que usan los changes anteriores.

## 7. Approaches (comparación para sdd-propose)

| Enfoque | Descripción | Pros | Contras | Esfuerzo |
|---|---|---|---|---|
| **A. Cierre + outbox de actas, worker con librería de PDF nueva** | `POST /procesos/:id/cerrar` (patrón `abrir()`) escribe `estado='cerrado'` + 4 filas `Acta` (`borrador`, `contenido` = snapshot JSON calculado en la misma tx) atómicamente; worker pollea `Acta` en `borrador`, renderiza PDF con una librería nueva, persiste bytes, marca `emitida`; cuando las 4 están `emitida`, el proceso pasa a `acta_emitida` | Sigue al pie de la letra ADR-0012/ADR-0018 (outbox real, sin encolado post-commit); reutiliza el patrón `abrir()` casi 1:1 para `cerrar()`; reutiliza el cálculo de `ResultadosService` extraído a función pura; el estado `acta_emitida` ya anticipado en el enum se usa con su semántica natural | Requiere migración de `Acta`/`TipoActa`/`EstadoActa`; introduce una librería de PDF nueva (costo de alcance real, sin decisión previa); requiere decidir quién transiciona `cerrado` → `acta_emitida` (worker vs. backend en lectura) | Alto (backend: cierre + escrutinio + migración; worker: primera integración de PDF; frontend: pantalla de cierre + descarga de actas) |
| **B. Cierre síncrono que genera y devuelve las 4 actas en la misma request** | `cerrar()` calcula el escrutinio y genera los 4 PDFs en línea, dentro del propio request HTTP del backend (sin worker) | Más simple de razonar, sin outbox nuevo, respuesta inmediata con las actas listas | Contradice el patrón arquitectónico ya establecido (worker para todo trabajo pesado/PDF/exportación, ver `openspec/config.yaml`: "patrón outbox para trabajos de correo/PDF/exportación"); genera PDFs síncronamente en el request del comité (latencia y riesgo de timeout si la librería elegida es pesada tipo Puppeteer); rompe la separación backend/worker que ADR-0001 (monolito modular + worker) establece | Medio, pero arquitectónicamente regresivo — probablemente rechazado en `sdd-design` |
| **C. Actas generadas bajo demanda (lazy), no en el momento del cierre** | `cerrar()` solo transiciona el estado; las actas se generan la primera vez que alguien las solicita (`GET /procesos/:id/actas/:tipo`), cacheadas después | Evita trabajo de PDF si nadie las pide nunca | Contradice el criterio de aceptación literal de TECH-DESIGN.md/PRD ("las 4 actas se generan... y cada generación queda en auditoría" — implica generación como parte del cierre, no bajo demanda); complica la garantía "el cierre y las actas se generan igualmente" para participación cero (si nadie las pide, ¿se generaron o no?) | Medio, pero contradice el criterio de aceptación explícito |

## 8. Recomendación

**Enfoque A** — `cerrar()` con el mismo patrón concurrency-safe/idempotente de `abrir()`, outbox de
`Acta` consumido por un worker nuevo que introduce la primera librería de PDF del proyecto,
reutilizando el cálculo de escrutinio extraído de `ResultadosService`. Es el único enfoque
consistente con el patrón outbox ya establecido por ADR-0012/ADR-0018 y con el criterio de
aceptación literal de TECH-DESIGN.md. El costo real (librería de PDF nueva, migración de `Acta`,
las 6 reglas de negocio sin reglamento previo) debe dimensionarse explícitamente en
`sdd-propose`/`sdd-design`, no asumirse como "el modelo ya existe, solo falta conectarlo".

## 9. Riesgos

- **Migración de `Acta`/`TipoActa`/`EstadoActa` obligatoria** pese a que el modelo "ya existe" en el
  schema desde `#2` — un vistazo superficial podría asumir que no hace falta tocar el schema.
- **Librería de PDF sin elegir**: ningún ADR la menciona; es una decisión de alcance nueva y no
  trivial (Puppeteer/Playwright son pesados para un worker Node; pdfkit/`@react-pdf/renderer` son
  más livianos pero requieren maquetar el layout del acta a mano). Recomiendo señalarlo como punto
  de decisión explícito en `sdd-propose`, igual que #16 hizo con React Query/gráficos.
- **Fuente de "firmantes" sin resolver**: `Configuracion` no tiene el campo que TECH-DESIGN.md da
  por existente. Si se resuelve con una consulta a `Usuario WHERE rol='comite'`, hay que decidir el
  momento exacto (¿snapshot al cierre, como el padrón? ¿lectura en vivo al generar el PDF?) para que
  el acta sea reproducible después de cambios de personal.
- **Relación cierre por hora vs. cierre por acción del comité sin resolver**: hoy el rechazo de voto
  es 100% temporal (`now() >= fecha_cierre_prevista`), no depende de `estado`. Si `#17` introduce
  `estado='cerrado'` como una acción separada y posterior a la hora, hay una ventana donde la
  votación ya está cerrada por hora pero el proceso sigue `abierto` en el modelo — a definir si es
  aceptable (el comité cierra manualmente después) o si necesita un mecanismo automático.
- **Empate y quórum sin definición operativa exacta**: el PRD exige reflejar el empate pero no
  define el umbral exacto (solo primer lugar vs. cualquier posición); el quórum no tiene ninguna
  fuente en PRD/ADR, sería una adición puramente informativa de `#17`.
- **Reproducibilidad del escrutinio** (criterio de aceptación de TECH-DESIGN.md: "un recuento
  directo sobre `Voto` coincide exactamente con el acta, y la cantidad/cronología de `Voto`
  coinciden con los eventos `VOTO` de auditoría") — implica que el snapshot `Acta.contenido` debe
  guardar suficiente detalle (conteos, timestamp del cálculo) para verificarse después contra
  `Voto`/`EventoAuditoria` sin recalcular; a definir el formato exacto de `contenido` (JSON
  estructurado recomendado, no solo el HTML/texto del PDF).

## 10. Preguntas abiertas para sdd-propose

1. ¿`TipoActa` se migra agregando `escrutinio`/`oficial` y dejando `resultados` sin uso, o se
   recrea el enum completo? ¿Se conservan 4 tipos distintos con contenido propio o "escrutinio" y
   "oficial" comparten el mismo cálculo con encabezado distinto?
2. ¿Quién y cuándo transiciona `cerrado` → `acta_emitida`: el worker al terminar la 4ª acta, o una
   relectura del backend?
3. ¿El cierre por hora (`fecha_cierre_prevista`) alguna vez dispara `cerrar()` automáticamente, o es
   siempre una acción manual del comité posterior a la hora prevista?
4. ¿Qué librería de PDF se elige para el worker, y con qué costo de imagen Docker/dependencias
   nativas (relevante para ADR-0007, despliegue VPS)?
5. ¿De dónde salen los "firmantes" del acta: `Usuario` con `rol='comite'` en el momento del cierre,
   un campo nuevo en `Configuracion`, o captura manual en el propio flujo de cierre?
6. ¿Umbral exacto de "empate" (solo primer lugar vs. cualquier posición del desglose)?
7. ¿`EstadoActa` necesita un tercer valor `fallido` para paridad con `EstadoJobCorreo`, o los
   reintentos de BullMQ son suficientes sin estado terminal visible?

## Ready for Proposal

Sí. El modelo de datos (con sus gaps identificados), los ADR relevantes (0008, 0012, 0018), el
código ya implementado de `#13`/`#16` y el PRD/TECH-DESIGN.md dan base suficiente para escribir
`proposal.md`. Las 7 preguntas de la sección 10 quedan explícitamente abiertas para que
`sdd-propose` las resuelva — varias de ellas (firmantes, empate, tercer estado de `Acta`) son
precisamente las reglas de negocio que `BACKLOG.md` exige declarar por ausencia de reglamento
previo, no bloqueos técnicos.
