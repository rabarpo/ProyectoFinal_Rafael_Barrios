# Propuesta: outbox-correo-comprobante-autenticado (Backlog #15 — Outbox de correo y comprobante autenticado)

## Intención

Hoy `VotosService.emitir()` deja el marcador `// [#15] Punto de extensión JobCorreo`
(`apps/backend/src/votos/votos.service.ts:327`) sin ninguna llamada dentro de él: ningún voto
confirmado genera todavía una fila `JobCorreo`, ningún worker envía correo de confirmación, y no
existe ningún endpoint que muestre el comprobante completo (con la elección) después de
autenticarse. El ADR-0018 declara esta ausencia una ventana temporal aceptada y con nombre — no un
defecto — pero exige que este change la cierre insertando la fila dentro de la misma transacción
del voto, nunca desde un dispatcher desacoplado. Este change entrega esa inserción, el worker de
envío por lotes con reintentos idempotentes que exige el propio texto del BACKLOG para #15, y el
enlace autenticado del ADR-0009 que hoy no existe en ningún endpoint.

## Decisiones del usuario — no negociables

Las siguientes dos decisiones fueron tomadas explícitamente por el usuario antes de escribir esta
propuesta. No son recomendaciones de `sdd-design`; son restricciones de alcance fijas.

### 1. "Mis votaciones" — alcance acotado al comprobante único, no al listado agregado

`BACKLOG.md` describe #15 textualmente como "...comprobante tras autenticarse y acceso desde 'Mis
votaciones'". El propio `design.md` de `vote-casting` (#14) había dejado esto abierto: *"Mis
votaciones es #16/#20 por decisión de la propuesta... ¿#16 se adelanta, o se acepta la brecha?"*
El usuario decide **acotar #15 al camino mínimo**: relectura autenticada de un solo comprobante
ya emitido, vía enlace directo (el mismo que el correo entrega) o una URL directa equivalente. **La
vista agregada "Mis votaciones" con todos los procesos de un usuario queda explícitamente fuera de
alcance de #15**, diferida a #16/#20. Esto **acota** el texto literal del BACKLOG, no lo
reinterpreta en silencio — `openspec/config.yaml` prohíbe contradecir una decisión previa sin
constancia, y esta sección es esa constancia.

### 2. `JobCorreo`: columnas estructuradas aditivas, no solo texto libre

El modelo `JobCorreo` actual (`asunto`/`cuerpo` de texto libre, sin `voto_id`/`proceso_id`) obliga
a que cualquier lógica de worker, dispatcher o backfill parsee texto para saber a qué voto
pertenece un job. El usuario decide agregar **columnas estructuradas aditivas y nullable**:
`voto_id`, `proceso_id`, `codigo_comprobante`. Migración aditiva (nunca reordena ni renombra
columnas existentes), coincide con el precedente de #2/#14. Esto permite que dispatcher, worker y
backfill consulten con un `JOIN` en vez de parsear `cuerpo` — el espíritu de verificabilidad que
ADR-0012 exige ("verificable con un JOIN, no con disciplina de código").

## Alcance

### Dentro de alcance

- Migración aditiva a `JobCorreo`: `voto_id` (FK nullable a `Voto`), `proceso_id` (FK nullable a
  `ProcesoElectoral`), `codigo_comprobante` (string nullable) — sin tocar columnas existentes.
- Inserción de `JobCorreo` **dentro** del `$transaction` de `VotosService.emitir()`, exactamente
  en el marcador `// [#15] Punto de extensión JobCorreo` — una llamada de insert, sin reescribir
  la transacción.
- Suite e2e que pruebe la atomicidad `Voto`+`JobCorreo` (commit juntos, rollback juntos) — la
  prueba de cierre que el propio ADR-0018 exige como condición de su cierre.
- Nuevo dispatcher/worker de outbox en `apps/worker/` (código nuevo, no basado en
  `system-ping.processor.ts`), con envío por lotes, reintentos e idempotencia por `id` de job
  (at-least-once, ADR-0012).
- Reutilización de `apps/backend/src/email/*` (`EmailSender`/`EmailModule`/
  `ConfiguracionEmailSender`) desde el lado del worker — sin modificar su contrato.
- Contenido del correo: código de comprobante, hora, enlace autenticado — **nunca la elección**
  (mismo principio de secreto del voto que #14 aplicó a auditoría).
- Endpoint nuevo (o extensión de `PapeletaService`) que exponga el comprobante completo
  (`eleccion_resumen` incluido) detrás de autenticación, para el enlace del ADR-0009.
- Página frontend nueva de comprobante autenticado, accesible por el enlace del correo y/o URL
  directa — sin listado agregado.
- Actualización de estado de ADR-0018 a "Superado por #15" (ver sección dedicada abajo).
- Decisión y plan de backfill explícito para votos confirmados sin `JobCorreo` (ver abajo).

### Fuera de alcance

- Vista agregada "Mis votaciones" con todos los procesos de un usuario — #16/#20 (ver decisión 1).
- Notificaciones no ligadas a un voto (inicio de votación, recordatorios, cierre próximo,
  publicación de resultados) — BACKLOG las asigna también a #15 en la fila "Notificaciones" (#19),
  pero esta propuesta cubre únicamente el correo de confirmación de voto ligado a la transacción
  de #14; el resto de plantillas de notificación queda para una iteración posterior si
  `sdd-design` no decide ampliar el alcance explícitamente.
- Cualquier dispatcher que lea votos confirmados desde fuera de la transacción original — vetado
  de forma permanente por ADR-0018, no es una opción de diseño disponible.
- Cambios al contrato de `EmailSender`/`EmailModule` existentes — se reutilizan tal cual.

## Cierre de ADR-0018

ADR-0018 declara su propia condición de cierre: pasa a "Superado por #15" en el momento en que #15
inserte la fila en el punto de extensión **y** exista una prueba verde que asegure que `Voto` y
`JobCorreo` nacen en la misma transacción (commit/rollback juntos). Esta propuesta adopta esa
condición literalmente como criterio de éxito. El mecanismo de cierre es una **nota de estado
añadida al propio ADR-0018** (no un ADR nuevo, no una enmienda a ADR-0006/0012): se actualiza el
campo "Estado" de `adrs/0018-ventana-temporal-jobcorreo-diferido.md` de "Aceptado — temporal y
acotado" a "Superado por #15" una vez la suite e2e de este change esté verde, sin reescribir su
contexto ni sus consecuencias — el ADR permanece como registro histórico de la decisión y su
ventana.

## Backfill

Este es un proyecto greenfield: no existe ningún voto real en producción al momento de escribir
esta propuesta (mismo precedente de rollback que #1/#2/#3/#14 ya establecieron — sin datos de
producción). **No se requiere backfill de datos reales.** No obstante, ADR-0018 exige que #15
contemple el mecanismo si llegaran a existir votos sin `JobCorreo`: este change debe incluir un
script/consulta de reconciliación (`Voto` sin fila `JobCorreo` asociada vía `voto_id`) como
utilidad disponible pero no ejecutada contra datos reales — cubre el caso de que un entorno de
staging/QA acumule votos de prueba antes de que #15 se despliegue. La columna aditiva `voto_id`
(decisión 2) es lo que hace esta reconciliación posible sin parsear texto.

## Enfoque

1. Migración Prisma aditiva a `JobCorreo` (`voto_id`, `proceso_id`, `codigo_comprobante`
   nullable).
2. Extender `VotosService.emitir()` en el marcador exacto: una llamada `tx.jobCorreo.create(...)`
   con los tres campos nuevos poblados desde el `voto` recién insertado, sin renderizar
   `asunto`/`cuerpo` completos ahí (eso lo hace el worker al despachar, con los datos ya
   estructurados disponibles vía `JOIN`).
3. Nuevo `apps/worker/src/processors/outbox-correo.processor.ts` (nombre indicativo): lee jobs
   `pendiente`, arma `asunto`/`cuerpo` con código/hora/enlace desde los campos estructurados,
   invoca `EmailSender.send()`, marca `enviado`/`fallido` con reintentos acotados, idempotente por
   `id` de job (reintentar un job ya `enviado` es un no-op seguro).
4. Endpoint autenticado nuevo para el comprobante completo (reutiliza el patrón de
   `PapeletaService`, agrega `eleccion_resumen`).
5. Página frontend del comprobante autenticado, enlazada desde el correo y accesible por URL
   directa.
6. Actualizar estado de ADR-0018 tras la suite e2e verde.

## Capabilities

### New Capabilities
- `outbox-correo`: inserción transaccional de `JobCorreo`, dispatcher/worker de envío por lotes
  con reintentos idempotentes, reutilizando `EmailSender` existente.
- `comprobante-autenticado`: endpoint y página que exponen el comprobante completo (con elección)
  solo tras autenticación, vía enlace directo a un comprobante específico.

### Modified Capabilities
- None. `envio-correo` (spec archivada bajo `configuracion-general`) excluye explícitamente
  `JobCorreo`/`Notificacion`/worker-outbox de su propio alcance; no se toca.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/prisma/schema.prisma` | Modified | Columnas aditivas nullable en `JobCorreo` |
| `apps/backend/src/votos/votos.service.ts` | Modified | Insert de `JobCorreo` en el marcador `[#15]`, dentro de la transacción existente |
| `apps/backend/src/votos/papeleta.service.ts` (o endpoint nuevo) | Modified/New | Comprobante completo post-auth con `eleccion_resumen` |
| `apps/worker/src/*` | New | Dispatcher/processor de outbox, código nuevo (no basado en `system-ping.processor.ts`) |
| `apps/backend/src/email/*` | Reused, unmodified | `EmailSender`/`EmailModule` consumidos por el worker |
| Frontend | New | Página de comprobante autenticado, sin listado agregado |
| `apps/backend/test/` | New | Suite e2e de atomicidad `Voto`+`JobCorreo` |
| `adrs/0018-ventana-temporal-jobcorreo-diferido.md` | Modified | Estado → "Superado por #15" |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Reescribir la transacción de `VotosService.emitir()` en vez de extenderla en el marcador | Baja | El insert va exactamente en el marcador existente, sin tocar los pasos anteriores |
| Dispatcher desacoplado leyendo votos post-commit (patrón vetado) | Baja | Vetado explícitamente por ADR-0018; el approach 3 de exploration.md queda descartado, no es una opción de diseño |
| Copiar `system-ping.processor.ts` como base del outbox | Media | Su propio comentario lo prohíbe explícitamente y prohíbe importar `PrismaClient`; el nuevo processor se escribe desde cero |
| Fuga de la elección en el contenido del correo | Baja | Mismo principio de secreto del voto que #14 aplicó en auditoría; se verifica en pruebas del contenido del correo, no solo por diseño |
| Entrega no idempotente del worker (reenvío duplicado) | Media | ADR-0012 exige at-least-once; el processor debe ser idempotente por `id` de job, con prueba explícita |
| Migración aditiva a `JobCorreo` reabre superficie de schema que #2/#14 trataban como cerrada | Baja | Aditiva y nullable, sin reordenar/renombrar columnas existentes |
| Confusión de alcance "Mis votaciones" si un futuro change no lee esta propuesta | Media | Declarado explícitamente arriba como decisión del usuario, no silenciosa |

## Rollback Plan

Greenfield, sin votos reales en producción (ver "Backfill"). Migración aditiva/nullable: revertir
con `prisma migrate` down o un `git revert` del PR de schema no deja columnas huérfanas obligadas.
Si el worker resulta inviable en producción, se puede deshabilitar el dispatcher (dejar de
consumir la cola) sin afectar la transacción de voto — `JobCorreo` seguiría insertándose,
simplemente sin procesarse hasta que el worker se re-habilite; ningún voto se pierde ni se
revierte.

## Dependencies

- `#14` (`vote-casting`) debe estar entregado: el marcador `[#15]` y la transacción que lo rodea
  ya existen en `apps/backend/src/votos/votos.service.ts`.
- `apps/backend/src/email/*` y `apps/worker/` (andamiaje BullMQ+ioredis) ya existen y se reutilizan
  tal cual.

## Success Criteria

- [ ] Un `Voto` y su `JobCorreo` se confirman en la misma transacción; una prueba e2e verifica
      commit conjunto y rollback conjunto
- [ ] ADR-0018 pasa a estado "Superado por #15" tras esa prueba estar verde
- [ ] El worker envía por lotes, reintenta con acotación, y es idempotente por `id` de job
- [ ] Ningún correo enviado revela la elección del votante — solo código, hora y enlace
- [ ] Existe un endpoint autenticado que devuelve el comprobante completo (con `eleccion_resumen`)
      para un `voto_id`/código específico
- [ ] El acceso al comprobante es por enlace directo/URL directa; no existe listado agregado de
      "Mis votaciones" en el alcance de este change
- [ ] La migración a `JobCorreo` es aditiva y nullable; ninguna columna existente cambia de nombre
      o posición
- [ ] Existe un mecanismo de reconciliación (`Voto` sin `JobCorreo`) disponible, aunque no se
      ejecute contra datos reales por tratarse de un proyecto greenfield

## Proposal question round

Las dos decisiones que normalmente requerirían una ronda de preguntas (alcance de "Mis
votaciones", forma del schema de `JobCorreo`) ya fueron resueltas explícitamente por el usuario
antes de escribir esta propuesta (ver "Decisiones del usuario" arriba). No se abre una ronda de
preguntas adicional en esta fase. Queda abierta para `sdd-design`: si las "Notificaciones" de la
fila #19 del BACKLOG (inicio de votación, recordatorios, cierre próximo, publicación de
resultados) se cubren en este change o se difieren — esta propuesta las difiere por defecto (ver
"Fuera de alcance"); el usuario puede corregirlo si prefiere ampliarlas ahora.
