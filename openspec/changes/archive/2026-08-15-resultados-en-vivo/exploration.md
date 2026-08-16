# Exploración: Resultados en vivo (Backlog #16)

## Estado del backlog y contexto de dependencias

`#16` depende de `#14` (Emisión del voto en 3 pasos), ya implementado y archivado en
`openspec/changes/archive/2026-08-14-vote-casting/`. `#13` (Apertura del proceso y congelamiento
del padrón), del que `#16` también depende conceptualmente (aunque el backlog solo declara `#14`
como dependencia formal), también está implementado y archivado en
`openspec/changes/archive/2026-08-14-apertura-proceso-congelamiento-padron/`. El repo tiene código
real hasta `#15` (outbox de correo + comprobante autenticado, PR1-PR5 según los commits recientes).
Esta exploración se apoya en el modelo de datos y los patrones YA implementados, no en supuestos
del PRD/TDD.

## Fuentes leídas

`BACKLOG.md` (fila #16 y sección "Ausencia de reglamento previo" — no aplica a `#16`, esa sección
solo cubre `#11/#13/#17/#22`), `PRD.md` (criterio de éxito 9 "Resultados en tiempo real" y sección
de casos borde), `TECH-DESIGN.md` (Flujo 4 "Resultados, escrutinio y actas"), `adrs/0005-estado-y-tiempo-real-polling.md`,
`adrs/0008-reglas-operativas-jornada.md`, `apps/backend/prisma/schema.prisma`,
`openspec/changes/archive/2026-08-14-apertura-proceso-congelamiento-padron/specs/electoral-process-management/spec.md`,
`openspec/changes/archive/2026-08-14-vote-casting/specs/vote-casting/spec.md`,
`apps/backend/src/procesos/procesos.controller.ts`, `apps/backend/src/votos/votos.controller.ts`,
`apps/backend/src/votos/comprobante.service.ts`, `apps/backend/src/votos/dto/comprobante.dto.ts`,
`apps/backend/src/auth/roles.decorator.ts`, `apps/backend/src/procesos/dto/padron-respuesta.dto.ts`,
`apps/backend/src/candidatos/{opciones,listas,candidatos}.service.ts` (patrón de `count()` sobre `Voto`),
`apps/frontend/src/procesos/usePadronEnVivo.ts`, `apps/frontend/package.json`, `openspec/config.yaml`.

---

## 1. Modelo de datos investigado (ya implementado, sin cambios de schema previstos)

De `apps/backend/prisma/schema.prisma`:

- **`ProcesoElectoral.ocultar_resultados`** (`Boolean @default(false)`) — según el delta spec de
  `#13` ("`ocultar_resultados` inmutable una vez `abierto`"), este campo queda congelado en el
  momento de la apertura y ningún endpoint puede modificarlo mientras `estado != borrador`. Es el
  interruptor que `#16` debe leer y respetar en el servidor.
- **`DerechoVoto`** (`proceso_id`, `usuario_id`, `en_calidad_de`, `aula_snapshot`,
  `@@unique([proceso_id, usuario_id, en_calidad_de])`) — es el padrón **congelado** materializado
  al abrir el proceso (`#13`). Es la base correcta para calcular participación/abstención: el
  denominador de "% participación" MUST ser `count(DerechoVoto)` para ese proceso, no una
  re-consulta en vivo de `Matricula`/`Usuario` (esos cambian después de la apertura y no deben
  afectar cifras ya congeladas — PRD, caso borde "Cambios de aula o sección después de generado el
  padrón").
- **`Voto`** (`lista_id`, `opcion_id`, `candidato_id`, `blanco`, `hora_servidor
  @default(now()) @db.Timestamptz(3)`) — exactamente una elección no-nula por fila (CHECK SQL) o
  `blanco = true` con las tres en `null`. No existen votos nulos por diseño (ADR-0008: la boleta
  digital no admite marcas inválidas; la columna "nulos" en actas/reportes es siempre 0 con nota
  explicativa). El signo de "abstención" para `#16` es aritmético: `abstenciones = count(DerechoVoto)
  - count(Voto)` para ese proceso (participación = `count(Voto)`).
- **Roles** (`enum RolUsuario`): `estudiante | docente | comite | administrador | director`. No
  existe un rol `padre` separado — un padre vota con la cuenta `Usuario` de su propio hijo/a, con
  `DerechoVoto.en_calidad_de = 'padre'` (patrón de doble derecho de `#13`, alcance `comunidad`).
  Esto es relevante para la pregunta de "quién ve resultados": no hay una audiencia "padres" que
  distinguir a nivel de rol de sistema, solo a nivel de `en_calidad_de` del derecho de voto.
- **`Candidato.estado` / `Lista.estado`** (`EstadoParticipacion: activo | baja`) — un candidato/lista
  dado de baja conserva sus votos ya emitidos (comportamiento ya cubierto por `#12`/`#17`, no por
  `#16`); si `#16` desglosa por candidato, debe decidir si incluye o excluye candidatos en `baja`
  del desglose en vivo (probablemente los incluye, ya que sus votos ya emitidos siguen contando —
  a confirmar en `sdd-propose`).

## 2. ADR-0005 (Estado y tiempo real por polling) — decisiones vinculantes

- **Toda la verdad vive en el servidor**: el frontend no calcula ni decide visibilidad; solo
  refleja lo que el backend responde.
- **TanStack Query (React Query)** gestiona el estado del servidor en el frontend — decisión ya
  tomada, pero **todavía no implementada en ningún lugar del repo** (ver sección 4, "Sorpresa de
  dependencias faltantes").
- **Polling cada 10-30 segundos** (intervalo configurable por vista) para resultados, panel de
  jornada y modo proyección — es la definición operativa de "tiempo real" que adopta el ADR frente
  al PRD.
- **La hora del servidor viaja en cada respuesta** de estos endpoints; el cliente corrige el
  desfase local contra ella, nunca decide validez de tiempo por su cuenta.
- **La visibilidad se evalúa en el servidor**: si `ocultar_resultados = true`, el endpoint devuelve
  solo participación, **nunca** conteos por candidato/lista/opción — ocultar solo en el cliente
  sería trivial de eludir (inspeccionar la respuesta de red).
- **Costo real declarado por el propio ADR**: en la publicación de resultados al cierre, la
  audiencia deja de ser pequeña (comité + proyección) — los ~1,000 votantes con la app abierta
  consultan el mismo endpoint. El ADR exige **caché corta en el servidor (5-10 s)** para que esa
  ráfaga cueste una consulta a la base, no mil. El mecanismo concreto (in-memory, Redis, cabeceras
  HTTP) **no está especificado** — queda como decisión abierta.
- Alternativas descartadas explícitamente por el ADR: SSE y WebSockets — ambas por complejidad de
  infraestructura desproporcionada frente a una audiencia pequeña que solo lee.

## 3. ADR-0008 (Reglas operativas de la jornada) — decisiones vinculantes

- **Visibilidad de resultados bloqueada al abrir el proceso**: la configuración "ocultar resultados
  hasta el cierre" (activa por defecto) se congela junto con el padrón en la apertura. Durante la
  jornada, **nadie — ni el comité —** puede cambiarla; solo es editable en procesos aún en
  `borrador`. Esto ya está implementado y verificado por `#13` (spec: "`ocultar_resultados`
  inmutable una vez `abierto`"), por lo que `#16` solo necesita **leer** el campo, no protegerlo.
- **No existe voto nulo, solo voto en blanco explícito**: los reportes/actas muestran la columna de
  nulos siempre en 0. `#16` debe reflejar esto en cualquier desglose que exponga (participación =
  votos con elección + votos en blanco; nulos = 0 siempre, sin necesidad de calcularlo).
- **Desbloqueo por doble vía** — no aplica directamente a `#16`, mencionado en el backlog por
  arrastre de la cita ADR pero sin relación funcional con resultados.

## 4. Patrones existentes reutilizables

- **Guard de solo-autenticación (sin restricción de rol)**: `apps/backend/src/votos/votos.controller.ts`
  usa `@UseGuards(AuthGuard)` únicamente, sin `@Roles()`. `apps/backend/src/auth/roles.decorator.ts`
  confirma explícitamente: "ausencia de `@Roles()` en una ruta significa 'sin restricción de rol'
  (D8)". Este es el patrón a seguir si la audiencia de resultados es amplia (ver sección 5).
- **Guard de rol específico (comité/admin/director)**: `apps/backend/src/procesos/procesos.controller.ts`
  usa `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('administrador', 'director', 'comite')` a nivel
  de clase — todo el controlador de procesos (incluida la apertura) está gateado a esos tres roles.
- **Lectura autenticada con autorización por pertenencia, no por secreto de URL**:
  `apps/backend/src/votos/comprobante.service.ts` (`GET /votos/comprobante/:votoId`) — el `id` en
  la URL es opaco (`Voto.id`, no el `codigo_comprobante` legible), y la autorización se resuelve
  comparando `voto.derechoVoto.usuario_id === sesion.userId` dentro del servicio, con `403`
  idéntico para "ajeno" e "inexistente" (sin oráculo). Relevante como precedente de diseño, aunque
  `#16` probablemente no necesite ownership por fila individual (es un agregado del proceso, no de
  un voto propio).
- **Patrón de "hora del servidor en cada respuesta"**: `ComprobanteDto.hora_servidor: string` (ISO),
  sellada en el backend con `voto.hora_servidor.toISOString()` — el DTO expone la hora ya como
  string ISO, sellada por Postgres (`now()`/`clock_timestamp()`), nunca `Date.now()` de Node. Este
  es el precedente literal para el requisito "hora del servidor en cada respuesta" del ítem #16 —
  no hace falta inventar un mecanismo nuevo, solo replicar el campo en el DTO de resultados.
- **Patrón de agregación en vivo con `count()`/`groupBy()`** (no hay tablas de agregados
  materializados en todo el repo):
  - `apps/backend/src/procesos/padron.service.ts` — `matricula.groupBy()` para el padrón en vivo del
    asistente de `#11`.
  - `apps/backend/src/procesos/procesos.service.ts` — `tx.derechoVoto.count({ where: { proceso_id,
    en_calidad_de } })` para los conteos de la respuesta de apertura.
  - `apps/backend/src/candidatos/opciones.service.ts` / `listas.service.ts` / `candidatos.service.ts`
    — `tx.voto.count({ where: { opcion_id / lista_id / candidato_id: id } })`, usado hoy como
    guard de borrado ("no se puede eliminar una entidad con votos asociados"), pero es exactamente
    la forma de consulta que un desglose de resultados por candidato/lista/opción necesitaría
    reutilizar.
- **Frontend "en vivo" existente — NO usa React Query**: `apps/frontend/src/procesos/usePadronEnVivo.ts`
  implementa polling/actualización a mano con `useEffect` + `AbortController` propio + número de
  secuencia creciente (para descartar respuestas fuera de orden) + debounce de 300 ms. Es un patrón
  deliberado y bien documentado, pero **diverge de la decisión de ADR-0005** de usar TanStack Query.

## 5. Hallazgo de TECH-DESIGN.md — quién ve resultados en vivo

TECH-DESIGN.md, "Flujo 4 — Resultados, escrutinio y actas", primer criterio de aceptación (línea
186-187):

> Con resultados ocultos, el endpoint de resultados devuelve solo participación — nunca conteos por
> candidato — **para cualquier rol de votante**; el comité ve el estado "ocultos".

Esto es una fuente de negocio **explícita y autoritativa** que resuelve una ambigüedad que
`BACKLOG.md` por sí solo no despeja: la fila de `#16` en el backlog no dice quién puede consultar
resultados, y una lectura superficial podría asumir "solo comité/administración" (como el resto de
endpoints de `procesos/`, gateados por rol). TECH-DESIGN.md dice lo contrario: **cualquier rol de
votante autenticado** (estudiante, docente, y por extensión cualquier cuenta con `DerechoVoto`) ve
al menos la participación, y el comité ve además un indicador explícito de que los resultados están
ocultos (no un dato adicional de conteo, solo el estado). Esto alinea con el patrón de guard
`AuthGuard`-only ya usado en `votos.controller.ts`, no con el patrón `@Roles('administrador',
'director', 'comite')` de `procesos.controller.ts`.

**Consecuencia para `sdd-propose`**: el endpoint de resultados probablemente NO debe vivir bajo el
mismo guard de clase que el resto de `procesos.controller.ts` (que es rol-restringido); necesita su
propio guard más permisivo, igual que `votos.controller.ts`.

## 6. Sorpresa — dependencias de frontend que ADR-0005 da por decididas pero no están instaladas

Revisé `apps/frontend/package.json` y busqué `tanstack|react-query|recharts|chart.js|victory|nivo`
en todo `**/package.json` del monorepo: **cero resultados**. Es decir:

- **`@tanstack/react-query` no está instalado en ningún workspace**, pese a que ADR-0005 lo declara
  como la decisión tomada para gestión de estado del servidor en el frontend.
- **Ninguna librería de gráficos de barras/pastel está instalada** (el ítem #16 pide explícitamente
  "gráficos de barras y pastel"), ni elegida en ningún ADR — no hay decisión previa que citar.
- El único hook "en vivo" existente (`usePadronEnVivo.ts`) evita deliberadamente React Query con un
  patrón manual bien documentado y con tests propios (asumo, no verificado en detalle en esta
  exploración).

**Esto significa que `#16` sería el primer change en introducir React Query y una librería de
gráficos como dependencias nuevas del frontend** — un costo de alcance real, no una simple
reutilización de patrón existente. `sdd-propose`/`sdd-tasks` deben dimensionarlo explícitamente
(instalación, configuración de `QueryClientProvider`, elección de librería de gráficos) en vez de
asumir que ya existe la base.

## 7. Approaches (comparación para sdd-propose)

| Enfoque | Descripción | Pros | Contras | Esfuerzo |
|---|---|---|---|---|
| **A. Endpoint nuevo bajo `procesos/`, `AuthGuard`-only** | `GET /procesos/:id/resultados`, servicio calcula tallies con `count()`/`groupBy()` sobre `Voto`, respeta `ocultar_resultados`, siempre incluye `hora_servidor` | Coincide con TECH-DESIGN.md Flujo 4 al pie de la letra; reutiliza el patrón `count()` ya usado en 3 servicios distintos; sin cambio de schema | El `groupBy` en vivo sobre `Voto` en el pico de cierre (~1000 votantes) puede competir con la escritura de votos — el ADR-0005 ya lo advierte y exige caché corta no diseñada aún | Medio (backend) + Medio (frontend: primera integración real de React Query + librería de gráficos) |
| **B. Endpoint bajo `votos/`** | Mismo cálculo, pero ubicado junto a `votos.controller.ts` por cercanía a la semántica del secreto del voto | Mantiene cerca la lógica sensible a secreto (`candidato_id`/`opcion_id` nunca en auditoría) | `ocultar_resultados` es un campo de `ProcesoElectoral`, no de `Voto` — separar el dominio de "resultados" de `procesos/` (dueño natural del flag) agrega acoplamiento cruzado sin beneficio claro | Similar a A, peor cohesión |
| **C. Tabla de agregados pre-materializada, refrescada por worker** | Un resumen persistido y actualizado por el worker (patrón similar a `JobCorreo` de #15) en vez de `count()`/`groupBy()` por request | Elimina carga de lectura sobre `Voto` en cada poll | Contradice ADR-0005 explícitamente (rechaza SSE/WebSockets/pre-agregación a favor de "toda la verdad vive en el servidor" + caché corta, no una tabla materializada); introduce staleness y un nuevo modo de falla (retraso del worker) no pedido por el ADR ni el PRD; sobre-ingeniería para ~1000 votantes concurrentes según el propio análisis de costo del ADR | Alto, y probablemente rechazado en `sdd-design` por contradecir ADR-0005 |

## 8. Recomendación

**Enfoque A** — endpoint nuevo (`GET /procesos/:id/resultados` o similar) bajo el módulo `procesos/`
(o un módulo hermano `resultados/` dentro del mismo dominio que ya posee `ocultar_resultados`), con
`@UseGuards(AuthGuard)` solamente (sin `@Roles()`), reutilizando el idioma de agregación `count()`/
`groupBy()` ya establecido en `padron.service.ts`/`procesos.service.ts`/`opciones.service.ts`. Es el
cambio más pequeño consistente con el rechazo explícito de ADR-0005 a push/pre-agregación, y con el
criterio de aceptación literal de TECH-DESIGN.md Flujo 4. El trabajo de frontend (introducir React
Query + librería de gráficos) es un costo real y separado que `sdd-propose`/`sdd-design` deben
dimensionar explícitamente — no es "reusar el patrón de `usePadronEnVivo.ts`", porque ese hook evita
deliberadamente React Query.

## 9. Riesgos

- **Mecanismo de caché de ADR-0005 sin resolver**: el ADR exige caché corta (5-10 s) para el pico de
  lectura en el cierre, pero no especifica el mecanismo (in-memory, Redis, cabeceras HTTP). Requiere
  una decisión de diseño explícita, no un supuesto.
- **Semántica de visibilidad sin resolver en detalle**: qué incluye exactamente "ocultos ⇒ solo
  participación" — ¿total de votos emitidos vs. padrón, sin desglose alguno por aula/candidato/
  opción? ¿El desglose por aula podría filtrar indirectamente preferencia en aulas pequeñas incluso
  sin nombrar candidatos? TECH-DESIGN.md solo dice "nunca conteos por candidato", sin detallar el
  resto de la forma de la respuesta.
- **Conflicto aparente de alcance de audiencia**: `BACKLOG.md` por sí solo podría leerse como
  "resultados para comité", pero TECH-DESIGN.md Flujo 4 dice explícitamente "para cualquier rol de
  votante" con el comité viendo además el estado "ocultos". Tomé TECH-DESIGN.md como fuente
  autoritativa (es el criterio de aceptación literal), pero `sdd-propose` debe declararlo
  explícitamente, no dejarlo implícito.
- **Dependencias de frontend nuevas sin acotar**: `@tanstack/react-query` y una librería de gráficos
  no están instaladas ni elegidas — alcance abierto hasta que se elija una librería concreta.
  Recomiendo señalar esto como punto de decisión explícito en `sdd-propose`.
- **Base de porcentajes/abstención**: debe calcularse contra `DerechoVoto` (padrón congelado por
  `#13`), nunca contra `Matricula`/`Usuario` en vivo — esto ya está establecido por `#13` y solo
  necesita respetarse, no re-derivarse.
- **Empate/candidato de baja son de `#17`, no de `#16`**: `#16` es la vista en vivo del proceso
  **abierto**; el cálculo final/definitivo, empates y actas son responsabilidad de `#17` (Cierre,
  escrutinio y actas). `sdd-propose` debe declarar explícitamente que `#16` cubre solo el polling en
  vivo durante la jornada, aunque la misma lógica de consulta probablemente se reutilice después del
  cierre (punto a considerar para reutilización en el diseño).

## 10. Preguntas abiertas para sdd-propose

1. **Forma exacta de "solo participación" cuando está oculto**: ¿total de votos emitidos vs. padrón
   únicamente, sin ningún desglose por aula/candidato/opción?
2. **Confirmar la audiencia amplia de TECH-DESIGN.md** ("cualquier rol de votante", `AuthGuard`-only)
   sobre la lectura ambigua de `BACKLOG.md` — ¿el comité recibe un campo adicional en la misma
   respuesta, o un endpoint distinto?
3. **Mecanismo de caché en el servidor** para la ráfaga de lectura al cierre (ADR-0005) — ¿TTL en
   memoria, Redis, cabeceras HTTP de caché? Necesita decisión explícita, no un supuesto implícito.
4. **Elección de librería de gráficos** para el frontend (ninguna instalada hoy) — ¿se decide ahora
   en `sdd-propose`/`sdd-design`, o se deja como spike previo?
5. **¿Se migra `usePadronEnVivo.ts` a React Query en este mismo change, o `#16` es el único
   consumidor nuevo de la dependencia por ahora?** (Recomendación: dejar `usePadronEnVivo.ts` intacto
   — no tocar código de `#11` ya funcionando sin necesidad directa.)

## Ready for Proposal

Sí. El modelo de datos, los ADR y el TECH-DESIGN.md dan base suficiente para escribir `proposal.md`.
Las 5 preguntas de la sección 10 quedan explícitamente abiertas para que `sdd-propose` las resuelva,
no para bloquear el arranque de esa fase.
