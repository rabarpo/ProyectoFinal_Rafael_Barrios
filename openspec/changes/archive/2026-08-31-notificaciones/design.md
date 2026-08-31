# Diseño: notificaciones (Backlog #19 — Notificaciones y avisos)

## Enfoque técnico

Cuatro piezas, en el orden en que deben existir:

1. **Una migración sobre `Notificacion` y `JobCorreo`.** `Notificacion` gana el eje que hoy no
   tiene (`proceso_id`, `evento`, `usuario_id`) más el contenido de bandeja (`titulo`, `cuerpo`,
   `leido_en`), `job_correo_id` pasa a nullable y aparece el índice único que hace idempotente el
   sweep (D2). `JobCorreo` gana una columna discriminante `origen` sin la cual la "cola dedicada"
   de la propuesta **no aísla nada** (D3, contradicción C5).
2. **Un emisor único `emitirNotificaciones(tx, …)`** (D4): función libre sobre
   `Prisma.TransactionClient` — idioma de `materializarDerechosVoto()` y `escrutinio.ts` — que
   inserta `Notificacion` + `JobCorreo` + auditoría agregada. La usan **los tres** llamadores
   (apertura, cierre y sweep del worker), así que la semántica de deduplicación es literalmente la
   misma en los tres, no "la misma por convención".
3. **Dos llamadas de una línea** en `ProcesosService.abrir()` y `ProcesosService.cerrar()` (D5),
   en el punto exacto que ya usó `#15` para el voto: justo después del `auditoria.log(...)` y antes
   del `return` del callback de `$transaction`.
4. **Un sweep y un despachador en el worker** (D6/D7), con cola propia `notificaciones` que reusa
   **sin modificar** el processor de correo de `#15` (`procesarCorreoComprobante`) con un repo
   distinto.

Sin frontend en este change: la propuesta no lista un solo archivo de `apps/frontend` en "Affected
Areas" y la bandeja visible se defiere igual que `#17`→`#26-29`.

## Contradicciones detectadas y corregidas

Verificadas leyendo el código, no asumidas. Cada una se resuelve en la decisión indicada.

| # | Dice la propuesta / spec | Dice el código real | Corrección |
|---|---|---|---|
| C1 | Hooks en `src/procesos/apertura.ts` y `src/procesos/escrutinio.ts` | **No existe `apertura.ts`**. `escrutinio.ts` **sí** existe pero es el módulo de cálculo del escrutinio (`#17` D5), no un hook de cierre. `abrir()` (línea 634) y `cerrar()` (línea 720) son **métodos del mismo archivo** `procesos.service.ts` | D5 fija los dos puntos reales |
| C2 | "dispatcher reactivo vetado por ADR-0018" | ADR-0018 está en estado **"Superado por #15"** y su veto §2 es específico: prohíbe un mecanismo que **lea votos ya confirmados** desde fuera de la transacción del voto (hallazgo A1). Un sweep sobre `ProcesoElectoral.estado` no reproduce A1 | D1: la regla viva es **ADR-0012** (outbox en Postgres, el backend nunca encola) + ADR-0006 §3; el sweep de recordatorios no cae bajo el veto y los hooks siguen siendo transaccionales igual |
| C3 | Constraint de unicidad `(proceso_id, tipo_notificacion)` | `TipoNotificacion` es el enum de **canal** (`correo`), no de evento; y `Notificacion` **no tiene `proceso_id`** | D2: enum nuevo `EventoNotificacion` + columnas `proceso_id`/`evento`; `tipo` se conserva como canal |
| C4 | El sweep crea "como máximo una notificación de recordatorio **por proceso**" | Con `usuario_id` FK requerida, una fila por proceso no puede estar en la bandeja de nadie | D2: la clave de dedup es `(proceso_id, evento, usuario_id)`; "una por proceso" se lee como "una por proceso, evento y usuario" |
| C5 | `apps/worker/src/outbox/*` → "Reused (**no modificado**)" | `PrismaOutboxCorreoRepo.pendientes()` barre `JobCorreo WHERE estado='pendiente'` **sin filtro**: una ráfaga de recordatorios entraría igual a la cola `correo` y el escenario de aislamiento de la spec **fallaría** | D3: columna `JobCorreo.origen` + índices parciales; `outbox-correo.repo.ts` **sí** se modifica (una cláusula) |
| C6 | "`Notificacion` ya validada por `#15`" (implícito) | **Cero escritores** de `Notificacion` en todo el repo (`#15` sólo escribe `JobCorreo`); la tabla está vacía en todos los entornos | D2: `ADD COLUMN … NOT NULL` sin `DEFAULT` es seguro, sin backfill |
| C7 | `404` **o** `403` para notificación ajena (spec lo deja abierto) | `ComprobanteService`, `PapeletaService` y `VotosService` (`#14` D9/D13) responden **`403` idéntico para recurso ajeno e inexistente**, sin cuerpo discriminante | D9: `403` para ambos casos. Un `404` para inexistente + `403` para ajeno **sería** el oráculo que la spec quiere evitar |
| C8 | Plantillas parametrizadas por "(usuario, proceso, tipo)" | `construirCorreoComprobante()` de `#15` **no** recibe al usuario | D8: las plantillas no reciben usuario — cero PII en `JobCorreo.cuerpo` y una sola invocación por `(proceso, evento)` en vez de N |

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Marco normativo del change | **ADR-0012** (patrón outbox en Postgres; el backend nunca encola) como regla viva. Los hooks de inicio/resultados van **dentro** de la transacción existente; el sweep de recordatorio/cierre próximo es un poller del worker, igual que `outbox`/`actas`/`reportes` | Citar ADR-0018 como veto vigente (lo hacen propuesta y spec); proponer un ADR nuevo para habilitar el sweep | ADR-0018 está **superado por `#15`** y su veto es de alcance quirúrgico: prohíbe recuperar por barrido el `JobCorreo` de un voto **ya confirmado**, porque eso deja una ventana en la que un voto no tiene job y nada lo detecta (hallazgo A1). El sweep de `#19` no notifica un hecho ya commiteado que debió notificarse atómicamente: notifica el **paso del tiempo**, que ninguna transacción de negocio puede haber capturado. No hace falta ADR nuevo: no se contradice ninguno |
| D2 | Migración de `Notificacion` — columnas exactas y orden | Archivo único `prisma/migrations/20260825010000_notificacion_bandeja_interna/migration.sql`, **DDL puro**, en este orden: (1) `ALTER TYPE "TipoNotificacion" ADD VALUE 'interna'`; (2) `CREATE TYPE "EventoNotificacion" AS ENUM ('inicio_votacion','recordatorio','cierre_proximo','resultados')`; (3) `ALTER TABLE "Notificacion" ALTER COLUMN "job_correo_id" DROP NOT NULL`; (4) `ADD COLUMN "usuario_id" UUID NOT NULL`, `"proceso_id" UUID`, `"evento" "EventoNotificacion" NOT NULL`, `"titulo" TEXT NOT NULL`, `"cuerpo" TEXT NOT NULL`, `"leido_en" TIMESTAMPTZ(3)`; (5) las dos FK `Restrict`; (6) `CREATE UNIQUE INDEX "Notificacion_proceso_id_evento_usuario_id_key"`; (7) `CREATE INDEX "Notificacion_usuario_id_creado_en_idx" ON "Notificacion"("usuario_id","creado_en" DESC)` | Recrear `TipoNotificacion` (`CREATE TYPE`+`ALTER COLUMN`+`DROP TYPE`); partir la migración en dos archivos "por el gotcha del enum"; columnas nullable con backfill; `evento` como `TEXT` | **El gotcha se verificó y no muerde acá.** Prisma envuelve cada archivo en una transacción y PG16 admite `ALTER TYPE … ADD VALUE` dentro de ella; lo que **no** admite es *usar* ese valor en la misma transacción — y este archivo no lleva ningún `INSERT`/`UPDATE`/`DEFAULT`/`CHECK` que mencione `'interna'`. La excepción documentada de Postgres (un tipo **creado** en la misma transacción sí puede usar sus valores) es lo que habilita el paso (2) junto con los índices parciales de D3. `NOT NULL` sin `DEFAULT` es seguro porque `Notificacion` tiene **cero escritores** en todo el repo (C6, verificado): está vacía y no hay filas que violar. `proceso_id` queda **nullable a propósito**: Postgres trata los `NULL` como distintos en un índice único, así que una notificación futura no ligada a un proceso jamás colisiona con la clave de dedup, sin necesidad de un índice parcial. `evento` como enum y no `TEXT` porque es un dominio cerrado de 4 valores que el motor debe defender. **Regla que queda escrita:** cualquier migración futura que necesite *escribir* `'interna'` debe ir en un archivo distinto |
| D3 | Aislamiento real de la cola `notificaciones` | Columna nueva `JobCorreo.origen` (`CREATE TYPE "OrigenJobCorreo" AS ENUM ('comprobante','notificacion')`, `NOT NULL DEFAULT 'comprobante'`) + **dos índices parciales**: `JobCorreo_pendiente_comprobante_idx ON ("creado_en") WHERE estado='pendiente' AND origen='comprobante'` y su gemelo `…_notificacion_idx`. `PrismaOutboxCorreoRepo.pendientes()` suma `origen:'comprobante'` | Dejar `JobCorreo` intacto y confiar sólo en la cola nueva (lo que dice la propuesta); discriminar por `voto_id IS NULL`; tabla `JobNotificacion` separada | Sin discriminante la cola nueva es **decorativa**: el despachador de `#15` seguiría llevándose los recordatorios a la cola `correo` y el escenario "una ráfaga de recordatorios no retrasa comprobantes" de la spec fallaría en el primer intento (C5). `voto_id IS NULL` funcionaría hoy por accidente, pero convierte una ausencia en un significado: el primer `JobCorreo` futuro sin voto (recuperación de contraseña, aviso administrativo) se enrutaría solo a `notificaciones`. Los índices **parciales** —no un `(estado, origen, creado_en)` completo— son la pieza que hace el aislamiento real y no sólo lógico: con 50 000 recordatorios pendientes, el despachador de comprobantes recorre un índice que **no los contiene**, en vez de descartarlos uno por uno. El `DEFAULT 'comprobante'` clasifica correctamente todas las filas existentes sin backfill |
| D4 | Puerto hacia `JobCorreo`: emisor único compartido | `apps/backend/src/notificaciones/emitir-notificaciones.ts`, **función libre** `emitirNotificaciones(tx, params)`. El worker la importa como `@seei/backend/dist/notificaciones/emitir-notificaciones` | Un `NotificacionesEmitter` inyectable en Nest; duplicar la lógica de inserción en el worker (precedente de `#17` D10, "el duplicado explícito es más barato") | Función libre y no provider porque **el llamador no está sólo en Nest**: el sweep vive en el worker y no puede importar el contenedor de DI. El precedente de importación cruzada ya existe y está en producción: `apps/worker/src/outbox/email-sender.factory.ts` importa `@seei/backend/dist/email/*` y `@seei/worker` declara `"@seei/backend": "workspace:*"`. Acá **no** se duplica —al revés que en `#17`— porque lo duplicado sería precisamente el `ON CONFLICT DO NOTHING` que sostiene el requisito de idempotencia: dos copias que puedan divergir en la cláusula de conflicto son dos formas distintas de duplicar correos, y el requisito no admite eso. Se prueba con un doble de `tx`, sin levantar Nest |
| D5 | Los dos hooks transaccionales — ubicación exacta | **Ambos en `apps/backend/src/procesos/procesos.service.ts`** (C1). `abrir()`: tras `auditoria.log(tx, PROCESO_ABIERTO, …)` y antes de `return respuestaApertura(…)` — sólo en la rama de transición real, **nunca** en el no-op idempotente. `cerrar()`: tras `auditoria.log(tx, PROCESO_CERRADO, …)` y antes del `return`, con el mismo criterio. `abrir()` suma `nombre, fecha_cierre_prevista` a su cláusula `RETURNING`; `cerrar()` ya devuelve `nombre` y no necesita más | Un método nuevo `notificarApertura()` llamado después del commit; un hook genérico sobre transiciones de estado; emitir también en el no-op | Es el punto de extensión literal que `#15` usó para el voto y que ADR-0012 exige: la fila nace **con** la transición o no nace. El no-op idempotente queda excluido en el código *y* en el motor: el índice único de D2 haría `DO NOTHING` de todos modos, así que el doble cierre de la spec no puede duplicar aunque alguien mueva la llamada. Los destinatarios se releen con `SELECT DISTINCT usuario_id FROM "DerechoVoto" WHERE proceso_id = $1` dentro de la misma `tx` en vez de cambiar la firma de `materializarDerechosVoto()`: el `DISTINCT` es obligatorio porque en alcance `comunidad` una cuenta tiene **dos** `DerechoVoto` (estudiante + padre, `@@unique([proceso_id, usuario_id, en_calidad_de])`) y sin él la misma persona recibiría dos correos idénticos |
| D6 | Estructura del sweep periódico | `apps/worker/src/notificaciones/sweep-notificaciones.ts`: decisión **pura** `barrerNotificaciones(repo, umbrales, ahora)` sobre el puerto `SweepRepo`; adaptador Prisma en `sweep.repo.ts`. Para cada proceso `abierto`, `restante = fecha_cierre_prevista − ahora`; si `0 < restante ≤ recordatorio_horas` ⇒ `recordatorio`; si `0 < restante ≤ cierre_proximo_horas` ⇒ `cierre_proximo`. `restante ≤ 0` ⇒ ninguno. Destinatarios: habilitados **sin voto** (`NOT EXISTS` sobre `Voto`) | Jobs diferidos de BullMQ (descartado en la ronda de preguntas de la propuesta); un cron externo; notificar a todos los habilitados y no sólo a los pendientes; reloj tomado dentro de la función | Los dos umbrales se evalúan **independientemente** en el mismo barrido: el escenario "proceso dentro de ambos umbrales" de la spec exige que se cree una de cada tipo, no que el más urgente cancele al otro. `restante ≤ 0` no emite nada: un proceso vencido y aún abierto es un problema del comité, y un "te queda poco tiempo" con tiempo negativo es ruido que además se repetiría en cada barrido. La función es pura y recibe `ahora` por parámetro —nunca `new Date()` adentro— para que los seis casos de borde se prueben sin relojes falsos, igual que `actas-contenido.ts` de `#17`. El filtro `NOT EXISTS` sobre `Voto` lee **existencia**, jamás la elección: es exactamente lo que `#14` ya consulta para rechazar un voto repetido, no conocimiento nuevo |
| D7 | Cola `notificaciones`: configuración y processor | `NOTIFICACIONES_QUEUE_NAME = 'notificaciones'`, job `notificacion.correo`, `jobId: 'notificacion:'+id`, `attempts: 5`, `backoff: { exponential, 2000 }`, `concurrency` **por defecto (1)**. Processor: **se reusa `procesarCorreoComprobante` tal cual**, con `PrismaNotificacionesRepo` (composición sobre `PrismaOutboxCorreoRepo`, sólo `pendientes()` propio). Listener `on('failed')` extraído a `crearListenerNotificacionesFallido` | Un processor nuevo `notificaciones.processor.ts` (copia de uno agnóstico); renombrar `procesarCorreoComprobante`; subir `concurrency` para vaciar ráfagas más rápido; `attempts`/`backoff` distintos | `attempts: 5` + backoff exponencial de 2 000 ms es el valor **literal** de `outbox-dispatcher.ts`, `actas-dispatcher.ts` y `reportes-dispatcher.ts`: un cuarto valor distinto sería deriva sin razón. `concurrency` por defecto también es el precedente exacto de las cuatro colas vivas (ninguna la fija) y es lo correcto acá: el cuello de botella es el SMTP institucional, y paralelizar recordatorios es la forma más rápida de que el proveedor aplique *rate limiting* a todo el dominio, incluidos los comprobantes de voto — justo lo que la cola separada existe para evitar. El processor de `#15` ya es agnóstico del contenido (lee `asunto`/`cuerpo`/`destinatario`, hace CAS con `reclamar()` y marca `enviado`): copiarlo sería duplicar la barrera CAS. Su nombre queda histórico y se documenta; renombrarlo tocaría archivos y specs de `#15` sin cambiar una sola línea de comportamiento |
| D8 | Motor de plantillas | `apps/backend/src/notificaciones/plantillas-notificacion.ts`: `construirNotificacion(evento, datos) → { titulo, cuerpo, asunto }`, despachando sobre un `Record<EventoNotificacion, (d) => ContenidoNotificacion>` congelado con las 4 funciones puras. **`asunto` fijo por evento**, sin el nombre del proceso. `normalizarTextoLibre()` se mueve de `votos/correo-comprobante.ts` a `email/texto-libre.ts` y ambos lo importan | Tabla de plantillas en BD (vetado por la spec); plantillas parametrizadas por usuario (lo que dice la spec, C8); `asunto` con el nombre del proceso; duplicar `normalizarTextoLibre` | Las plantillas **no reciben al usuario** (C8) por tres razones concretas: `construirCorreoComprobante()` de `#15` tampoco lo recibe; personalizar el saludo metería el nombre real de un menor en `JobCorreo.cuerpo`, que es texto en claro consultable por cualquiera con acceso a la tabla; y forzaría N invocaciones por evento en vez de una, cuando el contenido sería idéntico salvo el saludo. El `asunto` fijo es literal de `#15` y por el mismo motivo declarado allí: elimina de raíz la inyección de cabeceras SMTP desde `ProcesoElectoral.nombre`, que es texto libre capturado por un usuario de gestión. El nombre del proceso viaja **sólo** en el cuerpo, normalizado. Mover `normalizarTextoLibre()` a `email/` en vez de importarlo desde `votos/` evita una dependencia `notificaciones → votos` que no describe ninguna relación real; `email/` ya es el módulo compartido que el worker importa |
| D9 | Contrato HTTP de la bandeja | `NotificacionesController`, `@Controller('notificaciones')`, `@UseGuards(AuthGuard)` y **sin `@Roles`** (idioma de `GET /votos/mis-derechos`). `GET /notificaciones?pagina&tamano&solo_no_leidas` ⇒ `200 PaginaNotificacionesDto`. `PATCH /notificaciones/:id/leido` ⇒ `@HttpCode(200)` + `NotificacionDto`. **`403` sin cuerpo** para notificación ajena, inexistente o de otro usuario — el mismo `403` en los tres casos. Validación de query **a mano**, sin `class-validator` | `404` para ajena (la otra mitad de lo que la spec dejó abierto); `403` para ajena + `404` para inexistente; `204 No Content` en el `PATCH`; paginación por cursor; `@Roles` explícito | El `403` uniforme no es una preferencia: es el idioma de no-oráculo ya establecido por `ComprobanteService`, `PapeletaService` y `VotosService` (`#14` D9/D13), verificado en el código. Y es lo único que cumple la letra de la spec ("sin revelar si el registro existe para otro usuario"): la combinación `403`-ajena/`404`-inexistente **es** el oráculo, y un `404` uniforme contradiría tres servicios vivos. Sin `@Roles` porque la bandeja es de cualquier usuario autenticado y el `scope` lo da `usuario_id = sesion.userId`, nunca un parámetro — igual que `mis-derechos`, donde un `?usuario_id=` es estructuralmente inerte porque el handler no lo puede leer. Paginación por *offset* y no por cursor porque la bandeja se ordena `creado_en DESC` sobre volúmenes de decenas de filas por usuario y el `total`/`no_leidas` del mismo viaje es lo que la insignia de la UI futura necesita sin un segundo endpoint |
| D10 | Idempotencia del `PATCH` y del listado | `PATCH` sobre una notificación **ya leída**: `200` con el `leido_en` **original**, sin sobrescribir. Implementación: `findFirst({ id, usuario_id })` ⇒ `null` ⇒ `403`; si `leido_en === null`, `updateMany({ where:{ id, usuario_id, leido_en: null }, data:{ leido_en: new Date() } })` | Sobrescribir `leido_en` en cada `PATCH`; `409` si ya está leída; envolver los dos pasos en `$transaction` | Preservar la **primera** marca de lectura es lo que hace del campo un dato y no un ruido: sobrescribirlo convierte "cuándo lo leyó" en "cuándo tocó el botón por última vez". El `WHERE leido_en IS NULL` es un CAS real, así que dos `PATCH` concurrentes conservan el primer timestamp sin necesidad de transacción ni de lock — el segundo `updateMany` devuelve `count: 0` y no es un error. Un `409` sería hostil para una operación que el cliente puede repetir por reintento de red |
| D11 | Auditoría | **Una clave aditiva** `NOTIFICACIONES_EMITIDAS`, escrita por `emitirNotificaciones()` con `tx.eventoAuditoria.create()` directo (no `AuditoriaService`), `entity_type='ProcesoElectoral'`, `entity_id=proceso_id`, payload cerrado `{ evento, notificaciones, jobs_correo }`. Actor: `actorId` en los hooks, `null` en el sweep. **Cero migraciones de trigger**. Los payloads de `PROCESO_ABIERTO`/`PROCESO_CERRADO` **no se tocan** | Un evento por notificación; una clave por evento (`NOTIFICACION_INICIO_EMITIDA`, …); sumar `notificaciones_creadas` al payload de `PROCESO_ABIERTO`/`PROCESO_CERRADO`; usar `AuditoriaService` desde el worker | Un evento por notificación multiplicaría la tabla de auditoría por el padrón entero **cuatro veces** por proceso; el agregado deja ≤4 filas por proceso y conserva la trazabilidad ("cuántas y de qué evento"). Clave única con `evento` en el payload: mismo criterio con que `#17` D14 puso `tipo` en el payload en vez de multiplicar claves. **No** se amplían los payloads existentes porque los e2e de `#13`/`#17` asertan sus claves exactas y una adición los rompería sin aportar nada que la clave nueva no diga. `tx.eventoAuditoria.create()` directo es obligado —`AuditoriaService` es un provider Nest que el worker no puede importar— y es el precedente literal de `actas.repo.ts`/`reportes.repo.ts`. El payload no lleva `usuario_id` ni identidad de elección: fuera de la cláusula `WHEN` del trigger de ADR-0016 (que cubre sólo `VOTO`/`RECHAZO`) y cumple el `CHECK` `^[A-Z_]+$` |
| D12 | Variables de entorno y sus defaults | `NOTIFICACIONES_POLL_MS` (5000) · `NOTIFICACIONES_BATCH` (20) · `NOTIFICACIONES_SWEEP_MS` (**60000**) · `NOTIFICACIONES_RECORDATORIO_HORAS` (**24**) · `NOTIFICACIONES_CIERRE_PROXIMO_HORAS` (**2**). Se leen con un helper `numeroPositivo(env, default)` que **cae al default** si el valor no es un número finito y positivo | `Number(process.env.X ?? def)` a secas (el patrón vigente de `OUTBOX_*`/`ACTAS_*`/`REPORTES_*`); umbrales en minutos; un solo umbral con dos valores | `POLL_MS`/`BATCH` copian los valores de las tres colas vivas. El sweep va a **60 s** y no a 5 s por una razón medible: su granularidad de decisión es de **horas**, así que barrer doce veces menos no agrega latencia perceptible y divide por doce un escaneo que es más caro que el de un despachador (recorre procesos, derechos y votos). **Desviación declarada** respecto del patrón de lectura de env vars: `Number('abc')` es `NaN`, y `NaN` en una comparación de umbral es siempre `false` — el sweep dejaría de notificar **en silencio**, sin un solo error en el log; peor, `setInterval(NaN)` degenera en un temporizador de 1 ms. Es un modo de falla que las variables existentes no tienen (un `NaN` en `take:` de Prisma revienta ruidosamente) y por eso acá el helper no es ceremonia |

## Flujo de datos

```
(1) Apertura — apps/backend/src/procesos/procesos.service.ts :: abrir()          (D5)
    prisma.$transaction(tx):
      UPDATE "ProcesoElectoral" SET estado='abierto' … RETURNING id, nombre,
             fecha_cierre_prevista, apertura_real, ocultar_resultados, publico_objetivo, tipo
        └─ 0 filas ⇒ 404 / 200 no-op idempotente  ← NO emite (D5)
      materializarDerechosVoto(tx, …)
      auditoria.log(tx, 'PROCESO_ABIERTO', …)
      emitirNotificaciones(tx, { proceso, evento:'inicio_votacion',
                                 destinatarios: SELECT DISTINCT usuario_id FROM "DerechoVoto" })
    ─ commit ⇒ N Notificacion + N JobCorreo(origen='notificacion', estado='pendiente')

(2) Cierre — mismo archivo :: cerrar()   (RepeatableRead, D4 de #17)             (D5)
      … auditoria.log(tx, 'PROCESO_CERRADO', …)
      emitirNotificaciones(tx, { proceso, evento:'resultados', destinatarios: … })

(3) emitirNotificaciones(tx, params)  ── 3 sentencias, troceadas en LOTE=500 ──  (D4)
      1. INSERT INTO "Notificacion" (id, proceso_id, evento, usuario_id, tipo,
                                     titulo, cuerpo, job_correo_id)
         VALUES … (tipo='interna', job_correo_id=NULL)
         ON CONFLICT ("proceso_id","evento","usuario_id") DO NOTHING
         RETURNING id, usuario_id            ← SÓLO las realmente insertadas
      2. jobCorreo.createMany({ data: nuevas.map(… id: randomUUID(),
                                origen:'notificacion', asunto, cuerpo …) })
      3. UPDATE "Notificacion" SET job_correo_id = v.job
           FROM (VALUES …) v(notif, job) WHERE id = v.notif
      4. eventoAuditoria.create('NOTIFICACIONES_EMITIDAS', {evento, notificaciones, jobs_correo})
      ── el orden importa: la Notificacion se inserta PRIMERO y en conflicto no
         devuelve nada, así que un JobCorreo duplicado no puede llegar a existir.

(4) apps/worker — nada de esto lo dispara el backend (ADR-0012)              (D6/D7/D12)
    setInterval(NOTIFICACIONES_SWEEP_MS = 60000)
      └ barrerNotificaciones(sweepRepo, umbrales, new Date())                     ← PURA
           procesosAbiertos()  → SELECT id, nombre, fecha_cierre_prevista
                                   FROM "ProcesoElectoral" WHERE estado='abierto'
           por proceso:  restante = cierre − ahora
             0 < restante ≤ 24 h ⇒ emitirPendientes(proceso,'recordatorio')
             0 < restante ≤  2 h ⇒ emitirPendientes(proceso,'cierre_proximo')
                └ $transaction:  count(Notificacion{proceso,evento}) > 0 ⇒ 0  (atajo)
                                 SELECT DISTINCT dv.usuario_id FROM "DerechoVoto" dv
                                   WHERE dv.proceso_id=$1
                                     AND NOT EXISTS (SELECT 1 FROM "Voto" v
                                                     WHERE v.derecho_voto_id = dv.id)
                                 emitirNotificaciones(tx, …)      ← MISMA función que (3)

    setInterval(NOTIFICACIONES_POLL_MS = 5000)
      └ despacharLoteNotificaciones(notificacionesRepo, notificacionesQueue, 20)
           pendientes() → WHERE estado='pendiente' AND origen='notificacion'
                          ORDER BY creado_en LIMIT 20   ← índice PARCIAL de D3
           addBulk({ name:'notificacion.correo', data:{ job_correo_id },
                     opts:{ jobId:'notificacion:'+id, attempts:5,
                            backoff:{exponential,2000} } })

    notificacionesWorker('notificaciones')
      └ procesarCorreoComprobante(notificacionesRepo, sender, job_correo_id)  ← REUSADO de #15
           reclamar() (CAS) → sender.enviar() → marcarEnviado()
      on('failed') ⇒ attemptsMade >= attempts ⇒ marcarFallido()
```

## Contratos

```ts
// apps/backend/src/notificaciones/plantillas-notificacion.ts — D8. PURAS, sin usuario (C8).
export type EventoNotificacionSeei = 'inicio_votacion' | 'recordatorio' | 'cierre_proximo' | 'resultados';

export interface DatosNotificacion {
  proceso_nombre: string;              // se normaliza (sin caracteres de control) antes de interpolar
  fecha_cierre_prevista?: Date;        // requerido por inicio_votacion/recordatorio/cierre_proximo
  app_base_url?: string;               // ausente ⇒ el cuerpo omite el enlace, nunca lanza (#15 D2)
}
export interface ContenidoNotificacion {
  titulo: string;   // bandeja interna
  cuerpo: string;   // bandeja interna Y cuerpo del correo — un solo texto, nunca dos verdades
  asunto: string;   // correo: FIJO por evento, jamás con `proceso_nombre` (anti-inyección SMTP)
}
export function construirNotificacion(
  evento: EventoNotificacionSeei,
  datos: DatosNotificacion,
): ContenidoNotificacion;
```

```ts
// apps/backend/src/notificaciones/emitir-notificaciones.ts — D4. Función LIBRE sobre `tx`
// (idioma de materializarDerechosVoto()/escrutinio.ts). La importan los 2 hooks Y el worker.
export interface ProcesoNotificable { id: string; nombre: string; fecha_cierre_prevista: Date }
export interface ParametrosEmision {
  proceso: ProcesoNotificable;
  evento: EventoNotificacionSeei;
  destinatarios: string[];             // usuario_id[], YA sin duplicados (DISTINCT del caller)
  actorId: string | null;              // hooks: usuario del comité; sweep: null
  app_base_url?: string;
}
export interface ResultadoEmision { notificaciones: number; jobs_correo: number }
export function emitirNotificaciones(
  tx: Prisma.TransactionClient,
  params: ParametrosEmision,
): Promise<ResultadoEmision>;
```

```ts
// apps/worker/src/notificaciones/sweep-notificaciones.ts — D6. `ahora` por parámetro: sin reloj propio.
export interface UmbralesSweep { recordatorio_horas: number; cierre_proximo_horas: number }
export interface ProcesoSweep { id: string; nombre: string; fecha_cierre_prevista: Date }
export interface SweepRepo {
  procesosAbiertos(): Promise<ProcesoSweep[]>;
  emitirPendientes(proceso: ProcesoSweep, evento: EventoNotificacionSeei): Promise<number>;
}
export function barrerNotificaciones(
  repo: SweepRepo, umbrales: UmbralesSweep, ahora: Date,
): Promise<{ recordatorio: number; cierre_proximo: number }>;
```

```sql
-- prisma/migrations/20260825010000_notificacion_bandeja_interna/migration.sql — D2/D3. DDL PURO.
-- PG16 admite ADD VALUE dentro del bloque transaccional de Prisma; lo que NO admite es USAR el
-- valor nuevo en la misma transacción. Este archivo no lleva ningún INSERT/UPDATE/DEFAULT/CHECK que
-- mencione 'interna'. Los valores de "EventoNotificacion"/"OrigenJobCorreo" SÍ se usan acá porque
-- ambos tipos se CREAN en esta misma transacción (excepción explícita de Postgres).
ALTER TYPE "TipoNotificacion" ADD VALUE 'interna';

CREATE TYPE "EventoNotificacion" AS ENUM ('inicio_votacion','recordatorio','cierre_proximo','resultados');
CREATE TYPE "OrigenJobCorreo"    AS ENUM ('comprobante','notificacion');

-- `Notificacion` tiene CERO escritores en el repo (C6): está vacía, NOT NULL sin DEFAULT es seguro.
ALTER TABLE "Notificacion" ALTER COLUMN "job_correo_id" DROP NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "usuario_id" UUID NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "proceso_id" UUID;             -- nullable a propósito (D2)
ALTER TABLE "Notificacion" ADD COLUMN "evento" "EventoNotificacion" NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "titulo" TEXT NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "cuerpo" TEXT NOT NULL;
ALTER TABLE "Notificacion" ADD COLUMN "leido_en" TIMESTAMPTZ(3);
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_usuario_id_fkey"
  FOREIGN KEY ("usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_proceso_id_fkey"
  FOREIGN KEY ("proceso_id") REFERENCES "ProcesoElectoral"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Clave de deduplicación del sweep (D2/C4). NULL en proceso_id ⇒ nunca colisiona (Postgres).
CREATE UNIQUE INDEX "Notificacion_proceso_id_evento_usuario_id_key"
  ON "Notificacion"("proceso_id","evento","usuario_id");
CREATE INDEX "Notificacion_usuario_id_creado_en_idx"
  ON "Notificacion"("usuario_id","creado_en" DESC);

-- D3: sin esta columna la cola dedicada no aísla nada (C5).
ALTER TABLE "JobCorreo" ADD COLUMN "origen" "OrigenJobCorreo" NOT NULL DEFAULT 'comprobante';
CREATE INDEX "JobCorreo_pendiente_comprobante_idx"  ON "JobCorreo"("creado_en")
  WHERE "estado" = 'pendiente' AND "origen" = 'comprobante';
CREATE INDEX "JobCorreo_pendiente_notificacion_idx" ON "JobCorreo"("creado_en")
  WHERE "estado" = 'pendiente' AND "origen" = 'notificacion';
```

| Ruta | Query / cuerpo | Respuestas |
|---|---|---|
| `GET /notificaciones` | `pagina` (int ≥1, def. 1) · `tamano` (int 1..100, def. 20) · `solo_no_leidas` (`'true'`\|`'false'`) | `200 PaginaNotificacionesDto` `{ datos: NotificacionDto[], pagina, tamano, total, no_leidas }` · `400 CAMPO_INVALIDO {campo}` · `401` |
| `PATCH /notificaciones/{id}/leido` | — (sin cuerpo) | `200 NotificacionDto` (marcada ahora **o** ya leída, mismo cuerpo, `leido_en` original) · `400` `:id` no-UUID (`ParseUUIDPipe`) · `401` · `403` ajena **o** inexistente, sin cuerpo (D9) |

`NotificacionDto` = `{ id, evento, proceso_id, titulo, cuerpo, creado_en, leido_en, tiene_correo }`.
Nunca `job_correo_id` crudo: `tiene_correo: boolean` es el mismo criterio que `pdf_disponible` en
`ActaResumenDto` (`#17` D13). `packages/contracts` se regenera (`pnpm openapi:extract`).

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modificar | D2/D3 — `TipoNotificacion +interna`, enums `EventoNotificacion`/`OrigenJobCorreo`, 6 columnas en `Notificacion`, `job_correo_id` nullable, `JobCorreo.origen`, 2 índices + 1 único |
| `apps/backend/prisma/migrations/20260825010000_notificacion_bandeja_interna/migration.sql` | Crear | D2/D3 — DDL puro, con el comentario del gotcha de `ADD VALUE` |
| `apps/backend/src/email/texto-libre.ts` | Crear | D8 — `normalizarTextoLibre()` movido desde `votos/correo-comprobante.ts` |
| `apps/backend/src/votos/correo-comprobante.ts` | Modificar | D8 — importa el helper movido; **cero cambio de comportamiento** (su `.spec.ts` pasa sin editarse) |
| `apps/backend/src/notificaciones/plantillas-notificacion.ts` (+ `.spec.ts`) | Crear | D8 — 4 funciones puras + despacho congelado |
| `apps/backend/src/notificaciones/emitir-notificaciones.ts` (+ `.spec.ts`) | Crear | D4 — emisor único sobre `tx`, `ON CONFLICT DO NOTHING`, auditoría agregada |
| `apps/backend/src/notificaciones/notificaciones.service.ts` (+ `.spec.ts`) | Crear | D9/D10 — listado *scoped*, marcado idempotente, `403` uniforme |
| `apps/backend/src/notificaciones/notificaciones.controller.ts` | Crear | D9 — `GET /notificaciones`, `PATCH /notificaciones/:id/leido` |
| `apps/backend/src/notificaciones/notificaciones.module.ts` | Crear | D9 — `imports:[AuthModule]`, `cookie-parser` `forRoutes` (patrón `ReportesModule`) |
| `apps/backend/src/notificaciones/dto/listar-notificaciones.query.ts` · `notificacion-respuesta.dto.ts` · `pagina-notificaciones.dto.ts` | Crear | D9 — DTO planos con `@ApiProperty`, sin `class-validator` |
| `apps/backend/src/notificaciones/notificaciones.errors.ts` | Crear | `CAMPO_INVALIDO` (patrón `as const` + union) |
| `apps/backend/src/procesos/procesos.service.ts` | Modificar | D5 — `RETURNING` de `abrir()` +2 columnas y 2 llamadas a `emitirNotificaciones()` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | D11 — `NOTIFICACIONES_EMITIDAS` + entrada de bitácora |
| `apps/backend/src/app.module.ts` | Modificar | D9 — `+NotificacionesModule` |
| `apps/backend/test/schema/notificaciones.spec.ts` | Crear | D2/D3 — enums, `NOT NULL`, unicidad `23505`, índices parciales, `job_correo_id` NULL |
| `apps/backend/test/notificaciones/notificaciones.e2e-spec.ts` | Crear | D9/D10 — *scope*, paginación, `403` uniforme, idempotencia del `PATCH` |
| `apps/backend/test/procesos/notificaciones-hooks.e2e-spec.ts` | Crear | D5 — atomicidad, conteo por usuario habilitado, doble cierre sin duplicados |
| `apps/worker/src/notificaciones/notificaciones-dispatcher.ts` (+ `.spec.ts`) | Crear | D7 — cola `notificaciones`, espejo de `outbox-dispatcher.ts` |
| `apps/worker/src/notificaciones/notificaciones.repo.ts` | Crear | D7 — composición sobre `PrismaOutboxCorreoRepo`, `pendientes()` con `origen` |
| `apps/worker/src/notificaciones/sweep-notificaciones.ts` (+ `.spec.ts`) | Crear | D6 — decisión pura de umbrales |
| `apps/worker/src/notificaciones/sweep.repo.ts` | Crear | D6 — adaptador Prisma: procesos abiertos, pendientes sin voto, atajo por `count` |
| `apps/worker/src/notificaciones/notificaciones-fallido-listener.ts` (+ `.spec.ts`) | Crear | D7 — espejo de `crearListenerActasFallido` |
| `apps/worker/src/outbox/outbox-correo.repo.ts` (+ `.spec.ts`) | **Modificar (corrige C5)** | D3 — `pendientes()` suma `origen:'comprobante'`; sin este cambio el aislamiento de colas no existe |
| `apps/worker/src/main.ts` | Modificar | D6/D7/D12 — `Queue`/`Worker` de `notificaciones`, 2 `setInterval`, listener `failed`, 5 env vars |
| `turbo.json` · `infra/docker/docker-compose.yml` · `docs/onboarding.md` · `README.md` | Modificar | D12 — las 5 `NOTIFICACIONES_*` junto a `OUTBOX_*`/`ACTAS_*`/`REPORTES_*` |
| `packages/contracts/openapi.json` · `src/generated/api.d.ts` | Modificar | Regenerar tras D9 |
| `apps/backend/test/votos/outbox-atomicidad.e2e-spec.ts` · `src/votos/correo-comprobante.spec.ts` | **Sin cambios (explícito)** | Red de regresión de `#15`; editarlos es evidencia de deriva, no de refactor |

## Estrategia de pruebas

TDD estricto (`openspec/config.yaml`, `strict_tdd: true`; `pnpm turbo run test`): cada fila se
escribe en RED antes del código que la satisface.

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Schema (`pg` crudo) | `TipoNotificacion` tiene `correo`+`interna`; `EventoNotificacion` los 4 valores; `INSERT` de `Notificacion` sin `usuario_id`/`evento` ⇒ error `NOT NULL`; `job_correo_id` NULL aceptado; segunda fila con el mismo `(proceso_id, evento, usuario_id)` ⇒ `23505` sobre `Notificacion_proceso_id_evento_usuario_id_key`; dos filas con `proceso_id IS NULL` **no** colisionan; `JobCorreo.origen` default `'comprobante'` en filas preexistentes; los dos índices parciales existen con su predicado | `test/schema/notificaciones.spec.ts`, patrón de `actas.spec.ts` + `expect-pg-error.ts` |
| Unit — `plantillas-notificacion.ts` | Los 4 eventos producen `titulo`/`cuerpo`/`asunto` deterministas; el `asunto` **no** contiene `proceso_nombre` en ninguno de los 4; un `proceso_nombre` con `\r\nBcc:` sale normalizado del `cuerpo`; sin `app_base_url` el cuerpo omite el enlace y no lanza; la firma **no** acepta usuario (aserción sobre el tipo y sobre el texto del módulo) | Puro, sin base |
| Unit — `emitir-notificaciones.ts` | `destinatarios: []` ⇒ no ejecuta ningún `INSERT` (spy sobre el doble de `tx`); troceado a 500; el `createMany` de `JobCorreo` recibe **exactamente** las filas devueltas por el `RETURNING`, nunca la lista completa; `origen:'notificacion'` en todas; payload de `NOTIFICACIONES_EMITIDAS` **sin** `usuario_id` ni identidad de elección | Doble de `Prisma.TransactionClient` |
| Unit — `sweep-notificaciones.ts` | `restante` justo por encima/por debajo de cada umbral; dentro de **ambos** ⇒ dos emisiones independientes; `restante ≤ 0` ⇒ cero emisiones; sin procesos abiertos ⇒ no llama al repo; `NaN` en los umbrales ⇒ el helper `numeroPositivo` ya devolvió el default y el barrido emite | Puro, `ahora` inyectado |
| E2E (Postgres real) — hooks | Apertura de un proceso con N habilitados ⇒ **N** `Notificacion` (`evento='inicio_votacion'`, `tipo='interna'`) y **N** `JobCorreo` (`origen='notificacion'`); apertura que falla ⇒ **cero** de ambas; segunda apertura (no-op) ⇒ siguen N; alcance `comunidad` (una cuenta con 2 `DerechoVoto`) ⇒ **una** notificación, no dos; cierre ⇒ N de `resultados`; doble cierre ⇒ siguen N | `test/procesos/notificaciones-hooks.e2e-spec.ts`, patrón de `outbox-atomicidad.e2e-spec.ts` |
| E2E — bandeja | Usuario A sólo ve lo suyo; `pagina`/`tamano` fuera de rango ⇒ `400 CAMPO_INVALIDO {campo}`; `solo_no_leidas=true` filtra; `PATCH` propio ⇒ `200` con `leido_en` poblado; segundo `PATCH` ⇒ `200` con el **mismo** `leido_en`; `PATCH` de notificación ajena ⇒ `403` con cuerpo vacío; `PATCH` de UUID inexistente ⇒ **el mismo `403`, byte a byte** (aserción de no-oráculo); sin cookie ⇒ `401` | `test/notificaciones/notificaciones.e2e-spec.ts` |
| E2E — idempotencia del sweep | Ejecutar el barrido **dos veces** sobre el mismo proceso dentro del umbral ⇒ N notificaciones, no 2N; barrido concurrente (`Promise.all` de dos `emitirPendientes`) ⇒ N; un usuario que ya votó **no** recibe recordatorio | `test/notificaciones/sweep.e2e-spec.ts` con `createPgClient()` |
| E2E — aislamiento de colas `[TM]` | 500 `JobCorreo` con `origen='notificacion'` pendientes + 1 con `origen='comprobante'` ⇒ `despacharLoteOutbox` devuelve **sólo** el de comprobante y `despacharLoteNotificaciones` **ninguno** de comprobante. **Esta prueba falla sin el filtro de D3** | Vitest + Postgres real |
| Unit (Vitest, worker) | `despacharLoteNotificaciones` ⇒ `jobId:'notificacion:<id>'`, `attempts:5`, backoff exponencial; lote vacío ⇒ **no** llama `addBulk`; `crearListenerNotificacionesFallido` marca `fallido` sólo con `attemptsMade >= attempts` | Dobles de los puertos, patrón de `outbox-dispatcher.spec.ts` |
| Auditoría `[TM]` | `NOTIFICACIONES_EMITIDAS` cumple el `CHECK` `^[A-Z_]+$` y **no** entra en la cláusula `WHEN` del trigger `eventoauditoria_claves_eleccion_trg` (que cubre sólo `VOTO`/`RECHAZO`); ≤4 filas por proceso aunque el padrón sea de 2000 | `test/schema/auditoria.spec.ts`, caso `[TM4]` existente |
| Contract | `pnpm openapi:extract` corre sin Postgres ni Redis con `NotificacionesModule` registrado; las 2 rutas aparecen con sus códigos | Job de CI existente |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| IDOR / oráculo de existencia en la bandeja | `PATCH /notificaciones/<uuid-ajeno>/leido`; enumeración por diferencia entre `403` y `404`; `?usuario_id=` en la query | **Applicable — riesgo central del change** | `usuario_id = sesion.userId` siempre, jamás un parámetro (el handler no lo puede leer, idioma de `mis-derechos`); **`403` idéntico y sin cuerpo** para ajena e inexistente (D9) | `403` byte a byte igual en ambos casos; listado de A nunca contiene filas de B |
| Aislamiento de colas convertido en teatro | Ráfaga de 50 000 recordatorios encolados mientras se emiten votos | **Applicable — el diseño ingenuo de la propuesta falla acá** (C5) | `JobCorreo.origen` + **índices parciales** disjuntos + filtro en ambos repos (D3): el despachador de comprobantes recorre un índice que no contiene recordatorios | E2E de aislamiento; **debe fallar** si se quita el filtro de `outbox-correo.repo.ts` |
| Duplicación de correos por sweep repetido o concurrente | El sweep corre cada 60 s sobre la misma ventana; dos réplicas del worker barren a la vez; BullMQ reentrega | **Applicable** | Tres capas: `jobId` en Redis, CAS `reclamar()` en Postgres (reusado de `#15`), y el **índice único** `(proceso_id, evento, usuario_id)` con `ON CONFLICT DO NOTHING`. La `Notificacion` se inserta **antes** que su `JobCorreo`, así que un job duplicado no puede llegar a existir (D4) | Doble barrido ⇒ N; barrido concurrente ⇒ N |
| Inyección de cabeceras SMTP desde texto de gestión | `ProcesoElectoral.nombre` = `"Elección\r\nBcc: fuga@x"` | **Applicable** — misma superficie que `#15` | `asunto` **fijo** por evento, sin `proceso_nombre`; el nombre viaja sólo en el `cuerpo` `text` plano y pasa por `normalizarTextoLibre()` (D8) | Nombre con `\r\n` ⇒ `asunto` intacto y `cuerpo` sin caracteres de control |
| Secreto del voto y PII en auditoría / cuerpos | `usuario_id` o la elección en el payload; nombre del alumno en `JobCorreo.cuerpo` | **Applicable** — ADR-0010/ADR-0016 | Payload **agregado y cerrado** `{ evento, notificaciones, jobs_correo }`, construido campo por campo (D11); plantillas sin usuario (D8/C8); el sweep lee de `Voto` sólo `NOT EXISTS`, nunca `lista_id`/`opcion_id`/`candidato_id` | Aserción sobre las claves exactas del payload; el módulo de plantillas no menciona `usuario` |
| Fuga lateral del gate `ocultar_resultados` | La notificación de "resultados publicados" incluye el desglose y llega a un votante en un proceso con resultados ocultos | **Applicable** | La plantilla de `resultados` **avisa**, no reporta: sin conteos, sin desglose, sin ganador — sólo el nombre del proceso y el enlace a `GET /procesos/:id/resultados`, que ya aplica el gate de `#16` | El `cuerpo` de `resultados` no contiene ningún dígito de conteo ni etiqueta de opción |
| Denegación por barrido / transacción larga | El sweep escanea derechos y votos cada 60 s; el `INSERT` de N notificaciones alarga la transacción de cierre, que corre en `RepeatableRead` | **Applicable** | Atajo por `count(Notificacion{proceso,evento}) > 0` antes de tocar `DerechoVoto`/`Voto`; barrido a 60 s y no a 5 s (D12); troceado a 500 filas; el `P2034` de una carrera en `cerrar()` ya lo captura `esConflictoDeSerializacion()` (`#17` D4) y responde el `200` no-op | Sweep sobre un proceso ya notificado ⇒ **cero** consultas a `DerechoVoto` (spy) |
| Migración destructiva encubierta | `ADD COLUMN … NOT NULL` sin `DEFAULT` sobre una tabla con filas; usar `'interna'` en la misma transacción que lo agrega | **Applicable** | `Notificacion` tiene **cero escritores** en el repo (C6, verificado): está vacía. La migración es DDL puro y no menciona `'interna'` en ningún `INSERT`/`DEFAULT`/`CHECK` (D2) | `migrate deploy` verde desde baseline; `test/schema/notificaciones.spec.ts` completo |
| Configuración hostil / silenciosa | `NOTIFICACIONES_RECORDATORIO_HORAS=abc`, `=0`, `=-5`; `NOTIFICACIONES_SWEEP_MS=abc` | **Applicable** — modo de falla **silencioso** que las env vars existentes no tienen | `numeroPositivo(env, default)` cae al default ante cualquier valor no finito o ≤0 (D12): sin él, `NaN` en la comparación de umbral apaga las notificaciones sin un solo error, y `setInterval(NaN)` degenera en un temporizador de 1 ms | Los cuatro valores hostiles ⇒ el default, y el barrido emite igual |
| Shell / subprocesos / Git / PR / clasificación de archivos ejecutables / enrutamiento de cliente | — | **N/A**: el change no ejecuta shell, no lanza subprocesos, no toca Git ni automatiza PR, no acepta archivos subidos y no agrega superficie de frontend | — | — |

## Migración / Rollout

| # | Paso | Verificación de salida |
|---|---|---|
| R1 | Migración + `schema.prisma` + `test/schema/notificaciones.spec.ts` | `pnpm prisma migrate deploy` verde desde baseline; `test:schema` verde |
| R2 | `email/texto-libre.ts` + `plantillas-notificacion.ts` + `emitir-notificaciones.ts` | Unit verdes; `correo-comprobante.spec.ts` verde **sin editarse** |
| R3 | Los 2 hooks en `procesos.service.ts` + `NOTIFICACIONES_EMITIDAS` | Apertura ⇒ N `Notificacion` + N `JobCorreo(origen='notificacion')`; rollback ⇒ cero |
| R4 | `NotificacionesModule` (controller/service/dto) + `pnpm openapi:extract` | Contrato regenerado con las 2 rutas; E2E de bandeja verde |
| R5 | Worker: repo + dispatcher + cola + listener + filtro `origen` en `outbox-correo.repo.ts` | E2E de aislamiento de colas verde; **debe fallar** si se revierte el filtro |
| R6 | Worker: `sweep-notificaciones.ts` + `sweep.repo.ts` + `setInterval` + env vars documentadas | Doble barrido ⇒ N notificaciones; `docker-compose`/`README`/`onboarding` con las 5 variables |

Rollback: revertir R3 desactiva inicio/resultados sin tocar el resto de las dos transacciones;
revertir R5/R6 detiene recordatorio/cierre próximo. La down-migration remueve las columnas nuevas y
`JobCorreo.origen`; los valores `'interna'`, `EventoNotificacion` y `OrigenJobCorreo` quedan sin uso
—Postgres no permite `DROP VALUE`— exactamente igual que `TipoActa.resultados` en `#17`.

**Pronóstico de tamaño (guía para `sdd-tasks`):** muy por encima del presupuesto de 400 líneas por
PR. Los seis pasos R1–R6 son cortes autónomos con inicio, fin y verificación propios y deberían
convertirse en PRs encadenados; R1 y R2 no tienen dependencia entre sí, el resto es secuencial.

## Preguntas abiertas

- [ ] Los defaults de 24 h / 2 h no vienen de una regla de negocio del usuario (la ronda de
      preguntas de la propuesta lo dejó explícito): quedan como valores razonables y configurables,
      a confirmar con el comité antes de la primera jornada real.
- [ ] Preferencias de notificación por usuario (silenciar tipos o canales) quedan fuera de alcance;
      el esquema las admite después sin migración destructiva (una tabla nueva y un filtro en
      `destinatarios`), pero el diseño de esa opción no se aborda acá.
