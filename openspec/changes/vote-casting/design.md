# Diseño: vote-casting (Backlog #14 — Emisión del voto en 3 pasos)

## Enfoque técnico

Un módulo backend **nuevo** `apps/backend/src/votos/` (`VotosModule`, `VotosController`,
`VotosService`, `votos.errors.ts`, `dto/`) — el primero orientado al **votante**, no a la gestión:
todos los controladores existentes llevan `@Roles('administrador','director','comite')` a nivel de
clase, así que un `estudiante` autenticado hoy no puede leer ni una lista. La autorización de este
módulo no es por rol sino por **pertenencia del `DerechoVoto`** al usuario de la sesión (D1).

El núcleo es un único método `VotosService.emitir()` con una `prisma.$transaction(async (tx) => …)`
interactiva que implementa la garantía de siete pasos de la propuesta sin partirla. Dos decisiones
la hacen estructuralmente correcta en vez de correcta por disciplina: **`now()` en lugar de
`clock_timestamp()`** (D3), porque `now()` es constante dentro de la transacción y por lo tanto la
hora que valida el cierre y la que sella el comprobante **no pueden diferir**; y **una sola
sentencia de bloqueo + validación + idempotencia** (D4), que evita ventanas TOCTOU entre lecturas.

El estado `ejercido` del `DerechoVoto` **no se materializa como columna** (D2): se deriva de la
existencia de la fila `Voto`, que ya está protegida por `@@unique([proceso_id, derecho_voto_id])`.
Esto resuelve la pregunta abierta que dejó `#13` y mantiene la promesa de la propuesta de que este
change no introduce ninguna migración.

En frontend, ruta dedicada `/votar/:derechoVotoId` con contenedor `VotacionPage` (todos los
efectos) + piezas presentacionales en `votos/piezas/`, espejo literal del par
`AperturaProcesoPage` + `piezas/PanelConfirmacionApertura` de `#13`.

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Ubicación y autorización | Módulo nuevo `src/votos/` con `@UseGuards(AuthGuard)` **sin** `@Roles` (cualquier sesión válida); la autorización real es `DerechoVoto.usuario_id === sesion.userId`, verificada dentro de la transacción | Agregar `POST /votos` a `ProcesosModule`; `@Roles('estudiante','docente')` | `ProcesosModule` es gestión (`@Roles` de clase con los tres roles administrativos) y meter ahí la superficie del votante obligaría a una excepción de método que el proyecto no tiene en ningún controlador. Enumerar roles votantes tampoco sirve: en `comunidad` vota cualquier rol que tenga un `DerechoVoto`, y el padrón congelado de `#13` **es** la lista de autorización — un `@Roles` sería una segunda fuente de verdad que puede contradecirla |
| D2 | `DerechoVoto.estado` (pregunta abierta de `#13`) | **Derivado, sin columna nueva y sin migración**: "ejercido" ⇔ existe `Voto` con ese `derecho_voto_id`. El paso 5 de la propuesta ("marcar `estado='ejercido'`") queda satisfecho **por la inserción misma**, dentro de la misma transacción | Agregar `estado EstadoDerecho @default(pendiente)` con migración; enum `CalidadVotante` | Una columna de estado es una caché denormalizada de un hecho que el `@@unique([proceso_id, derecho_voto_id])` ya hace consultable en O(1), y una caché puede **discrepar** de la realidad (voto insertado sin voltear la bandera, backfill, corrección manual) justo en el dato del que depende "0 votos duplicados". Sin columna no hay discrepancia posible. Además evita una migración que la propuesta declara inexistente y no ata `#13` (ya archivado) a decisiones de `#14`. **Costo real:** cada consulta de "ya votó" es un `EXISTS`/join en vez de una lectura de columna — irrelevante con el índice único que ya existe |
| D3 | Reloj autoritativo | **`now()` (= `transaction_timestamp()`), evaluado en SQL dentro de la transacción**, tanto para la comparación `[apertura_real, fecha_cierre_prevista)` como para `Voto.hora_servidor` (que conserva su `@default(now())` del schema) | `clock_timestamp()` (elección de `#13` D3); `Date.now()` de Node; leer el instante y reenviarlo como parámetro | `now()` es **constante durante toda la transacción**: el criterio de éxito "la hora almacenada y la validación de cierre usan el mismo instante" pasa de ser una promesa del código a una garantía del motor, imposible de romper en un refactor. `#13` necesitaba lo contrario (el instante **más tardío** de una transacción larga que materializa miles de filas, por eso `clock_timestamp()`); la transacción del voto dura milisegundos y necesita **un** instante compartido. Reenviar el instante desde Node truncaría la precisión de µs a ms al pasar por `Date` y reintroduciría el reloj del proceso en el camino. **Verificar en apply**: que Prisma no envíe `hora_servidor` desde el cliente (debe caer al `DEFAULT CURRENT_TIMESTAMP` de la tabla); si lo enviara, la inserción pasa a `$queryRaw` con `now()` explícito |
| D4 | Bloqueo + validación + idempotencia | **Una sola sentencia** `tx.$queryRaw` con `SELECT … FROM "DerechoVoto" dv JOIN "ProcesoElectoral" p … WHERE dv.id = $1 FOR UPDATE OF dv`, que devuelve en una vuelta: dueño, estado del proceso, banderas de ventana horaria calculadas en SQL, aula defensiva (D8), `Voto` existente por derecho y `Voto` existente por clave de idempotencia | `findUnique` + `findFirst` encadenados; `SELECT … FOR UPDATE` sin `OF`; comparar fechas en TypeScript | Cada lectura separada abre una ventana TOCTOU; una sola sentencia toma **una** decisión con **un** snapshot y **un** `now()`. `FOR UPDATE` **sin** `OF dv` bloquearía también la fila de `ProcesoElectoral`, serializando *toda* la votación del proceso en una única fila caliente — el peor error de rendimiento posible en la jornada; `OF dv` bloquea exclusivamente el derecho. La comparación de fechas va en SQL porque las columnas son `Timestamptz(3)` y `now()` tiene precisión de µs: comparar en JS truncaría a ms y podría aceptar un voto hasta 1 ms después del cierre |
| D5 | Colisión `23505` | Capturarla **fuera** del callback: `try { await this.prisma.$transaction(…) } catch (e) { if (esColisionDeVoto(e)) return this.comprobanteExistente(...) }`, con la re-consulta en una conexión limpia. Se reconocen **las dos** restricciones: `Voto_proceso_id_derecho_voto_id_key` y `Voto_proceso_id_clave_idempotencia_key` | Capturar dentro del callback y re-consultar con `tx`; traducir `P2002` a `409`; dejarlo burbujear | Tras un `23505`, Postgres deja la transacción **abortada**: cualquier sentencia posterior sobre ese `tx` falla con `25P02`. La re-consulta *tiene* que ocurrir después del rollback, en una transacción nueva — por eso el `catch` vive fuera. Prisma expone el error como `P2002` con `meta.target`; se discrimina por nombre de restricción para no confundir una colisión de voto con cualquier otro `P2002` futuro. Responder `409` contradiría el [ADR-0004] ("nunca una pantalla de error para quien sí votó") |
| D6 | Código HTTP del reintento (**decisión diferida por la propuesta**) | **`201` cuando esta petición creó la fila; `200` cuando devuelve un comprobante preexistente** (reintento con la misma clave *y* colisión `23505`). Se implementa con `@Res({ passthrough: true })` y `res.status(...)`, patrón ya usado en `auth.controller.ts` y `candidatos.controller.ts`. **El cuerpo es idéntico en ambos casos**, sin bandera `ya_registrado` | `201` siempre; `200` siempre; bandera `ya_registrado` en el cuerpo con `200` fijo | `201 Created` afirma que *esta* petición creó el recurso; repetirlo en un reintento vuelve la respuesta indistinguible y hace inauditable, desde los logs de acceso, cuántos votos se crearon realmente. `200` para ambos caminos de "ya existía" es la lectura correcta de HTTP y la recomendación explícita de la propuesta. Sin bandera en el cuerpo: el cliente muestra el mismo comprobante en los tres casos (mismo criterio "silencioso" que `#13` D5), y quien necesita distinguir —observabilidad, tests— lee el status |
| D7 | Mecanismo de idempotencia | Lectura de `Voto` por `(proceso_id, clave_idempotencia)` **dentro de la misma sentencia de D4** (sirve el `@@unique([proceso_id, clave_idempotencia])` ya existente); sin tabla de claves ni cabecera `Idempotency-Key` | Tabla `ClaveIdempotencia` propia; cabecera HTTP en vez de campo del cuerpo; TTL de claves | El schema de `#2` ya trae la columna y su índice único: una tabla aparte agregaría una escritura y una migración para el mismo efecto. El campo en el cuerpo es lo que fija el [ADR-0004] y lo que la propuesta describe. Sin TTL: la clave vive lo que vive el proceso electoral, y `sessionStorage` la descarta al cerrar la pestaña |
| D8 | Causa de rechazo 5, "aula que no corresponde" (**decisión diferida por la propuesta**) | **Sin pantalla propia y sin código de error propio.** Se implementa como `EXISTS (SELECT 1 FROM "ProcesoAula" pa WHERE pa.proceso_id = dv.proceso_id AND pa.aula_id = dv.aula_snapshot)` dentro de la sentencia de D4. Si falla ⇒ misma respuesta y misma pantalla que la causa 2 (`SIN_DERECHO`, "No estás en el padrón"), pero con `motivo: 'aula_no_corresponde'` en el payload del evento `RECHAZO` | Quinta pantalla y quinto código; omitir la comprobación por inalcanzable | `#13` congela `aula_snapshot` copiándolo de `ProcesoAula` en la apertura, así que el caso es **estructuralmente inalcanzable** salvo que `#13` tenga un defecto; darle pantalla propia obligaría a redactar, traducir y mantener una interfaz para un estado que nadie debería ver jamás. Borrar la comprobación, en cambio, dejaría el defecto de `#13` invisible: el `motivo` distinto en auditoría lo hace detectable con una consulta, sin superficie de UI. El costo es una búsqueda por el índice único `(proceso_id, aula_id)` que ya existe: efectivamente gratis |
| D9 | Taxonomía de rechazos | `votos.errors.ts` nuevo (mismo formato `as const` + union que `procesos.errors.ts`) con **cuatro** códigos: `SIN_DERECHO`, `VOTACION_CERRADA`, `DERECHO_YA_EJERCIDO`, `ELECCION_INVALIDA`, más `CAMPO_INVALIDO`. La causa 1 (derecho ajeno **o inexistente**) responde `403` **sin cuerpo discriminante** | Extender `procesos.errors.ts`; `404` para derecho inexistente | Cada módulo tiene su catálogo local (`users`, `academico`, `procesos`): compartirlo acoplaría dos módulos por un enum. `403` idéntico para "ajeno" e "inexistente" cierra el oráculo de enumeración: con `404` para inexistente, cualquier sesión podría barrer UUIDs y descubrir qué derechos existen (ver Threat Matrix) |
| D10 | `RECHAZO` en transacción propia | Excepción interna tipada `RechazoVoto` lanzada **dentro** del callback (lo que revierte la transacción del voto sin escribir nada), capturada fuera, seguida de `this.prisma.$transaction((tx) => this.auditoria.log(tx, 'RECHAZO', …))` —una transacción nueva y exitosa— y recién después el `throw` de la excepción HTTP | Registrar `RECHAZO` con el mismo `tx` antes de abortar; `try/catch` en el controlador | Registrar con el `tx` que se va a revertir borraría el evento junto con el rollback — el rechazo dejaría de tener rastro durable, que es exactamente lo que la propuesta y `#3` prohíben. Lanzar y capturar deja la transacción del voto sin ninguna escritura (cero filas `Voto`, sin cambio de estado) y el evento de rechazo commiteado por separado |
| D11 | Auditoría | **Cero claves nuevas**: `VOTO` y `RECHAZO` ya existen en `audit-event-types.ts` desde `#3` y la cláusula `WHEN` del trigger de [ADR-0016] **ya las cubre** — este change no necesita ninguna migración de trigger. Payloads canónicos: `VOTO` ⇒ `{ proceso_id, derecho_voto_id, codigo_comprobante, hora_servidor }` sobre `entity_type='Voto'`, `entity_id=voto.id`; `RECHAZO` ⇒ `{ proceso_id, derecho_voto_id, motivo }` sobre `entity_type='DerechoVoto'` | Claves `VOTO_EMITIDO`/`VOTO_RECHAZADO`; un motivo por clave de evento | `#14` es el **primer emisor** de las dos claves que `#3` declaró; inventar variantes las dejaría fuera del `WHEN` del trigger y desactivaría en silencio la garantía del [ADR-0016] — el peor resultado posible. El `motivo` viaja en el payload, no en el tipo de evento, por la misma razón por la que `#12` no creó una clave por campo editado. Ningún payload lleva `candidato_id`/`lista_id`/`opcion_id`/`blanco`/`eleccion`, y se aserta en tests propios además del trigger. Se agrega la entrada de bitácora al comentario del archivo, como todos los changes anteriores |
| D12 | Código de comprobante | **Derivado determinísticamente de `Voto.id`**, generado en Node antes del `create` (`const id = randomUUID()`): Crockford Base32 de los **primeros 80 bits** del UUID ⇒ 16 caracteres agrupados `XXXX-XXXX-XXXX-XXXX`, alfabeto sin `I`/`L`/`O`/`U` | Código aleatorio independiente con verificación de unicidad; UUID completo tal cual; truncar a 32 bits | Derivarlo del `id` evita una segunda fuente de aleatoriedad y **cualquier** verificación de unicidad dentro de la transacción crítica: si el `id` es único, el código lo es. 80 bits hacen la colisión inconcebible a escala escolar (el `@unique` de la columna sigue siendo la red final); 32 bits no lo serían. El alfabeto Crockford existe para que el comprobante se pueda dictar por teléfono sin ambigüedad `0/O`, `1/I/L` — requisito implícito del [ADR-0013] (contingencia manual de la jornada) |
| D13 | Lectura de la papeleta | Un endpoint **nuevo** `GET /votos/papeleta/:derechoVotoId` en el mismo módulo, que devuelve en **una** llamada todo lo que necesitan los 3 pasos: proceso (nombre, descripción, `fecha_cierre_prevista`), banda de calidad, opciones de la papeleta según `tipo` (listas/candidatos/opciones **activos**) y el estado derivado del derecho (con comprobante si ya votó). **No es la validación**: es sólo UX y **no emite `RECHAZO`** | Abrir los `GET` de `/listas`, `/candidatos`, `/opciones` al votante; tres llamadas desde el cliente | Abrir los endpoints de gestión al votante expondría el catálogo completo de todos los procesos, incluidas listas dadas de baja y datos administrativos, a cualquier sesión — superficie desproporcionada para pintar una papeleta. Una sola llamada acotada al derecho propio entrega exactamente lo que ese votante puede ver y nada más. Que **no** sea la validación es esencial: si el cliente pudiera confiar en esta lectura, volvería el TOCTOU que la propuesta desarma |
| D14 | Superficie de UI | Ruta `/votar/:derechoVotoId` ⇒ variante `{ nombre: 'votacion'; derechoVotoId }` en `rutas.ts` + caso en `Enrutador.tsx`; contenedor `votos/VotacionPage.tsx` (todos los efectos y el estado de paso) + piezas presentacionales puras. Las pantallas de rechazo son **una sola pieza parametrizada** `PantallaRechazo` con cuatro variantes (`sin-padron`, `cerrada`, `ya-votaste`, `sin-conexion`) | Cinco componentes de rechazo; asistente con rutas por paso (`/votar/:id/paso/2`) | Espeja `AperturaProcesoPage` + `piezas/PanelConfirmacionApertura` de `#13` y el asistente de `#11` (los pasos son estado del contenedor, no rutas: el paso 2 no debe ser enlazable ni recargable sin contexto). Cuatro variantes con el mismo layout —icono, título, explicación, acción— en cinco archivos serían cuatro copias de la misma maqueta; la quinta "pantalla" de `Design.md` (`1c`, "sin conexión") es un estado del **cliente**, no una respuesta del servidor, y por eso vive en la misma pieza sin código de error asociado |
| D15 | Clave de idempotencia en el cliente | `crypto.randomUUID()` generada **al entrar al paso 3**, persistida en `sessionStorage` bajo `seei:voto:{procesoId}:{derechoVotoId}`, escrita **antes** del `POST` y **nunca borrada** durante la sesión. Si `sessionStorage` no está disponible (modo privado), fallback a un `useRef` en memoria | `localStorage`; generar la clave en el paso 1; regenerarla en cada intento; borrarla tras el éxito | `sessionStorage` muere con la pestaña, que es exactamente el alcance del "mismo intento conceptual" que la clave protege; `localStorage` sobreviviría a la sesión y bloquearía un reintento legítimo tras cerrar el navegador. Generarla en el paso 1 la ataría a una boleta que el votante todavía puede cambiar. Borrarla tras el éxito permitiría que un doble envío tardío entrara como intento nuevo — inofensivo (lo frena el `UNIQUE`) pero convertiría un `200` limpio en un camino de colisión. El fallback en memoria degrada a "protege el doble clic pero no la recarga", que sigue siendo estrictamente mejor que no tener clave |
| D16 | Punto de extensión de `#15` | Marcador literal `// [#15] Punto de extensión JobCorreo` inmediatamente después del `auditoria.log(tx, 'VOTO', …)` y antes de que el callback retorne, con **ADR-0018 nuevo** (`adrs/0018-ventana-temporal-jobcorreo-diferido.md`) que registra la desviación temporal, veta el despachador desacoplado y fija su condición de cierre | Enmendar los [ADR-0006]/[ADR-0012]; dejar la desviación sólo como riesgo de la propuesta | Enmendar los ADR convertiría una desviación acotada en un cambio de rumbo permanente y reabriría el hallazgo A1 de forma definitiva. Un riesgo en la propuesta se archiva con el change y deja de ser visible, mientras la regla que se desvía vive en dos ADR. El ADR nuevo cumple la obligación 4 de la propuesta y la regla `design` de `openspec/config.yaml` ("no contradecir los ADR existentes en silencio") |

## Taxonomía de rechazos

| Causa | Detección | HTTP | `codigo` | Pantalla | Evento `RECHAZO` | `motivo` en payload |
|---|---|---|---|---|---|---|
| 1 — derecho ajeno **o inexistente** | `dv.usuario_id !== sesion.userId`, o 0 filas en D4 | `403` | *(sin cuerpo discriminante, D9)* | Redirección a `/` | **No** (autorización, no negocio) | — |
| 2 — sin derecho válido en el proceso | Aula defensiva de D8 falla; proceso del derecho inconsistente | `409` | `SIN_DERECHO` | "No estás en el padrón" | Sí | `aula_no_corresponde` |
| 3 — proceso cerrado / no abierto | `p.estado <> 'abierto'`, o `now() >= fecha_cierre_prevista`, o `apertura_real IS NULL`/`now() < apertura_real` | `409` | `VOTACION_CERRADA` + `{ cierre }` | "Votación cerrada" con la hora exacta | Sí | `proceso_cerrado` \| `proceso_no_abierto` |
| 4 — derecho ya ejercido | Existe `Voto` para `(proceso_id, derecho_voto_id)` con **otra** clave de idempotencia | `200` (comprobante) | — | Comprobante ya emitido | Sí | `derecho_ya_ejercido` |
| 5 — aula que no corresponde | **Plegada en la causa 2** (D8) | — | — | — | — | — |
| — elección inválida | Ninguna o más de una de `{lista_id, opcion_id, candidato_id, blanco}`; referencia ajena al proceso o dada de baja | `400`/`409` | `CAMPO_INVALIDO` / `ELECCION_INVALIDA` | Error en línea en el paso 2 | No | — |
| — sin conexión | El cliente nunca recibe respuesta | — | — | "Sin conexión al confirmar" (D14) | No (el servidor no lo sabe) | — |

La causa 4 **no** es un error: la propuesta y el [ADR-0004] exigen devolver el comprobante ya
emitido. El evento `RECHAZO` se registra igual, porque hubo una decisión de negocio auditable.

## Flujo de datos

```
POST /votos   { derecho_voto_id, eleccion:{lista_id|opcion_id|candidato_id|blanco}, clave_idempotencia }
  └→ AuthGuard (sin RolesGuard — D1)
     └→ VotosService.emitir(dto, sesion)
          ├─ validarEleccionExactamenteUna(dto)                      ⇒ 400 CAMPO_INVALIDO
          └─ try { prisma.$transaction(tx):                                        ← D4/D5
               1. tx.$queryRaw`SELECT dv.id, dv.usuario_id, dv.proceso_id,
                       p.estado, p.fecha_cierre_prevista, p.apertura_real, p.tipo,
                       now() AS ahora,
                       (now() >= p.fecha_cierre_prevista)          AS cerrado_por_hora,
                       (p.apertura_real IS NULL OR now() < p.apertura_real) AS aun_no_abierto,
                       EXISTS(… "ProcesoAula" pa … pa.aula_id = dv.aula_snapshot)  AS aula_valida,
                       (SELECT v.id            FROM "Voto" v  WHERE v.derecho_voto_id = dv.id) AS voto_id,
                       (SELECT v2.codigo_comprobante FROM "Voto" v2
                          WHERE v2.proceso_id = dv.proceso_id
                            AND v2.clave_idempotencia = ${clave})    AS comprobante_por_clave
                     FROM "DerechoVoto" dv
                     JOIN "ProcesoElectoral" p ON p.id = dv.proceso_id
                    WHERE dv.id = ${id}::uuid
                      FOR UPDATE OF dv`                       ← lock SOLO del derecho (D4)
               2. 0 filas | usuario ajeno            ⇒ throw 403                 (causa 1)
               3. comprobante_por_clave IS NOT NULL  ⇒ return { creado:false, … } (D7 ⇒ 200)
               4. !aula_valida                       ⇒ throw RechazoVoto(SIN_DERECHO)      (D8)
                  cerrado_por_hora|aun_no_abierto    ⇒ throw RechazoVoto(VOTACION_CERRADA)
                  voto_id IS NOT NULL                ⇒ throw RechazoVoto(YA_EJERCIDO, comprobante)
               5. validarEleccionPerteneceAlProceso(tx, …)   ⇒ 409 ELECCION_INVALIDA
               6. tx.voto.create({ id, codigo_comprobante: derivar(id), … })
                     ↳ hora_servidor lo pone el DEFAULT now() de la tabla (D3)
                     ↳ 23505 ⇒ la transacción queda abortada; se atrapa AFUERA (D5)
               7. auditoria.log(tx, 'VOTO', usuarioId, 'Voto', voto.id, { … sin elección })
               8. // [#15] Punto de extensión JobCorreo                            (D16)
             } catch (e) {
               esColisionDeVoto(e) ⇒ comprobanteExistente(proceso, derecho)  ⇒ 200   (D5)
               e instanceof RechazoVoto ⇒ $transaction(tx2 ⇒ log RECHAZO) ; throw http (D10)
             }
```

Carrera real de dos transacciones (el caso que `Promise.all` **no** prueba):

```
Transacción A (pg crudo)          Postgres                 Transacción B (endpoint real)
  │ BEGIN                                                     │ BEGIN
  │ SELECT … FOR UPDATE OF dv ─► lock del derecho             │
  │ INSERT INTO "Voto" …  (sin commit)                        │ SELECT … FOR UPDATE OF dv  ⏸ bloqueada
  │                                                           │
  │ COMMIT ───────────────────────►                           │ ⏵ obtiene el lock; su snapshot
  │                                                           │   NO ve el Voto de A ⇒ sigue
  │                                                           │ INSERT "Voto" ⇒ 23505 (índice único)
  │                                                           │ rollback + re-consulta (D5)
  │                                                           │ 200 con el comprobante de A
                       exactamente UNA fila Voto
```

```
Navegación (D14)
  Enrutador
    └ '/votar/:derechoVotoId' → VotacionPage
          ├ paso 1 → PasoInformacionProceso   (+ BandaVotandoComo, siempre visible)
          ├ paso 2 → PasoBoleta               (tarjetas + voto en blanco, borde discontinuo)
          ├ paso 3 → PasoConfirmacion         (resumen + consentimiento + "Registrando…")
          ├ éxito  → PanelComprobante
          └ rechazo→ PantallaRechazo variant=sin-padron|cerrada|ya-votaste|sin-conexion
```

## Contratos HTTP

| Ruta | Cuerpo | Respuestas |
|---|---|---|
| `POST /votos` | `EmitirVotoDto { derecho_voto_id, lista_id?, opcion_id?, candidato_id?, blanco?, clave_idempotencia }` | `201 ComprobanteDto` (creado) · `200 ComprobanteDto` (reintento o colisión, D6) · `400 CAMPO_INVALIDO` · `401` sin cookie · `403` derecho ajeno/inexistente · `409 SIN_DERECHO` / `VOTACION_CERRADA` / `ELECCION_INVALIDA` |
| `GET /votos/papeleta/:derechoVotoId` | — | `200 PapeletaDto` · `401` · `403` derecho ajeno/inexistente |

`ComprobanteDto { codigo_comprobante, hora_servidor, proceso: { id, nombre }, en_calidad_de,
eleccion_resumen }` — el resumen de la elección **sí** viaja al votante (es su propio voto,
[ADR-0006] §2); lo que nunca lo lleva es el payload de auditoría (D11).

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `adrs/0018-ventana-temporal-jobcorreo-diferido.md` | Create | D16 — desviación temporal de los [ADR-0006]/[ADR-0012] (**ya creado por esta fase**) |
| `apps/backend/src/votos/votos.module.ts` | Create | D1 — módulo nuevo, registrado en `app.module.ts` |
| `apps/backend/src/votos/votos.controller.ts` | Create | D1/D6/D13 — `POST /votos` con `@Res({passthrough:true})`, `GET /votos/papeleta/:id` |
| `apps/backend/src/votos/votos.service.ts` | Create | D2-D5, D7, D8, D10, D12, D16 — la transacción completa |
| `apps/backend/src/votos/papeleta.service.ts` | Create | D13 — lectura de la papeleta (separada del camino de escritura) |
| `apps/backend/src/votos/votos.errors.ts` | Create | D9 — catálogo local (4 códigos + `CAMPO_INVALIDO`) |
| `apps/backend/src/votos/comprobante.ts` | Create | D12 — derivación Crockford Base32 desde `Voto.id` |
| `apps/backend/src/votos/dto/emitir-voto.dto.ts` · `comprobante.dto.ts` · `papeleta.dto.ts` | Create | DTO planos con `@ApiProperty`, sin `class-validator` (idioma de `#11`-`#13`) |
| `apps/backend/src/app.module.ts` | Modify | Registrar `VotosModule` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modify | D11 — **sin claves nuevas**: sólo la entrada de bitácora que documenta a `#14` como primer emisor de `VOTO`/`RECHAZO` |
| `packages/contracts/openapi.json` · `src/generated/api.d.ts` | Modify | Regenerar (`pnpm openapi:extract`) antes de tocar el frontend |
| `apps/frontend/src/app/rutas.ts` · `rutas.spec.ts` · `Enrutador.tsx` | Modify | D14 — variante `votacion` + caso del `switch` |
| `apps/frontend/src/votos/votos-api.ts` | Create | Wrappers tipados (`emitir`, `papeleta`) sobre `createSeeiClient` |
| `apps/frontend/src/votos/clave-idempotencia.ts` | Create | D15 — `sessionStorage` + fallback en memoria |
| `apps/frontend/src/votos/VotacionPage.tsx` | Create | D14 — contenedor con todos los efectos y el estado de paso |
| `apps/frontend/src/votos/piezas/BandaVotandoComo.tsx` · `PasoInformacionProceso.tsx` · `PasoBoleta.tsx` · `PasoConfirmacion.tsx` · `PanelComprobante.tsx` · `PantallaRechazo.tsx` | Create | D14 — presentacionales puros, sin efectos |
| `apps/backend/test/votos/votos-emitir.e2e-spec.ts` | Create | Camino feliz, idempotencia, 5 causas, blanco, secreto del voto |
| `apps/backend/test/votos/votos-concurrencia.e2e-spec.ts` | Create | Arnés determinista de dos conexiones (ver Estrategia de pruebas) |
| `apps/backend/test/schema/votos-frontera-cierre.spec.ts` | Create | Frontera `[apertura, cierre)` exacta con `pg` crudo |
| `apps/backend/src/votos/votos.service.spec.ts` · `votos.controller.spec.ts` | Create | Unitarias con Prisma mockeado (patrón `procesos.service.spec.ts`) |
| `apps/frontend/src/votos/**/*.spec.tsx` | Create | Vitest + Testing Library, piezas sin efectos |

## Interfaces / Contratos

```ts
// votos.service.ts — D5. El catch VIVE FUERA del callback: tras un 23505 la transacción está
// abortada (25P02) y ninguna sentencia más puede correr sobre ese `tx`.
const RESTRICCIONES_DE_VOTO = [
  'Voto_proceso_id_derecho_voto_id_key',
  'Voto_proceso_id_clave_idempotencia_key',
] as const;

try {
  return await this.prisma.$transaction(async (tx) => { /* pasos 1-8 */ });
} catch (e) {
  if (esColisionDeVoto(e, RESTRICCIONES_DE_VOTO)) {
    // Transacción nueva y limpia: el voto ganador ya está commiteado.
    return this.comprobanteExistente(procesoId, dto.derecho_voto_id);
  }
  if (e instanceof RechazoVoto) {
    await this.prisma.$transaction((tx) =>
      this.auditoria.log(tx, AUDIT_EVENT_TYPES.RECHAZO, sesion.userId, 'DerechoVoto',
        dto.derecho_voto_id, { proceso_id: e.procesoId, derecho_voto_id: dto.derecho_voto_id,
                               motivo: e.motivo })); // D11: jamás la elección
    throw e.aHttp();
  }
  throw e;
}
```

```ts
// D12. Determinista: mismo Voto.id ⇒ mismo código. Sin verificación de unicidad en la
// transacción crítica; el @unique de la columna es la red final, no el mecanismo.
export function derivarComprobante(votoId: string): string; // 'K7QM-3XZ9-8HTB-P4WR'
```

```ts
// votos.errors.ts — D9, mismo formato que procesos.errors.ts
export const VOTOS_ERROR_CODES = {
  CAMPO_INVALIDO: 'CAMPO_INVALIDO',
  SIN_DERECHO: 'SIN_DERECHO',
  VOTACION_CERRADA: 'VOTACION_CERRADA',
  DERECHO_YA_EJERCIDO: 'DERECHO_YA_EJERCIDO',
  ELECCION_INVALIDA: 'ELECCION_INVALIDA',
} as const;
```

Claves de auditoría nuevas: **ninguna** (D11).

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (Jest, backend) | Elección no-exactamente-una ⇒ `400`; mapeo causa ⇒ excepción; `RECHAZO` en `$transaction` separada; payloads sin claves prohibidas; `derivarComprobante` determinista y con alfabeto Crockford | `PrismaService`/`AuditoriaService` mockeados, `$queryRaw` como `jest.fn()` (patrón `procesos.service.spec.ts`) |
| Unit (Vitest, frontend) | `parsearRuta('/votar/<id>')` ida y vuelta; "Continuar" deshabilitado sin selección; el blanco **sólo** por selección explícita; la banda declara la calidad y no permite cambiar de derecho; `PantallaRechazo` por variante; clave de idempotencia estable entre reintentos y fallback sin `sessionStorage` | `@testing-library/react` |
| E2E (Postgres real) | Camino feliz ⇒ `201`, 1 fila `Voto`, evento `VOTO` sin elección; reintento con la misma clave ⇒ `200` + mismo comprobante + sigue 1 fila; segunda clave distinta ⇒ `200` con el comprobante existente; cada causa de rechazo ⇒ código + evento + 0 filas; blanco ⇒ `blanco=true` y el resto `null`; doble derecho ADR-0011 ejercido por separado; `hora_servidor` entre dos `clock_timestamp()` de la propia base | `test/votos/votos-emitir.e2e-spec.ts`, patrón de `procesos-abrir.e2e-spec.ts` (fetch contra el servidor real + `PrismaClient` para asertar filas) |
| **Concurrencia determinista** | (a) `pg` crudo hace `BEGIN` + `INSERT "Voto"` **sin commit**; se dispara el `POST /votos` real, que bloquea en el índice único; se commitea el crudo ⇒ el endpoint recibe `23505`, lo captura y responde `200` con el comprobante del crudo. (b) Dos `createPgClient()` coordinados por pasos: ambos `SELECT … FOR UPDATE OF dv` (el segundo bloquea), ambos `INSERT` ⇒ exactamente una fila y `23505` sobre `Voto_proceso_id_derecho_voto_id_key`. (c) Red probabilística: 8 `POST` con `Promise.all` ⇒ 1 fila, 0 respuestas `5xx` | `test/schema/helpers/pg-client.ts` (`createPgClient`, `withTransaction`) + `fetch`. **(a) es la prueba fuerte**: no depende de ninguna sincronización afortunada y ejercita el `catch` real del servicio, no una simulación en SQL |
| **Frontera de cierre (determinista, sin reloj inyectable)** | Dentro de **una misma transacción** de `pg` crudo: `UPDATE … SET fecha_cierre_prevista = now()` y luego evaluar `now() >= fecha_cierre_prevista` ⇒ **true** (rechazado, frontera exacta, cierre cerrado por arriba); con `now() + interval '1 second'` ⇒ **false** (aceptado a `cierre − 1s`). Como `now()` es constante en la transacción (D3), el caso de igualdad exacta es reproducible al 100% | `test/schema/votos-frontera-cierre.spec.ts`. En e2e la ventana se siembra con instantes calculados **por Postgres** (nunca `Date.now()` de Node) y con margen de 60 s para el caso aceptado, para no depender de la latencia de CI. **Nota de precisión:** `fecha_cierre_prevista` es `Timestamptz(3)` y `now()` tiene µs — por eso el caso "aceptado" usa 1 s, no 1 µs |
| Schema | `Voto_proceso_id_derecho_voto_id_key` y `Voto_proceso_id_clave_idempotencia_key` existen y devuelven `23505`; el `CHECK` de exactamente una elección rechaza 0 y 2 elecciones; el trigger de [ADR-0016] rechaza un `RECHAZO` con `candidato_id` anidado (`AU002`) | `test/schema/voting.spec.ts` + `auditoria.spec.ts` (`expect-pg-error.ts`) |
| Contract | `pnpm openapi:extract` sin Postgres ni Redis; `POST /votos` aparece con `201` **y** `200` documentados | Job de CI existente |

TDD estricto: cada fila anterior se escribe en RED antes del código que la satisface.

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| IDOR / enumeración sobre `derecho_voto_id` | Votar con el derecho de otro; barrer UUIDs para descubrir derechos ajenos; usar el derecho `padre` de otra familia | **Applicable** — es el parámetro de autorización del endpoint | Pertenencia verificada **dentro** de la transacción (D4); `403` idéntico para ajeno e inexistente (D9), sin `404` que actúe de oráculo; `GET /votos/papeleta/:id` aplica la misma regla | Derecho ajeno ⇒ `403` sin evento `RECHAZO`; UUID inexistente ⇒ `403` con **el mismo cuerpo**; 0 filas `Voto` en ambos |
| TOCTOU / concurrencia | Dos pestañas; doble clic; votar exactamente en el instante de cierre; proceso cerrado entre el paso 1 y el paso 3 | **Applicable** — es el núcleo del change | Validación y escritura en la misma transacción con **un** `now()` (D3/D4); `FOR UPDATE OF dv`; `UNIQUE` + captura de `23505` (D5) como garantía real | Los tres arneses de concurrencia; frontera de cierre exacta; proceso cerrado tras leer la papeleta |
| Secreto del voto en auditoría | `RECHAZO` con el estado del formulario; `candidato_id` anidado en `{detalle:{…}}`; `eleccion` como sinónimo | **Applicable** — [ADR-0010]/[ADR-0016] | Payloads canónicos y cerrados (D11), construidos por el servicio, nunca por *spread* del DTO; trigger `AU002` como segunda barrera | Asserts sobre el payload construido **y** un `INSERT` directo con clave anidada ⇒ `AU002` |
| SQL crudo parametrizado (D4) | `derecho_voto_id` no-UUID; `'; DROP …`; literal de enum inválido | **Applicable** — una sentencia cruda en el camino crítico | Plantilla etiquetada de Prisma (`$1`, nunca concatenación) + cast `::uuid`; `ParseUUIDPipe` en el `GET`, validación de formato en el `POST` antes de abrir la transacción | Payload de inyección ⇒ `400`, 0 filas afectadas |
| Integridad de la elección | Votar por una lista de **otro** proceso; candidato dado de baja; blanco + lista a la vez; ninguna elección | **Applicable** | `CHECK` de `#2` (exactamente una) + verificación de pertenencia y `estado='activo'` dentro de la transacción (D9) | Los cuatro casos ⇒ `400`/`409`, 0 filas `Voto` |
| Enrutamiento (cliente) | `/votar/<id>` sin sesión; `:id` no-UUID; `/votar/../..` | **Applicable** | El enrutador sigue montado dentro de `AuthGuard` (`#12` D11); `parsearRuta` sigue siendo total ⇒ `no-encontrada` | Sin sesión ⇒ `LoginPage`; segmentos `..` ⇒ `no-encontrada` |
| Almacenamiento en el cliente (D15) | Leer la clave de idempotencia de otra pestaña; manipularla desde la consola | **Applicable** | La clave **no es un secreto ni una credencial**: manipularla sólo puede provocar un intento nuevo, que el `UNIQUE` frena. `sessionStorage` (no `localStorage`) acota su vida a la pestaña | Clave manipulada ⇒ sigue existiendo exactamente 1 fila `Voto` |
| Shell / subprocesos / Git / PR / clasificación de archivos ejecutables | — | N/A: el change no ejecuta shell, no toca Git ni automatiza PR, no sube ni sirve archivos | — | — |

## Migración / Rollout

**Sin migración de base de datos** (D2/D11): el schema de `#2` ya trae `Voto` con sus dos
restricciones únicas, `codigo_comprobante`, `clave_idempotencia` y `hora_servidor`; el trigger del
[ADR-0016] ya cubre `VOTO`/`RECHAZO`. Sólo código de aplicación y contrato.

| # | Paso | Verificación de salida |
|---|---|---|
| R1 | Confirmar la cadena de dependencias desplegada (`#13` incluido: hay `DerechoVoto` materializados) | `SELECT count(*) FROM "DerechoVoto" WHERE proceso_id = …` > 0 |
| R2 | Desplegar backend | `POST /votos` responde `403` con un derecho ajeno y `201` con uno propio en un proceso de prueba |
| R3 | `pnpm openapi:extract` y commit del contrato | El frontend no compila contra `/votos` hasta este paso |
| R4 | Desplegar frontend | Recorrido de 3 pasos completo en móvil; reintento del `POST` ⇒ `200` sin fila nueva |
| R5 | **Restricción operativa mientras `#15` no exista (ADR-0018)** | No abrir un proceso electoral **real** en producción sin `#15` desplegado: un voto emitido en esa ventana puede quedar sin copia por correo y no hay forma de detectarlo |

Rollback: `git revert` de los PR. No hay migración que revertir y ningún `Voto` ya confirmado se
pierde — el revert sólo detiene la emisión de votos nuevos.

**Corte de PR sugerido para `sdd-tasks`** (pronóstico de la propuesta: 900-1500 líneas, muy por
encima del presupuesto de 400). La restricción de no-descomposición del `BACKLOG.md` obliga a que
validación + `UNIQUE` + idempotencia viajen en el **mismo** slice: **PR1** módulo, `votos.errors.ts`,
comprobante, `GET /votos/papeleta` + tests; **PR2** la transacción completa + `POST /votos` +
auditoría + unit/e2e (la garantía entera, indivisible); **PR3** arnés de concurrencia + frontera de
cierre; **PR4** ruta, `VotacionPage` y los 3 pasos; **PR5** pantallas de rechazo, banda y
comprobante.

## Reconciliación con la spec de este change

| Texto de `specs/vote-casting/spec.md` | Estado |
|---|---|
| "marca `DerechoVoto.estado = 'ejercido'`" (Requirement "Transacción atómica única") | **Requiere enmienda `MODIFIED` antes de `sdd-apply`** (D2): la columna no existe y este change no la crea; el estado se deriva de la existencia de la fila `Voto`, dentro de la misma transacción. El efecto observable —"el derecho queda ejercido si y sólo si el voto existe"— es idéntico y **más fuerte** (no puede discrepar). El escenario "Camino feliz" debe pasar a asertar el `Voto` en vez de la columna |
| "usando `now()`/`clock_timestamp()`" | **Compatible.** D3 elige `now()` de las dos opciones que la spec ya admite |
| "responde con la pantalla de votación cerrada / ya votaste" | **Compatible.** Ver Taxonomía de rechazos; la causa 4 responde `200` con el comprobante, no un error |
| Requirement "Secreto del voto", "Boleta de 3 pasos", "Doble derecho", "Punto de extensión" | **Compatible** sin cambios (D11, D14, D16) |

## Preguntas abiertas

- [ ] La enmienda `MODIFIED` de la spec por D2 (`DerechoVoto.estado` derivado) debe aplicarse antes
      de `sdd-apply`; hasta entonces, spec y diseño discrepan en la letra.
- [ ] El votante no tiene forma de **descubrir** el enlace `/votar/:derechoVotoId` dentro de la app:
      "Mis votaciones" es `#16`/`#20` por decisión de la propuesta. Entretanto la entrada es por
      enlace directo (e2e y QA manual). ¿`#16` se adelanta, o se acepta la brecha?
- [ ] `en_calidad_de` sigue siendo `String` libre (pregunta abierta de `#13`). Este change lo lee
      como unión TS local; promoverlo a enum `CalidadVotante` exigiría una migración que la
      propuesta excluye.
- [ ] Alta fidelidad inexistente para las pantallas de rechazo y la banda de calidad
      (`Design.md` las marca "Pendiente en alta fidelidad"): este change las produce con tokens
      vigentes de `index.css`, sin tokens nuevos, y quedan sujetas a revisión de diseño.
- [ ] Criterio "< 3 minutos en móvil" del PRD: no verificable con TDD automatizado; requiere
      validación con usuarios reales.
