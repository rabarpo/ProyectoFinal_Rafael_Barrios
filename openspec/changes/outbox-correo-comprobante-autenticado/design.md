# Diseño: outbox-correo-comprobante-autenticado (Backlog #15 — Outbox de correo y comprobante autenticado)

## Enfoque técnico

Tres piezas que no se solapan:

1. **Una migración aditiva** a `JobCorreo` (`voto_id`, `proceso_id`, `codigo_comprobante`, todas
   nullable) que convierte la tabla en un outbox **consultable con un `JOIN`** en vez de texto libre
   — el requisito literal del [ADR-0012] ("verificable con un `JOIN`, no con disciplina de código").
   `voto_id` lleva FK real **y** `UNIQUE` (D1): "cada voto confirmado genera exactamente un job"
   deja de ser una promesa del código y pasa a ser una restricción del motor, exactamente como `#14`
   D2 hizo con "0 votos duplicados".
2. **Una sola llamada `tx.jobCorreo.create(...)`** en el marcador `// [#15] Punto de extensión
   JobCorreo` de `VotosService.emitir()` (`votos.service.ts:327`), con `asunto`/`cuerpo` ya
   materializados por un renderizador **puro y sin E/S** (D2). La transacción no se reescribe: gana
   una sentencia y una columna (`p.nombre`) en la proyección del `SELECT … FOR UPDATE OF dv` de D4.
3. **Un despachador + processor nuevos en `apps/worker/`**, estructuralmente distintos de
   `system-ping.processor.ts` (que es un walking skeleton sobre una clave de Redis y tiene prohibido
   tocar Postgres): acá Postgres **es** la fuente de verdad, BullMQ es sólo el motor de ejecución y
   de reintentos, y el processor es una función pura sobre dos puertos (`OutboxCorreoRepo`,
   `EmailSender`) — sin `PrismaClient` dentro del processor, sólo en su adaptador y en `main.ts`
   (D8).

A eso se suma la superficie de lectura que hoy no existe en ningún endpoint: `GET
/votos/comprobante/:votoId` detrás de `AuthGuard`, que **reutiliza** `VotosService.construirComprobante()`
de `#14`/PR3 en vez de duplicar el armado del `ComprobanteDto` (D11), y su página
`/comprobante/:votoId` que **reutiliza** la pieza `PanelComprobante` ya existente (D12). Sin listado
agregado "Mis votaciones" y sin las notificaciones de `#19` (D15).

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Forma de las columnas aditivas de `JobCorreo` | `voto_id String? @db.Uuid @unique` con **FK real** a `Voto` (`onDelete: Restrict`), `proceso_id String? @db.Uuid` con **FK real** a `ProcesoElectoral` (`onDelete: Restrict`), `codigo_comprobante String?` sin índice, más `@@index([estado, creado_en])`. Relaciones inversas `Voto.jobCorreo JobCorreo?` y `ProcesoElectoral.jobsCorreo JobCorreo[]` (sólo schema, sin SQL) | UUID pelado sin FK (precedente de `DerechoVoto.aula_snapshot`, `#13` D2); FK sin `UNIQUE`; `codigo_comprobante` con `@unique`; sin índice de despacho | El precedente de `aula_snapshot` **no aplica**: ahí el UUID es un *snapshot probatorio* que debe quedar inmutable aunque el aula cambie o desaparezca ([ADR-0003]/[ADR-0010]), y una FK habría atado la congelación a la vida de la fila referenciada. `JobCorreo` es lo contrario: una fila **operativa** cuyo único valor es apuntar a un voto que sigue existiendo (los `Voto` nunca se borran, `Restrict` en todas sus relaciones). Sin FK, un `voto_id` huérfano dejaría el `JOIN` del [ADR-0012] devolviendo menos filas de las reales — el fallo silencioso que ese ADR existe para impedir. El `UNIQUE` sobre columna nullable es gratis en Postgres (los `NULL` no colisionan entre sí): habilita jobs sin voto para el futuro `#19` y a la vez hace **estructuralmente imposible** el correo duplicado por doble inserción. `codigo_comprobante` sin `@unique` porque es una copia denormalizada para soporte, no una identidad — el `@unique` real vive en `Voto.codigo_comprobante`. `@@index([estado, creado_en])` es la consulta caliente y única del despachador |
| D2 | Dónde se renderizan `asunto`/`cuerpo` | **En la transacción**, por un renderizador puro `construirCorreoComprobante(...)` sin E/S (`votos/correo-comprobante.ts`); el worker **envía tal cual**, sin recomponer. Requiere agregar `p.nombre` a la proyección del `$queryRaw` de `#14` D4 | Renderizar en el worker al despachar (enfoque 3 de proposal.md); insertar `cuerpo` vacío o un identificador de plantilla y completarlo al enviar | `asunto` y `cuerpo` son **`NOT NULL`** desde `#2`. Cualquier variante con render diferido obliga a escribir en el commit un contenido que **no es** el que se enviará: la fila mentiría sobre sí misma y el requisito de secreto ("el asunto y cuerpo **efectivamente enviados** no revelan la elección") sólo sería verificable ejecutando el worker, nunca con un `SELECT` — justo lo que el [ADR-0012] pide evitar. Además, materializar el contenido hace que los reintentos reenvíen **bytes idénticos** (sin deriva de plantilla entre intentos) y que el worker no necesite conocer ni `APP_BASE_URL` ni ninguna plantilla. **Costo real y desviación asumida:** contradice el paso 2 de `proposal.md` (ver "Desviaciones respecto de la propuesta") y toca la sentencia de `#14` D4 para leer `p.nombre`. Es una **columna más en la proyección**, no una reescritura: no agrega ninguna vuelta a la base, no cambia el `FOR UPDATE OF dv`, no cambia ninguna decisión de rechazo, y la obligación 1 del [ADR-0018] ("agrega una llamada; no reescribe la transacción") se cumple en su literalidad |
| D3 | Forma exacta de la fila insertada | `tx.jobCorreo.create({ data: { usuario_id: fila.usuario_id, voto_id: voto.id, proceso_id: voto.proceso_id, codigo_comprobante: voto.codigo_comprobante, asunto, cuerpo } })` — `estado`/`intentos`/`creado_en` caen a sus `@default`. `usuario_id` sale de la **fila bloqueada** (`fila.usuario_id`), no de `sesion.userId` | `usuario_id: sesion.userId`; insertar sólo si el votante marcó la casilla de "copia por correo"; incluir el destinatario (`correo`) en la fila | `fila.usuario_id` es el dato que la transacción ya validó y bloqueó; `sesion.userId` es idéntico por la causa 1 de D9, pero derivarlo de la base en vez de la sesión mantiene la fila consistente aunque un refactor futuro cambie la regla de pertenencia. La inserción es **incondicional**: el criterio del PRD es "el 100% de los votos emitidos genera su copia", y condicionarla a una casilla la volvería a hacer inauditable (además, la casilla de `PanelComprobante` de `#14` nunca viajó al `EmitirVotoDto` — ver D12). El destinatario **no** se persiste: debe ser la dirección vigente **al enviar**, y guardarla duplicaría PII en una segunda tabla sin ninguna ganancia (el worker ya hace un `JOIN` a `Usuario`) |
| D4 | Qué pasa si el `INSERT` del outbox falla | **Aborta el voto entero.** No se captura, no se degrada: el error burbujea, la transacción hace rollback y `POST /votos` responde `500` sin `Voto` | `try/catch` alrededor del `create` para "no perder el voto por un correo"; insertar el job en una transacción posterior | Es la decisión que el [ADR-0006] §3 y el [ADR-0012] toman explícitamente: *"si el voto existe, su job existe; si la transacción no confirma, no existe ninguno de los dos"*. Capturar el error reintroduciría el hallazgo A1 —un voto sin job y sin forma de detectarlo— con la agravante de hacerlo **en silencio**. El riesgo operativo es mínimo y acotado: es un `INSERT` sin validaciones de negocio en una tabla pequeña, contra la misma conexión y la misma transacción que ya escribió `Voto` y `EventoAuditoria`; si esa escritura falla, la base está caída y el voto tampoco se habría podido registrar |
| D5 | Cómo llegan los jobs a BullMQ | **Despachador en el worker** que hace *polling* de Postgres (`estado='pendiente'`, `ORDER BY creado_en`, `LIMIT`) y encola por lotes (`queue.addBulk`) en la cola nueva `correo`. El backend **no** encola nada ni gana ningún `Queue` nuevo | Encolar desde `VotosService` tras el commit; `LISTEN/NOTIFY` de Postgres; trigger `AFTER COMMIT` | Encolar tras el commit es exactamente el patrón **vetado de forma permanente** por el [ADR-0018] (obligación 2) y el hallazgo A1 del [ADR-0012]; no es una opción de diseño disponible. `LISTEN/NOTIFY` reduce la latencia pero pierde eventos si el worker está caído en el instante del `NOTIFY`, así que **igual** haría falta el polling como red — dos mecanismos para la garantía de uno. El polling es lo que el propio [ADR-0012] describe ("un polling liviano sobre la tabla outbox") y su costo está acotado por `@@index([estado, creado_en])` (D1) |
| D6 | Idempotencia (entrega at-least-once, [ADR-0012]) | **Dos capas, ambas derivadas del `id` de la fila**: (a) `jobId: 'jobcorreo:' + jobCorreo.id` en `addBulk` — BullMQ descarta el duplicado mientras el job viva en Redis; (b) barrera real en Postgres: el processor lee la fila, retorna `no-op` si `estado <> 'pendiente'`, y **reclama con compare-and-set** `updateMany({ where: { id, estado: 'pendiente' }, data: { intentos: { increment: 1 } } })` — `count === 0` ⇒ otro intento ya la tomó ⇒ `no-op` sin enviar | Estado intermedio `enviando` en el enum; tabla de claves procesadas; confiar sólo en el `jobId` de Redis | Confiar sólo en Redis rompe en cuanto un job completado se purga (`removeOnComplete`) y el despachador lo vuelve a ver — el escenario normal, no el excepcional. El `updateMany` condicional es una **sola** sentencia atómica que sirve de guardia *y* de contador, sin lectura-luego-escritura. Un estado `enviando` convertiría cada caída del worker en un job **permanentemente atascado** que exigiría un *reaper* con timeouts — un mecanismo nuevo para evitar un duplicado ocasional que el [ADR-0012] declara tolerable ("un correo duplicado ocasional es tolerable; un voto sin correo no lo era") |
| D7 | Quién cuenta los reintentos | **BullMQ decide *cuándo* reintentar** (`attempts: 5`, `backoff: { type: 'exponential', delay: 2000 }`); `JobCorreo.intentos` es un **espejo** que el processor incrementa en el CAS de D6, nunca un disparador. `estado='fallido'` lo escribe el listener `worker.on('failed')` sólo cuando `job.attemptsMade >= attempts` | Reintentos propios leyendo `intentos` desde el despachador (`WHERE intentos < 5`); dos contadores autoritativos | Dos contadores que ambos deciden **divergen** —el mismo antipatrón de caché denormalizada que `#14` D2 rechazó para `DerechoVoto.estado`— y el desempate quedaría sin dueño. BullMQ ya tiene el temporizador, el backoff y la reentrega; reimplementarlos con polling exigiría un planificador propio. `intentos` conserva su valor real: es el número **consultable con un `JOIN`** que un operador necesita, no el mecanismo. Marcar `fallido` desde el listener (y no desde el `catch` del processor) mantiene el processor como función pura del par (repositorio, sender): el estado terminal pertenece al ciclo de vida de la cola |
| D8 | Forma del processor (prohibición de `system-ping.processor.ts`) | **Función pura sobre puertos**: `procesarCorreoComprobante(repo: OutboxCorreoRepo, sender: EmailSender, jobCorreoId: string): Promise<'enviado' \| 'no-op'>`. `PrismaClient` se instancia **sólo** en `main.ts` y vive detrás de `outbox-correo.repo.ts` (adaptador). El despachador es otro módulo (`outbox-dispatcher.ts`), no el processor | Copiar `system-ping.processor.ts` y cambiarle el cuerpo; importar `PrismaClient` dentro del processor; un único archivo que hace polling y envía | Su comentario lo prohíbe explícitamente y prohíbe importar `PrismaClient` **ahí**; la prohibición es de fondo, no de estilo: ese processor recibe un `Pick<Redis,'set'>` y su verdad vive en una clave sin esquema. Este otro recibe **puertos** precisamente porque su verdad está en Postgres y su efecto es SMTP: así los seis escenarios de la spec se prueban en Vitest con dobles en memoria, sin base ni servidor de correo, y `apps/worker` no necesita infraestructura de pruebas nueva. Separar despachador y processor es lo que el [ADR-0012] describe como dos responsabilidades (descubrir pendientes / ejecutar el envío) |
| D9 | Reutilización de `apps/backend/src/email/*` | `apps/worker` declara `"@seei/backend": "workspace:*"` e importa `EmailSender` (tipo), `SmtpEmailSender` y `ConsoleEmailSender` desde su `dist/email/*` compilado. **No** usa `ConfiguracionEmailSender`: el worker resuelve `smtp_host/puerto/remitente` leyendo `Configuracion` con su propio Prisma y compone el mismo `SmtpEmailSender`/`ConsoleEmailSender` que aquél compone, con la misma semántica perezosa por envío | Copiar `SmtpEmailSender` al worker; mover `email/` a un `packages/email` compartido; levantar un contexto de Nest en el worker sólo para inyectar `ConfiguracionEmailSender` | Copiar el sender crearía **dos** comportamientos SMTP que pueden divergir, y las pruebas de secreto del correo cubrirían sólo uno. Mover `email/` a un paquete nuevo es modificar lo que `proposal.md` manda reutilizar "tal cual" y arrastraría a `#5` a un cambio que no pidió. `ConfiguracionEmailSender` es `@Injectable` y depende de `ConfiguracionLecturaService`: consumirlo obligaría a montar Nest en el worker, un runtime entero para inyectar dos dependencias. Se reutiliza el **contrato y la implementación de transporte**, que es lo que `proposal.md` protege ("sin modificar su contrato"); la composición se rehace en tres líneas. **Costo real:** el cierre de dependencias del worker incluye a `@seei/backend` (y con él Nest) en instalación e imagen; en runtime sólo se cargan `nodemailer` y las dos clases. `worker.Dockerfile` debe compilar `@seei/backend` antes del `pnpm deploy` |
| D10 | Acceso a Postgres desde el worker | `@prisma/client` **y** `prisma` como dependencias de `apps/worker` **en la misma versión exacta que el backend** (`^5.22.0`), generados desde el **único** schema (`prisma generate --schema ../backend/prisma/schema.prisma`); sin segundo `schema.prisma` | Segundo schema en `apps/worker/prisma/`; `pg` crudo con SQL a mano; leer la base a través de un endpoint HTTP del backend | Un segundo schema es una copia que deriva en silencio — el peor fallo posible en la tabla que sostiene la garantía del [ADR-0012]. Un endpoint HTTP metería al backend en el camino de envío y multiplicaría los modos de fallo. `pg` crudo evitaría el acoplamiento de generación pero duplicaría fuera de Prisma el conocimiento del esquema del outbox. **Verificar en apply:** que `pnpm --filter @seei/worker deploy --legacy` conserve el cliente generado (pnpm resuelve `@prisma/client` de la misma versión al mismo paquete físico del store, y `prisma generate` escribe dentro de él). **Contingencia si no:** copiar `apps/backend/prisma/` a la imagen y correr `prisma generate` en la etapa de deploy; en último caso, `pg` crudo acotado a las tres sentencias del repositorio |
| D11 | Endpoint del comprobante autenticado | `GET /votos/comprobante/:votoId` en el `VotosController` existente (`@UseGuards(AuthGuard)`, sin `@Roles`), servido por un `ComprobanteService` **nuevo** de sólo lectura que inyecta `PrismaService` y `VotosService`, y delega el armado a `votosService.construirComprobante(...)`. `403` idéntico para voto ajeno e inexistente | `GET /votos/comprobante/:codigo` (por código de comprobante); agregar el método a `PapeletaService` o a `VotosService`; duplicar el armado del `ComprobanteDto`; controlador nuevo | El **código** de comprobante está diseñado para dictarse por teléfono y quedar impreso (Crockford, `#14` D12, [ADR-0013]): ponerlo en la URL lo filtraría al historial del navegador, a `Referer` y a los logs de acceso de Caddy. El `votoId` es opaco y nunca se imprime, y la autorización no depende del secreto de la URL sino de la pertenencia (`Voto → DerechoVoto.usuario_id === sesion.userId`), verificada en el servidor. `construirComprobante()` ya resuelve nombre del proceso, calidad y `eleccion_resumen` — reutilizarlo evita una segunda fuente de verdad de la vista y **no toca** ninguno de los archivos que el arnés de concurrencia de `#14` fija. La dirección de la dependencia es de una vía (lectura → escritura), sin ciclo. `403` uniforme repite la regla de no-oráculo de `#14` D9/D13 |
| D12 | Superficie de UI | Ruta `/comprobante/:votoId` ⇒ variante `{ nombre: 'comprobante'; votoId }` en `rutas.ts` + caso en `Enrutador.tsx`; contenedor **nuevo** `votos/ComprobantePage.tsx` (todos los efectos) que reutiliza la pieza existente `votos/piezas/PanelComprobante.tsx`. La casilla "Quiero recibir una copia…" de esa pieza se **reemplaza** por una línea informativa ("Se envió una copia a tu correo institucional") | Pieza nueva duplicada para la relectura; dejar la casilla como está; ruta bajo `/votos/...` | La pieza ya muestra exactamente los tres datos del comprobante y es presentacional pura: duplicarla crearía dos maquetas del mismo dato. La casilla **debe** cambiar: su propio comentario declara que es "un gesto explícito sin efecto en el outbox real: ese envío es #15", y con D3 el envío pasa a ser incondicional — dejarla ofrecería al votante una elección que el sistema ya no respeta. Ruta plana `/comprobante/:votoId` por el mismo criterio que `/votar/:derechoVotoId` (`#14` D14): el votante no gestiona, ejerce; y es la URL que viaja en el correo, así que debe ser corta y estable |
| D13 | Reconciliación / backfill | **Greenfield: no se requiere backfill** (cero votos reales; mismo precedente de `#1`/`#2`/`#3`/`#14`). Se entrega `apps/backend/scripts/reconciliar-outbox.ts` (tsx), **estrictamente de sólo lectura**: `SELECT` con `LEFT JOIN "JobCorreo" jc ON jc.voto_id = v.id WHERE jc.id IS NULL`, imprime y sale con código ≠ 0 si hay filas. **Nunca repara** | Script que inserta los `JobCorreo` faltantes; migración de backfill dentro del `.sql`; no entregar nada | Un script que **inserte** jobs leyendo votos ya confirmados **es** el despachador desacoplado que el [ADR-0018] veta de forma permanente: quedaría en el repositorio como plantilla del patrón prohibido. Detectar es suficiente y es lo que el ADR pide contemplar; reparar es una decisión humana caso por caso (y en greenfield, inexistente). Un backfill dentro de la migración no tendría nada que rellenar y quedaría como código muerto que nadie puede probar |
| D14 | Cierre del [ADR-0018] | **Edición in situ** del campo "Estado" de `adrs/0018-ventana-temporal-jobcorreo-diferido.md`: `Aceptado — temporal y acotado` ⇒ `Superado por #15 (outbox-correo-comprobante-autenticado)`, más **una línea** bajo el estado que cita la suite verde que lo habilita. Contexto, Decisión, Alternativas y Consecuencias quedan **intactos**. Sin ADR nuevo, sin enmienda a [ADR-0006]/[ADR-0012] | ADR nuevo que derogue al 0018; reescribir sus Consecuencias; borrar el ADR | Es la condición de cierre que el propio ADR-0018 se fijó ("con esa prueba verde el estado de este ADR pasa a 'Superado por #15'"), literalmente. Un ADR nuevo para derogar a otro que ya declaró su propia caducidad agregaría un documento sin decisión nueva. Reescribir el contexto borraría el registro histórico de por qué existió la ventana — el motivo por el que el ADR se escribió. **El cambio de estado es el último paso del change**, nunca antes de la suite verde |
| D15 | Alcance (constancia de las decisiones del usuario) | Sin listado agregado "Mis votaciones" (diferido a `#16`/`#20`) y **sin** las notificaciones de `#19` (inicio de votación, recordatorios, cierre próximo, publicación de resultados). El diseño no crea plantillas, colas ni tipos de job para ellas | Adelantar "Mis votaciones"; generalizar el processor a un enrutador de plantillas por `tipo` | Ambos límites son decisiones explícitas del usuario registradas en `proposal.md`; `openspec/config.yaml` prohíbe contradecirlas en silencio. Generalizar el processor "por si acaso" agregaría una dimensión de plantillas sin ningún segundo caso real que la justifique — el `voto_id`/`proceso_id` **nullable** de D1 ya deja la puerta abierta a `#19` sin ninguna migración adicional |

## Flujo de datos

```
POST /votos  (sin cambios de contrato — #14)
  └→ VotosService.emitir()  ── prisma.$transaction(tx) ─────────────────────────────┐
       1. SELECT dv…, p.nombre …  FOR UPDATE OF dv        ← D2: +1 columna, nada más │
       2-5. (rechazos e idempotencia de #14, intactos)                               │
       6. tx.voto.create(...)                                                        │
       7. auditoria.log(tx,'VOTO',…)                       ← sin la elección (#14 D11)│
       8. asunto/cuerpo = construirCorreoComprobante({          ← PURO, sin E/S (D2)  │
              codigo, hora_servidor, proceso_nombre, votoId, APP_BASE_URL })          │
          tx.jobCorreo.create({ usuario_id, voto_id, proceso_id,                      │
                                codigo_comprobante, asunto, cuerpo })  ← UNA llamada  │
       ─────────── COMMIT: Voto + EventoAuditoria + JobCorreo, o ninguno (D4) ────────┘

apps/worker (proceso ya existente)
  outbox-dispatcher  ── cada OUTBOX_POLL_MS ──►  SELECT id FROM "JobCorreo"
       │                                          WHERE estado='pendiente'
       │                                          ORDER BY creado_en LIMIT OUTBOX_BATCH
       └──► queue('correo').addBulk([{ name:'correo.comprobante',
                                       data:{ job_correo_id },
                                       opts:{ jobId:'jobcorreo:'+id, attempts:5,
                                              backoff:{type:'exponential',delay:2000} }}])
  Worker('correo')
       └─ procesarCorreoComprobante(repo, sender, id)                            (D8)
            ├ repo.leer(id)                     → estado ≠ 'pendiente' ⇒ 'no-op' (D6)
            ├ repo.reclamar(id)  UPDATE … SET intentos=intentos+1
            │                     WHERE id=$1 AND estado='pendiente'  → 0 ⇒ 'no-op' (D6)
            ├ sender.send(usuario.correo, job.asunto, job.cuerpo)     ← bytes tal cual
            └ repo.marcarEnviado(id) UPDATE … SET estado='enviado' WHERE id=$1
                                                     AND estado='pendiente'
       └─ on('failed') → attemptsMade >= attempts ⇒ repo.marcarFallido(id)       (D7)

Correo ──► https://…/comprobante/{votoId}
              └→ AuthGuard del cliente: sin sesión ⇒ LoginPage; la URL no cambia,
                 así que al iniciar sesión se renderiza la misma ruta        (#12 D11)
              └→ GET /votos/comprobante/{votoId} ⇒ ComprobanteDto CON eleccion_resumen
```

Ventana de duplicado aceptada (at-least-once, [ADR-0012]):

```
processor          SMTP            Postgres
  │ reclamar ────────────────────► intentos=1, estado='pendiente'
  │ send ──────────► entregado
  │ ✗ caída del worker antes de marcarEnviado
  ── reentrega ──►  estado sigue 'pendiente' ⇒ se envía una segunda vez
                    "un correo duplicado ocasional es tolerable" (ADR-0012)
```

## Contenido del correo

`construirCorreoComprobante()` es **pura** (sin lecturas, sin reloj propio) y produce texto plano
—`SmtpEmailSender` envía `text`, sin HTML ni adjuntos ([ADR-0009]: "el correo se vuelve ligero y
uniforme"):

```
asunto: Comprobante de tu voto
cuerpo: Tu voto quedó registrado.

        Proceso: {proceso.nombre}
        Código de comprobante: {codigo_comprobante}
        Hora del servidor: {hora_servidor ISO-8601 con offset}

        Para ver tu comprobante completo, inicia sesión:
        {APP_BASE_URL}/comprobante/{voto.id}

        Este correo no incluye tu elección: sólo tú puedes verla, tras iniciar sesión.
```

- **Asunto fijo**, sin el nombre del proceso: uniforma la bandeja (quien ve la lista de asuntos no
  descubre en qué procesos votó esa persona) y elimina de raíz cualquier superficie de inyección de
  cabeceras desde `ProcesoElectoral.nombre`, que es texto capturado por un usuario de gestión.
- **Nunca** viajan `lista_id`, `opcion_id`, `candidato_id`, `blanco`, `eleccion_resumen` ni ningún
  sinónimo: el renderizador recibe **cuatro** valores y ninguno los contiene (es una firma cerrada,
  no un *spread* del voto — mismo criterio que los payloads de auditoría de `#14` D11). El nombre
  del proceso **sí** viaja: lo exige el [ADR-0009] ("código de voto, proceso, hora y un enlace
  autenticado") y no es la elección, sino el evento electoral — igual que `proceso_id` viaja en el
  payload de auditoría de `#14`.
- La hora va en **ISO-8601** y no localizada: localizarla exigiría leer `Configuracion.zona_horaria`
  dentro de la transacción crítica. La superficie legible es la página del comprobante, que ya
  formatea con `toLocaleString()`.
- `APP_BASE_URL` ausente ⇒ el cuerpo omite el enlace y mantiene código y hora, sin fallar: una
  variable de entorno sin definir **nunca** puede abortar un voto (D4 aborta por fallos de escritura,
  no de configuración).

## Contratos HTTP

| Ruta | Cuerpo | Respuestas |
|---|---|---|
| `GET /votos/comprobante/:votoId` | — | `200 ComprobanteDto` · `400` `votoId` no-UUID (`ParseUUIDPipe`) · `401` sin cookie · `403` voto ajeno **o inexistente** (idéntico, sin cuerpo discriminante) |

`ComprobanteDto` se reutiliza sin cambios (`codigo_comprobante`, `hora_servidor`, `proceso{id,nombre}`,
`en_calidad_de`, `eleccion_resumen`). Sin DTO nuevo, sin cambios en `POST /votos` ni en
`GET /votos/papeleta/:derechoVotoId`.

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modificar | D1 — 3 columnas nullable + `@unique(voto_id)` + `@@index([estado, creado_en])` en `JobCorreo`; relaciones inversas en `Voto` y `ProcesoElectoral` |
| `apps/backend/prisma/migrations/20260814xxxxxx_jobcorreo_outbox_voto/migration.sql` | Crear | D1 — `ADD COLUMN` ×3, 2 FK `RESTRICT`, índice único parcial por `NULL` y el índice de despacho. Sin backfill (D13) |
| `apps/backend/src/votos/correo-comprobante.ts` | Crear | D2 — renderizador puro `construirCorreoComprobante()` |
| `apps/backend/src/votos/votos.service.ts` | Modificar | D2/D3 — `p.nombre` en la proyección de D4 y **una** llamada `tx.jobCorreo.create(...)` en el marcador `[#15]` (que desaparece como comentario TODO) |
| `apps/backend/src/votos/comprobante.service.ts` | Crear | D11 — lectura autenticada; delega en `VotosService.construirComprobante()` |
| `apps/backend/src/votos/votos.controller.ts` | Modificar | D11 — `GET /votos/comprobante/:votoId` con `ParseUUIDPipe` y `@ApiResponse` |
| `apps/backend/src/votos/votos.module.ts` | Modificar | D11 — registrar `ComprobanteService` |
| `apps/backend/scripts/reconciliar-outbox.ts` | Crear | D13 — utilidad de sólo lectura (`Voto` sin `JobCorreo`) |
| `apps/worker/src/outbox/outbox-dispatcher.ts` | Crear | D5 — polling + `addBulk` con `jobId` determinista |
| `apps/worker/src/processors/outbox-correo.processor.ts` | Crear | D6/D8 — función pura sobre puertos; **sin** `PrismaClient` |
| `apps/worker/src/outbox/outbox-correo.repo.ts` | Crear | D8/D10 — adaptador Prisma del puerto `OutboxCorreoRepo` |
| `apps/worker/src/outbox/email-sender.factory.ts` | Crear | D9 — compone `SmtpEmailSender`/`ConsoleEmailSender` desde `Configuracion` + `SMTP_USER`/`SMTP_PASSWORD` |
| `apps/worker/src/main.ts` | Modificar | D5/D7 — `PrismaClient`, cola `correo`, segundo `Worker`, listener `failed`, arranque del despachador; `system` intacta |
| `apps/worker/package.json` | Modificar | D9/D10 — `+@seei/backend` (workspace), `+@prisma/client`, `+nodemailer`; dev: `+prisma`; script `generate` |
| `infra/docker/worker.Dockerfile` | Modificar | D9/D10 — construir `@seei/backend` y generar el cliente Prisma antes del `pnpm deploy` |
| `infra/docker/docker-compose.yml` | Modificar | `worker`: `+DATABASE_URL`, `+SMTP_USER`, `+SMTP_PASSWORD`, `depends_on: migrate/postgres`; `backend`: `+APP_BASE_URL` |
| `turbo.json` | Modificar | `test:e2e.env` += `OUTBOX_POLL_MS`, `OUTBOX_BATCH` |
| `packages/contracts/openapi.json` · `src/generated/api.d.ts` | Modificar | Regenerar (`pnpm openapi:extract`) antes de tocar el frontend |
| `apps/frontend/src/app/rutas.ts` · `rutas.spec.ts` · `Enrutador.tsx` | Modificar | D12 — variante `comprobante` + caso del `switch` |
| `apps/frontend/src/votos/votos-api.ts` | Modificar | D12 — wrapper `comprobante(votoId)` |
| `apps/frontend/src/votos/ComprobantePage.tsx` (+ `.spec.tsx`) | Crear | D12 — contenedor con los efectos y los estados cargando/error/ok |
| `apps/frontend/src/votos/piezas/PanelComprobante.tsx` (+ `.spec.tsx`) | Modificar | D12 — casilla ⇒ línea informativa de copia enviada |
| `apps/backend/test/votos/outbox-atomicidad.e2e-spec.ts` | Crear | Commit y rollback conjuntos (prueba de cierre del [ADR-0018]) |
| `apps/backend/test/votos/comprobante-autenticado.e2e-spec.ts` | Crear | `200` propio / `403` ajeno e inexistente / `401` sin cookie |
| `apps/backend/test/schema/outbox.spec.ts` | Crear | FK, `UNIQUE(voto_id)` y semántica del CAS con `pg` crudo |
| `apps/backend/src/votos/*.spec.ts` | Modificar/Crear | Unitarias del insert, del renderizador y de `ComprobanteService` |
| `apps/worker/src/**/*.spec.ts` | Crear | Vitest con dobles en memoria (D8) |
| `adrs/0018-ventana-temporal-jobcorreo-diferido.md` | Modificar | D14 — sólo el campo "Estado" + una línea de cierre |
| `docs/onboarding.md` · `README.md` | Modificar | Variables nuevas del worker (`DATABASE_URL`, `SMTP_*`, `OUTBOX_*`) |

## Interfaces / Contratos

```prisma
// D1. Aditivo y nullable: ninguna columna existente cambia de nombre, tipo ni posición.
model JobCorreo {
  // … id, usuario_id, asunto, cuerpo, estado, intentos, creado_en (intactos)
  voto_id            String? @unique @db.Uuid   // UNIQUE sobre nullable: los NULL no colisionan
  proceso_id         String? @db.Uuid
  codigo_comprobante String?

  voto    Voto?             @relation(fields: [voto_id], references: [id], onDelete: Restrict)
  proceso ProcesoElectoral? @relation(fields: [proceso_id], references: [id], onDelete: Restrict)

  @@index([estado, creado_en])   // única consulta caliente: la del despachador (D5)
}
```

```ts
// D2. Firma CERRADA: el renderizador no puede filtrar la elección porque nunca la recibe.
export function construirCorreoComprobante(datos: {
  codigo_comprobante: string;
  hora_servidor: Date;
  proceso_nombre: string;
  voto_id: string;
  app_base_url?: string;           // ausente ⇒ cuerpo sin enlace, nunca una excepción
}): { asunto: string; cuerpo: string };
```

```ts
// D8. El processor NO conoce Prisma ni BullMQ: dos puertos y un id.
export interface JobCorreoPendiente {
  id: string; estado: 'pendiente' | 'enviado' | 'fallido';
  asunto: string; cuerpo: string; destinatario: string;   // JOIN a Usuario.correo (D3)
}
export interface OutboxCorreoRepo {
  leer(id: string): Promise<JobCorreoPendiente | null>;
  reclamar(id: string): Promise<boolean>;       // CAS: UPDATE … WHERE estado='pendiente' (D6)
  marcarEnviado(id: string): Promise<void>;
  marcarFallido(id: string): Promise<void>;
  pendientes(limite: number): Promise<string[]>; // usado por el despachador, no por el processor
}
export async function procesarCorreoComprobante(
  repo: OutboxCorreoRepo, sender: EmailSender, jobCorreoId: string,
): Promise<'enviado' | 'no-op'>;
```

```sql
-- D13. Reconciliación: SÓLO LECTURA. Insertar acá recrearía el despachador vetado (ADR-0018).
SELECT v.id, v.proceso_id, v.codigo_comprobante, v.hora_servidor
  FROM "Voto" v
  LEFT JOIN "JobCorreo" jc ON jc.voto_id = v.id
 WHERE jc.id IS NULL;
```

Claves de auditoría nuevas: **ninguna**. El envío del correo es infraestructura, no una decisión de
negocio del votante; `VOTO` ya deja la constancia y el `JobCorreo` es su propio rastro consultable.

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (Jest, backend) | `construirCorreoComprobante()`: contiene código/hora/enlace; **no** contiene `lista`/`opción`/`candidato`/`blanco`/`elección` ni el `eleccion_resumen` (lista negra de subcadenas); sin `APP_BASE_URL` ⇒ sin enlace y sin excepción; asunto invariante ante un `proceso.nombre` con `\r\n`. `emitir()` invoca `tx.jobCorreo.create` **una** vez, con `usuario_id` de la fila bloqueada y los tres campos estructurados; `ComprobanteService` ⇒ `403` para voto ajeno e inexistente | `PrismaService`/`AuditoriaService` mockeados, `$queryRaw` como `jest.fn()` (patrón `votos.service.spec.ts`) |
| Unit (Vitest, worker) | `estado='enviado'` ⇒ `no-op` sin `send`; `reclamar()` devuelve `false` ⇒ `no-op` sin `send`; camino feliz ⇒ `send` con `asunto`/`cuerpo` **verbatim** y `marcarEnviado`; `send` que lanza ⇒ propaga (BullMQ reintenta, D7) y **no** marca `fallido`; el despachador respeta `LIMIT` y genera `jobId` determinista `jobcorreo:<id>` | Dobles en memoria de `OutboxCorreoRepo` y `EmailSender` — sin Postgres, sin Redis, sin SMTP (D8) |
| E2E (Postgres real) | **Commit conjunto:** `POST /votos` ⇒ exactamente 1 `Voto` y 1 `JobCorreo` con `voto_id = voto.id`, `estado='pendiente'`, `intentos=0`, y `cuerpo` sin ninguna subcadena de la elección. **Rollback conjunto:** con `ALTER TABLE "JobCorreo" ADD CONSTRAINT tmp_falla CHECK (false) NOT VALID` aplicado antes del `POST` ⇒ `5xx`, **0** `Voto` y **0** `JobCorreo` para ese derecho; se elimina la restricción al terminar. **Idempotencia de #14 preservada:** reintento con la misma clave ⇒ `200` y sigue habiendo **1** `JobCorreo` | `test/votos/outbox-atomicidad.e2e-spec.ts`, patrón de `votos-emitir.e2e-spec.ts` (fetch real + `PrismaClient` para asertar filas). La restricción `CHECK (false) NOT VALID` es el disparador determinista de fallo **después** del punto de extensión, sin hooks en el código de producción |
| E2E (comprobante) | Voto propio ⇒ `200` con `eleccion_resumen` correcto (incluido "Voto en blanco"); voto de otro usuario ⇒ `403` con el **mismo** cuerpo que un `votoId` inexistente; sin cookie ⇒ `401`; `votoId` no-UUID ⇒ `400` | `test/votos/comprobante-autenticado.e2e-spec.ts` |
| Schema (`pg` crudo) | `JobCorreo_voto_id_key` rechaza el segundo job del mismo voto (`23505`); la FK rechaza un `voto_id` inexistente (`23503`); dos `voto_id NULL` conviven; `UPDATE … WHERE id=$1 AND estado='pendiente'` devuelve `rowCount=0` si otra transacción ya lo movió (la barrera real de D6) | `test/schema/outbox.spec.ts` + `helpers/pg-client.ts` (`expect-pg-error.ts`) |
| Unit (Vitest, frontend) | `parsearRuta('/comprobante/<id>')` ida y vuelta y `rutaAPath` inversa; `/comprobante` sin id ⇒ `no-encontrada`; `ComprobantePage` en cargando/`403`/éxito; `PanelComprobante` ya **no** ofrece la casilla y declara la copia enviada | `@testing-library/react` |
| Contract | `pnpm openapi:extract` sin Postgres/Redis; `GET /votos/comprobante/{votoId}` documentado con `200/400/401/403` | Job de CI existente |

TDD estricto (`openspec/config.yaml`): cada fila se escribe en RED antes del código que la satisface.

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| IDOR / enumeración sobre `votoId` | Abrir el comprobante de otro; barrer UUIDs para descubrir votos existentes; reenviar el enlace del correo a un tercero | **Applicable** — es el parámetro de autorización del endpoint nuevo | Pertenencia por `Voto → DerechoVoto.usuario_id === sesion.userId`; `403` idéntico para ajeno e inexistente (sin `404` oráculo); el enlace **no** es una credencial: sin sesión no muestra nada ([ADR-0009]) | Voto ajeno ⇒ `403`; UUID inexistente ⇒ `403` con el mismo cuerpo; sin cookie ⇒ `401` |
| Secreto del voto en el correo | Plantilla que interpola el voto entero; `eleccion_resumen` "por conveniencia"; nombre de lista dentro del asunto | **Applicable** — [ADR-0009]/[ADR-0010], es el riesgo central del change | Firma **cerrada** de cuatro campos (D2), ninguno de los cuales contiene la elección; asunto constante; aserción sobre el `cuerpo` **persistido**, no sobre el render en memoria | Lista negra de subcadenas en unit **y** en e2e sobre la fila `JobCorreo` real |
| Inyección de cabeceras SMTP | `ProcesoElectoral.nombre` con `\r\n` o `Bcc:` inyectado, capturado en gestión | **Applicable** — el nombre es texto de usuario que llega al correo | El nombre viaja sólo en el **cuerpo** (`text`), nunca en el asunto ni en cabeceras; el renderizador normaliza caracteres de control y acota longitud; `nodemailer` codifica cabeceras | Proceso con `\r\nBcc: x@y` en el nombre ⇒ asunto invariante y cuerpo sin salto de cabecera |
| Entrega duplicada / reentrega (at-least-once) | Reentrega de BullMQ tras purga; dos réplicas del worker; despachador que ve la fila dos veces | **Applicable** — [ADR-0012] | `jobId` determinista + CAS en Postgres (D6); `UNIQUE(voto_id)` impide un segundo job del mismo voto (D1) | Job `enviado` reprocesado ⇒ 0 envíos; `reclamar()` en carrera ⇒ un solo `send` |
| Pérdida silenciosa del job (hallazgo A1) | Encolar tras el commit; capturar el error del insert; script de backfill que inserta | **Applicable** — es la razón de existir del [ADR-0018] | Insert dentro de la transacción (D3); sin `try/catch` (D4); despachador que **sólo lee** de Postgres (D5); reconciliación de sólo lectura (D13) | Prueba de rollback conjunto con `CHECK (false)`; revisión de que ningún archivo del change inserte `JobCorreo` fuera de `emitir()` |
| Configuración del enlace (`APP_BASE_URL`) | Variable ausente ⇒ voto abortado; variable apuntando a un dominio atacante | **Applicable** — el enlace es la única superficie de contenido variable | Ausencia ⇒ cuerpo sin enlace, nunca excepción (D2); el valor es de despliegue, no de usuario, y es el mismo que `#5` ya usa para recuperación | Sin `APP_BASE_URL` ⇒ el correo se inserta igual y el voto responde `201` |
| Enrutamiento (cliente) | `/comprobante/<id>` sin sesión; `:votoId` no-UUID; `/comprobante/../..` | **Applicable** | El enrutador sigue montado dentro de `AuthGuard` (`#12` D11); `parsearRuta` sigue siendo total ⇒ `no-encontrada`; el backend valida con `ParseUUIDPipe` | Sin sesión ⇒ `LoginPage` conservando la URL; segmentos `..` ⇒ `no-encontrada` |
| Privilegios de base ([ADR-0015]) | `seei_app` sin permisos sobre las columnas nuevas; el worker corriendo con el rol migrador | **Applicable** — el worker es un consumidor nuevo de Postgres | Columnas nuevas heredan los `GRANT` de tabla de `#2`; el worker usa `DATABASE_URL` (`seei_app`), **nunca** `MIGRATION_DATABASE_URL` | Verificación de rollout R3; e2e corre con `seei_app` |
| Shell / subprocesos / Git / PR / clasificación de archivos ejecutables | — | N/A: el change no ejecuta shell, no toca Git ni automatiza PR, no sube ni sirve archivos | — | — |

## Migración / Rollout

Migración **aditiva y nullable** (D1), sin backfill (D13): la tabla `JobCorreo` está vacía y no
existen votos reales. Ninguna columna existente cambia de nombre, tipo ni posición.

| # | Paso | Verificación de salida |
|---|---|---|
| R1 | `prisma migrate deploy` (servicio `migrate` del compose, rol `seei_migrator`) | `\d "JobCorreo"` muestra las 3 columnas nullable, 2 FK y 2 índices; las 7 columnas previas intactas |
| R2 | Confirmar que no hay nada que reconciliar | `pnpm --filter @seei/backend exec tsx scripts/reconciliar-outbox.ts` ⇒ 0 filas |
| R3 | Verificar privilegios del rol de aplicación | Con `DATABASE_URL`: `INSERT`/`UPDATE` de prueba sobre `JobCorreo` en una transacción revertida |
| R4 | Desplegar backend | Un voto de prueba deja 1 `Voto` + 1 `JobCorreo` `pendiente` con `voto_id` poblado |
| R5 | `pnpm openapi:extract` y commit del contrato | El frontend no compila contra `/votos/comprobante` hasta este paso |
| R6 | Desplegar worker (con `DATABASE_URL`, `SMTP_*`) | El job de R4 pasa a `enviado`; el correo llega con código, hora y enlace, **sin** la elección |
| R7 | Desplegar frontend | El enlace del correo abre login y, tras autenticarse, muestra el comprobante con la elección |
| R8 | **Sólo con R4-R7 verdes y la suite e2e verde**: cerrar el [ADR-0018] (D14) | El campo "Estado" del ADR dice "Superado por #15" |

**Rollback.** `git revert` de los PR de aplicación detiene el envío sin perder ningún voto: los
`JobCorreo` quedan `pendiente` y se procesan cuando el worker vuelva (el mismo escenario que
`proposal.md` describe para deshabilitar el despachador). Revertir la **migración** exige revertir
antes el código del insert (el `create` fallaría contra columnas inexistentes); como es aditiva y
nullable, el `DROP COLUMN` no deja huérfanos ni datos obligatorios sin valor.

**Corte de PR sugerido para `sdd-tasks`** (pronóstico: 700-1000 líneas, por encima del presupuesto
de 400 ⇒ PR encadenados): **PR1** migración + renderizador + insert en el marcador + unit + e2e de
atomicidad (la garantía del [ADR-0018], indivisible); **PR2** worker completo (puertos, processor,
despachador, adaptador, `main.ts`, Docker/compose/env) + Vitest; **PR3** `ComprobanteService` +
endpoint + contrato regenerado + e2e; **PR4** ruta, `ComprobantePage`, ajuste de `PanelComprobante`
+ Vitest; **PR5** script de reconciliación, documentación de variables y cierre del [ADR-0018].

## Reconciliación con la spec de este change

| Texto de `specs/outbox-correo/spec.md` | Estado |
|---|---|
| "insertar la fila `JobCorreo` exactamente en el marcador… dentro del mismo `$transaction`" | **Compatible** (D3). El insert es una sola llamada en el marcador |
| "`voto_id` (FK nullable a `Voto`), `proceso_id` (FK nullable…), `codigo_comprobante` (string nullable)" | **Compatible y más fuerte** (D1): además de las FK que la spec pide, `voto_id` lleva `UNIQUE` — la spec no lo exige y no lo contradice |
| "MUST NOT basarse en `system-ping.processor.ts` ni importar `PrismaClient` directamente ahí" | **Compatible** (D8): el processor recibe puertos; `PrismaClient` vive en `main.ts` y en el adaptador |
| "procesar jobs `pendiente` por lotes, reintentar… idempotente por `id` de job" | **Compatible** (D5/D6/D7). El lote está en el **despacho**; el envío es por job, que es lo que permite que un fallo no bloquee al resto del lote |
| "componer el correo únicamente con `codigo_comprobante`, hora y enlace autenticado" | **Compatible con una precisión**: el cuerpo incluye además el **nombre del proceso**, que el [ADR-0009] exige explícitamente y que no es la elección. La composición ocurre en la transacción, no al despachar (D2 — ver desviaciones) |
| "proveer un script/consulta que identifique filas `Voto` sin `JobCorreo`… MUST NOT ejecutarlo contra producción" | **Compatible y más estricto** (D13): el script **no puede** escribir, ni contra producción ni contra staging |
| "MUST considerar cerrado ADR-0018 únicamente cuando la suite e2e esté verde" | **Compatible** (D14, paso R8 — último paso del change) |
| Capability `comprobante-autenticado` | **Sin spec delta todavía**: `specs/` sólo contiene `outbox-correo/`. D11/D12 diseñan el endpoint y la página; `sdd-spec` debe emitir esa segunda capability antes de `sdd-apply` (ver preguntas abiertas) |

## Desviaciones respecto de la propuesta

| Texto de `proposal.md` | Desviación | Constancia |
|---|---|---|
| Enfoque, paso 2: "sin renderizar `asunto`/`cuerpo` completos ahí (eso lo hace el worker al despachar…)" | El contenido **se materializa en la transacción** (D2); el worker envía verbatim | `asunto`/`cuerpo` son `NOT NULL` desde `#2`: el render diferido obliga a persistir un contenido distinto del que se envía, y vuelve el requisito de secreto verificable sólo ejecutando el worker. Se registra acá porque `openspec/config.yaml` prohíbe contradecir en silencio una decisión previa. **No afecta** ninguna de las dos decisiones no negociables del usuario (alcance de "Mis votaciones" y columnas estructuradas), que se cumplen íntegras |
| Enfoque, paso 2: "una llamada `tx.jobCorreo.create(...)` … sin tocar los pasos anteriores" | Se agrega `p.nombre` a la **proyección** del `SELECT` de `#14` D4 | Es una columna más en una lista de selección: no agrega vueltas a la base, no altera el `FOR UPDATE OF dv`, ni el `now()` compartido, ni ninguna causa de rechazo. La obligación 1 del [ADR-0018] (una llamada, sin reescribir la transacción) se mantiene |

## Preguntas abiertas

- [ ] La capability `comprobante-autenticado` todavía no tiene delta en `specs/`; `sdd-spec` debe
      emitirla (endpoint autenticado + página + regla de no-listado) antes de `sdd-apply`.
- [ ] **Verificar en apply (D10):** que `pnpm --filter @seei/worker deploy --legacy` conserve el
      cliente Prisma generado. Contingencia documentada en D10; si falla, es un cambio de
      `worker.Dockerfile`, no de diseño.
- [ ] El votante sigue sin poder **descubrir** su comprobante dentro de la app: la entrada es el
      enlace del correo o la URL directa. "Mis votaciones" es `#16`/`#20` por decisión del usuario
      (D15) — la brecha de `#14` sigue abierta, ahora acompañada por el correo.
- [ ] Las notificaciones de `#19` (recordatorios, cierre próximo, publicación de resultados)
      reutilizarán este outbox con `voto_id`/`proceso_id` en `NULL`; el disparo de cada plantilla y
      su punto de inserción transaccional quedan sin diseñar hasta ese change.
- [ ] Un `JobCorreo` en `fallido` no tiene hoy ninguna superficie de reintento manual ni de alerta:
      se descubre con una consulta. Si `#20` (monitoreo/actas) no lo cubre, hará falta decidirlo.
- [ ] Alta fidelidad inexistente para la página del comprobante autenticado: reutiliza
      `PanelComprobante` con los tokens vigentes de `index.css`, sujeta a revisión de diseño.
