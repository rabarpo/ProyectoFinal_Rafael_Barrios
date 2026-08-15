# Tasks: vote-casting (Backlog #14 — Emisión del voto en 3 pasos)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~150-200 / PR2 ~400-550 / PR3 ~350-450 / PR4 ~250-350 / PR5 ~350-450 / PR6 ~250-350 (~1750-2350 total, within proposal's 900-1500+ order of magnitude once tests are counted) |
| 400-line budget risk | PR1 Low / PR2 High / PR3 High (borderline) / PR4 Medium-High / PR5 High (borderline) / PR6 Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR1 módulo+errores+comprobante+papeleta → PR2 transacción núcleo (indivisible) → PR3 controller+e2e principal → PR4 concurrencia+frontera de cierre → PR5 UI routing+3 pasos → PR6 pantallas de rechazo+banda+comprobante |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain (resolved at apply time) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

**Revisión del corte de 5 PR de `design.md`**: `design.md` propone PR2 = "la transacción completa +
`POST /votos` + auditoría + unit/e2e (la garantía entera, indivisible)". Presupuestando línea por
línea eso solo (D2-D5, D7, D8, D10, D12, D16 + controller + DTOs + `votos.service.spec.ts` con 15+
casos RED + `votos.controller.spec.ts` + `votos-emitir.e2e-spec.ts` con 10+ escenarios) supera
holgadamente 900-1000 líneas en un solo PR. La restricción de no-descomposición del `BACKLOG.md`
protege **la garantía transaccional en sí** (validación + `UNIQUE` + idempotencia viviendo en el
mismo método, `VotosService.emitir()`) — no exige que la prueba unitaria, el wiring HTTP y la
prueba e2e vivan en el mismo PR una vez que la garantía ya está completa e indivisa en PR2. Este
plan **deviates** del corte de `design.md` partiendo su PR2 en dos: **PR2** (`VotosService.emitir()`
completo, indivisible, + sus unit tests con Prisma mockeado) y **PR3** (`votos.controller.ts` +
DTOs + `votos.controller.spec.ts` + la suite e2e principal que prueba la misma garantía end-to-end).
Ningún slice separa `UNIQUE` de idempotencia o de validación — todas viven juntas en PR2. PR1, PR4
(concurrencia, sin tocar, mismo aislamiento que pide la constraint del usuario), PR5 y PR6 siguen el
corte original de `design.md` (sus PR1, PR3, PR4, PR5).

### Suggested Work Units

| Unit | Goal | PR | Base | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|------|----------------------|-----------------|-------------------|
| 1 | Módulo `VotosModule`, `votos.errors.ts` (D9), `comprobante.ts` (D12), `papeleta.service.ts` + `GET /votos/papeleta/:id` (D13), registro en `app.module.ts` | PR 1 | tracker | `pnpm --filter @seei/backend test -- votos` | Unit con `PrismaService` mockeado | `git revert` PR1; sin `POST /votos` expuesto aún |
| 2 | `VotosService.emitir()` completo: sentencia única D4 (lock+validar+idempotencia), captura `23505` fuera del callback (D5), `RechazoVoto` + transacción `RECHAZO` separada (D10), derivación de comprobante (D12), marcador D16 | PR 2 | PR1 | `pnpm --filter @seei/backend test -- votos.service` | Unit con `$queryRaw` como `jest.fn()` (patrón `procesos.service.spec.ts`) | `git revert` PR2; PR1 sin consumidor aún |
| 3 | `votos.controller.ts` (`POST /votos`, D6 status codes vía `@Res({passthrough:true})`), `emitir-voto.dto.ts`/`comprobante.dto.ts`, suite e2e principal (`votos-emitir.e2e-spec.ts`) | PR 3 | PR2 | `pnpm --filter @seei/backend test:e2e -- votos-emitir` | `test:e2e` contra Postgres real (Docker) | `git revert` PR3; PR1-PR2 no afectados |
| 4 | Arnés de concurrencia determinista (3 casos, incl. `pg` crudo sin commit) + frontera de cierre exacta | PR 4 | PR3 | `pnpm --filter @seei/backend test:e2e -- votos-concurrencia` + `pnpm --filter @seei/backend test -- votos-frontera-cierre` | Postgres real (Docker) + `test/schema/helpers/pg-client.ts` existente | `git revert` PR4; garantía de PR2/PR3 no afectada, sigue probada por sus propios tests |
| 5 | Ruta `/votar/:derechoVotoId`, `VotacionPage`, `votos-api.ts`, `clave-idempotencia.ts`, `PasoInformacionProceso`/`PasoBoleta`/`PasoConfirmacion` | PR 5 | PR4 | `pnpm --filter @seei/frontend test -- Votacion` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR5; backend no afectado |
| 6 | `PantallaRechazo` (4 variantes), `BandaVotandoComo`, `PanelComprobante`, wiring final en `VotacionPage` | PR 6 | PR5 | `pnpm --filter @seei/frontend test -- Rechazo` | Testing Library | `git revert` PR6; PR5 sigue funcional sin pantallas de rechazo dedicadas (fallback genérico) |

**Bloqueo previo a cualquier PR**: la cadena de dependencias `#1→#2→#3→#4→#7→#8/#10→#11→#12→#13`
debe tener `sdd-apply` completo antes de iniciar PR1 (ver proposal.md). `adrs/0018-ventana-temporal-
jobcorreo-diferido.md` (D16) ya fue creado en la fase de diseño — no es una tarea de este documento.

## PR 1 — Módulo, errores, comprobante y lectura de papeleta (base = feature/tracker branch)

### Phase 1: Módulo y catálogo de errores (D1, D9)
- [x] 1.1 Crear `apps/backend/src/votos/votos.module.ts`: `VotosController`, `VotosService`,
      `PapeletaService`, `AuthGuard` sin `RolesGuard` (D1)
- [x] 1.2 Crear `apps/backend/src/votos/votos.errors.ts`: `SIN_DERECHO`, `VOTACION_CERRADA`,
      `DERECHO_YA_EJERCIDO`, `ELECCION_INVALIDA`, `CAMPO_INVALIDO` (D9, mismo formato que
      `procesos.errors.ts`)
- [x] 1.3 Modificar `apps/backend/src/app.module.ts`: registrar `VotosModule`

### Phase 2: Código de comprobante (D12)
- [x] 2.1 RED unit: `derivarComprobante(votoId)` es determinista — mismo UUID produce siempre el
      mismo código de 16 caracteres agrupados `XXXX-XXXX-XXXX-XXXX`
- [x] 2.2 RED unit: el alfabeto de salida excluye `I`/`L`/`O`/`U` (Crockford Base32)
- [x] 2.3 GREEN: crear `apps/backend/src/votos/comprobante.ts` — pasa 2.1-2.2

### Phase 3: Lectura de papeleta (D13)
- [x] 3.1 RED unit: `GET /votos/papeleta/:id` con derecho propio devuelve proceso, banda de
      calidad, opciones activas del tipo (listas/candidatos/opciones), y comprobante si ya votó
- [x] 3.2 RED unit: derecho ajeno o inexistente → `403` sin cuerpo discriminante (D9, mismo
      criterio que la causa 1 de rechazo del voto)
- [x] 3.3 RED unit: la lectura NO emite evento `RECHAZO` bajo ningún caso (D13, no es validación)
- [x] 3.4 GREEN: crear `apps/backend/src/votos/papeleta.service.ts` + `dto/papeleta.dto.ts` +
      caso `GET` en `votos.controller.ts` — pasa 3.1-3.3

### Phase 4: Regresión PR1
- [x] 4.1 `pnpm openapi:extract` sin Postgres/Redis vivos; `pnpm typecheck` verde en los 4 paquetes

## PR 2 — Transacción núcleo de `VotosService.emitir()` (base = PR 1 branch)

### Phase 5: DTOs de entrada (D9)
- [x] 5.1 Crear `apps/backend/src/votos/dto/emitir-voto.dto.ts`: `{ derecho_voto_id, lista_id?,
      opcion_id?, candidato_id?, blanco?, clave_idempotencia }` con `@ApiProperty`

### Phase 6: Sentencia única de lock+validación+idempotencia (D4)
- [x] 6.1 RED unit: elección no-exactamente-una (0 o 2+ de `{lista_id, opcion_id, candidato_id,
      blanco}`) → `400 CAMPO_INVALIDO`, sin abrir transacción [threat matrix: Integridad de la
      elección]
- [x] 6.2 RED unit: `derecho_voto_id` no pertenece al usuario autenticado (`dv.usuario_id !==
      sesion.userId`) o 0 filas → `403`, sin evento `RECHAZO` [spec: Validación del derecho —
      causa 1; threat matrix: IDOR/enumeración]
- [x] 6.3 RED unit: `comprobante_por_clave` no nulo (misma `clave_idempotencia`) → responde con el
      comprobante existente, sin `INSERT` [spec: Reintento con misma clave]
- [x] 6.4 RED unit: `aula_valida = false` (D8) → `RechazoVoto(SIN_DERECHO, motivo:
      'aula_no_corresponde')` [threat matrix: TOCTOU/defensa en profundidad]
- [x] 6.5 RED unit: `cerrado_por_hora` o `aun_no_abierto` → `RechazoVoto(VOTACION_CERRADA)` [spec:
      Proceso cerrado]
- [x] 6.6 RED unit: `voto_id` ya existe para el derecho (clave distinta) →
      `RechazoVoto(DERECHO_YA_EJERCIDO, comprobante)` [spec: Derecho ya ejercido]
- [x] 6.7 GREEN: implementar el `tx.$queryRaw` de D4 (`FOR UPDATE OF dv`, banderas calculadas en
      SQL) — pasa 6.1-6.6

### Phase 7: Inserción, auditoría y punto de extensión (D2, D11, D16)
- [x] 7.1 RED unit: camino feliz — `tx.voto.create()` con `id` generado en Node,
      `codigo_comprobante` derivado, elección validada contra el proceso; `DerechoVoto` queda
      `ejercido` **por la existencia de la fila**, sin columna nueva (D2) [spec: Camino feliz]
- [x] 7.2 RED unit: voto en blanco marcado → `Voto` con `blanco = true` y el resto de columnas de
      elección en `null` [spec: Voto en blanco explícito]
- [x] 7.3 RED unit: elección referencia una lista/candidato/opción de otro proceso o dada de baja →
      `409 ELECCION_INVALIDA`, cero filas `Voto` [threat matrix: Integridad de la elección]
- [x] 7.4 RED unit: tras el `INSERT`, se invoca `auditoria.log(tx, 'VOTO', usuarioId, 'Voto',
      voto.id, { proceso_id, derecho_voto_id, codigo_comprobante, hora_servidor })` — sin
      `candidato_id`/`lista_id`/`opcion_id`/`blanco`/`eleccion` [spec: Payload sin elección; D11]
- [x] 7.5 RED unit: existe el comentario marcador `// [#15] Punto de extensión JobCorreo`
      inmediatamente después del `auditoria.log` y antes del retorno del callback (D16)
- [x] 7.6 GREEN: completar el callback de `emitir()` — pasa 7.1-7.5

### Phase 8: Colisión `23505` y `RECHAZO` en transacción separada (D5, D10)
- [x] 8.1 RED unit: el `catch` vive **fuera** del callback de `$transaction`; ante `P2002` sobre
      `Voto_proceso_id_derecho_voto_id_key` o `Voto_proceso_id_clave_idempotencia_key`, se
      reconsulta el `Voto` existente en una transacción/conexión nueva y se responde con su
      comprobante [spec: Segundo voto genuino con clave distinta; D5]
- [x] 8.2 RED unit: un `P2002` con `meta.target` distinto a las dos restricciones de voto no se
      confunde con una colisión de voto (burbujea o se maneja aparte)
- [x] 8.3 RED unit: `RechazoVoto` capturado fuera del callback dispara `prisma.$transaction((tx) =>
      auditoria.log(tx, 'RECHAZO', ...))` en una transacción nueva y exitosa, **antes** de lanzar
      la excepción HTTP — el evento sobrevive aunque el voto no [spec: Proceso cerrado; Derecho ya
      ejercido; D10]
- [x] 8.4 RED unit: el payload de `RECHAZO` contiene únicamente `{ proceso_id, derecho_voto_id,
      motivo }` — nunca `candidato_id`/`lista_id`/`opcion_id`/`blanco`/`eleccion`, ni el estado del
      formulario [spec: Payload sin elección; threat matrix: Secreto del voto en auditoría]
- [x] 8.5 GREEN: envolver `emitir()` con el `try/catch` de D5/D10 — pasa 8.1-8.4

### Phase 9: Regresión PR2
- [x] 9.1 `pnpm --filter @seei/backend test -- votos.service` verde (suite unit completa)
- [x] 9.2 `pnpm typecheck` verde en los 4 paquetes

## PR 3 — Controller, DTOs de salida y suite e2e principal (base = PR 2 branch)

### Phase 10: Endpoint `POST /votos` y status codes (D6)
- [x] 10.1 Crear `apps/backend/src/votos/dto/comprobante.dto.ts`: `{ codigo_comprobante,
      hora_servidor, proceso: { id, nombre }, en_calidad_de, eleccion_resumen }`
- [x] 10.2 Modificar `apps/backend/src/votos/votos.controller.ts`: `POST /votos` con
      `@Res({passthrough:true})`; `res.status(201)` cuando esta petición creó la fila, `res.status
      (200)` cuando devuelve un comprobante preexistente (reintento o colisión), mismo cuerpo en
      ambos casos, sin bandera `ya_registrado` (D6)
- [x] 10.3 RED unit (controller): camino de creación → `201`; camino de reintento/colisión → `200`
      [spec: Reintento con misma clave; Segundo voto genuino con clave distinta]
- [x] 10.4 GREEN: crear `apps/backend/src/votos/votos.controller.spec.ts` — pasa 10.3

### Phase 11: Suite e2e principal
- [x] 11.1 Crear `apps/backend/test/votos/votos-emitir.e2e-spec.ts` (patrón de
      `procesos-abrir.e2e-spec.ts`: fetch contra el servidor real + `PrismaClient` para asertar
      filas)
- [x] 11.2 RED e2e: camino feliz → `201`, comprobante, una fila `Voto`, `DerechoVoto` `ejercido`
      (derivado), evento `VOTO` sin elección [spec: Camino feliz]
- [x] 11.3 RED e2e: fallo intermedio (payload de auditoría malformado forzado) → rollback completo,
      cero filas `Voto`, `DerechoVoto` sigue `pendiente`, sin evento `VOTO` [spec: Fallo intermedio
      revierte todo]
- [x] 11.4 RED e2e: reintento con la misma `clave_idempotencia` → `200`, mismo comprobante, sigue
      exactamente una fila `Voto` [spec: Reintento con misma clave]
- [x] 11.5 RED e2e: segundo intento con clave distinta sobre el mismo derecho ya ejercido → `200`
      con el comprobante existente, nunca `500`/`409` genérico [spec: Segundo voto genuino con
      clave distinta]
- [x] 11.6 RED e2e: cada una de las causas de rechazo (sin derecho, proceso cerrado, derecho ya
      ejercido) → código/HTTP esperado por la Taxonomía de rechazos, evento `RECHAZO` propio, cero
      filas `Voto` nuevas [spec: Proceso cerrado; Derecho ya ejercido]
- [x] 11.7 RED e2e: derecho ajeno o inexistente → `403` idéntico en ambos casos, sin evento
      `RECHAZO` [threat matrix: IDOR/enumeración]
- [x] 11.8 RED e2e: voto en blanco → `Voto.blanco = true`, resto de columnas de elección `null`
      [spec: Voto en blanco explícito]
- [x] 11.9 RED e2e: doble derecho ADR-0011 (`estudiante`+`padre`) — ejercer uno no afecta el estado
      `pendiente` del otro [spec: Cada derecho se ejerce de forma independiente]
- [x] 11.10 RED e2e: `hora_servidor` del comprobante cae entre dos `clock_timestamp()` de la propia
      base tomados antes/después de la petición, nunca comparado contra `Date.now()` de Node [spec:
      Hora de cierre y de comprobante coinciden]
- [x] 11.11 RED e2e: ningún payload `VOTO`/`RECHAZO` capturado contiene `candidato_id`, `lista_id`,
      `opcion_id`, `blanco` ni `eleccion` [spec: Payload sin elección]
- [x] 11.12 RED e2e: `derecho_voto_id` no-UUID o payload con literal de inyección → `400`, cero
      filas afectadas [threat matrix: SQL crudo parametrizado]
- [x] 11.13 GREEN: confirmar 11.2-11.12 verdes contra Postgres real (Docker) — 14/14 verdes

### Phase 12: Contrato y regresión PR3
- [x] 12.1 `pnpm generate:contracts` + `pnpm openapi:extract`: `POST /votos` documentado con `201`
      **y** `200`; `GET /votos/papeleta/:id` documentado
- [x] 12.2 `pnpm typecheck` verde en los 4 paquetes

## PR 4 — Concurrencia determinista y frontera de cierre (base = PR 3 branch)

### Phase 13: Arnés de concurrencia (núcleo del change, aislado para revisión enfocada)
- [x] 13.1 RED e2e (a): `pg` crudo abre `BEGIN` + `INSERT "Voto"` **sin commit** sobre un derecho
      pendiente; se dispara el `POST /votos` real (bloquea en `FOR UPDATE OF dv`); se commitea el
      crudo ⇒ el endpoint recibe `23505` real, lo captura (D5) y responde `200` con el comprobante
      del crudo [spec: Concurrencia real de dos conexiones — prueba fuerte, ejercita el `catch`
      real del servicio]
- [x] 13.2 RED e2e (b): dos `createPgClient()` coordinados manualmente por pasos — ambos ejecutan
      `SELECT ... FOR UPDATE OF dv` (el segundo se bloquea hasta que el primero libere), ambos
      intentan `INSERT`; exactamente una fila `Voto` sobrevive, la otra recibe `23505` sobre
      `Voto_proceso_id_derecho_voto_id_key` [spec: Concurrencia real de dos conexiones]
- [x] 13.3 RED e2e (c): red de seguridad probabilística — 8 `POST /votos` reales con `Promise.all`
      sobre el mismo derecho, distintas claves de idempotencia; exactamente 1 fila `Voto`, 0
      respuestas `5xx`
- [x] 13.4 GREEN: confirmar 13.1-13.3 verdes contra Postgres real; documentar en comentario si
      `FOR UPDATE OF dv` por sí solo resolvió la carrera antes de que `23505` tuviera que activarse
      (mismo criterio de verificación que `#13` Phase 13)
- [x] 13.5 Crear `apps/backend/test/votos/votos-concurrencia.e2e-spec.ts` con 13.1-13.3 (reutiliza
      `test/schema/helpers/pg-client.ts` ya existente — sin crear el helper de nuevo)

### Phase 14: Frontera de cierre exacta (D3)
- [x] 14.1 RED schema: dentro de una misma transacción `pg` cruda, `UPDATE ... SET
      fecha_cierre_prevista = now()` y evaluar `now() >= fecha_cierre_prevista` → `true` (frontera
      exacta, cierre cerrado por arriba) [spec: Hora de cierre y de comprobante coinciden]
- [x] 14.2 RED schema: mismo patrón con `now() + interval '1 second'` → `false` (aceptado a
      `cierre − 1s`)
- [x] 14.3 GREEN: crear `apps/backend/test/schema/votos-frontera-cierre.spec.ts` — pasa 14.1-14.2
- [x] 14.4 RED e2e: proceso que cierra entre la lectura de la papeleta (PR1) y la confirmación del
      paso 3 → `POST /votos` rechaza con `VOTACION_CERRADA` [threat matrix: TOCTOU/concurrencia]

### Phase 15: Regresión final PR4
- [x] 15.1 `pnpm --filter @seei/backend test:e2e` completo verde contra Postgres real (Docker)
- [x] 15.2 `pnpm typecheck` verde en los 4 paquetes

## PR 5 — Ruta, `VotacionPage` y los 3 pasos (base = PR 4 branch)

### Phase 16: Ruta, API cliente y clave de idempotencia (D14, D15)
- [ ] 16.1 Modificar `apps/frontend/src/app/rutas.ts`: variante `{ nombre: 'votacion';
      derechoVotoId }` en la unión `Ruta`; `parsearRuta`/`rutaAPath` para `/votar/:derechoVotoId`
- [ ] 16.2 RED unit: `parsearRuta('/votar/<id>')` ida y vuelta
- [ ] 16.3 GREEN: implementación en `rutas.ts`/`rutas.spec.ts` — pasa 16.2
- [ ] 16.4 Crear `apps/frontend/src/votos/votos-api.ts`: wrappers `emitir`/`papeleta` sobre
      `createSeeiClient` (requiere `openapi.json` regenerado en PR3)
- [ ] 16.5 RED unit: `crypto.randomUUID()` generado al entrar al paso 3, persistido en
      `sessionStorage` bajo `seei:voto:{procesoId}:{derechoVotoId}`, estable entre reintentos
      [spec: Reintento con misma clave]
- [ ] 16.6 RED unit: sin `sessionStorage` disponible (modo privado) → fallback a `useRef` en
      memoria, sigue estable dentro de la misma sesión de render
- [ ] 16.7 GREEN: crear `apps/frontend/src/votos/clave-idempotencia.ts` — pasa 16.5-16.6

### Phase 17: Piezas presentacionales de los 3 pasos (D14)
- [ ] 17.1 RED componente: `PasoBoleta` — "Continuar" deshabilitado sin selección, incluida la
      opción de voto en blanco (borde discontinuo) [spec: Boleta mobile-first de 3 pasos]
- [ ] 17.2 RED componente: el voto en blanco solo se registra por selección explícita, nunca por
      ausencia de selección [spec: Voto en blanco explícito]
- [ ] 17.3 RED componente: `PasoConfirmacion` — resumen + casilla de consentimiento, botón pasa a
      "Registrando…" al confirmar
- [ ] 17.4 GREEN: crear `apps/frontend/src/votos/piezas/PasoInformacionProceso.tsx`,
      `PasoBoleta.tsx`, `PasoConfirmacion.tsx` (presentacionales puros, sin efectos, tokens vigentes
      de `index.css`) — pasa 17.1-17.3

### Phase 18: `VotacionPage` y wiring (D14)
- [ ] 18.1 Crear `apps/frontend/src/votos/VotacionPage.tsx`: contenedor con todos los efectos y el
      estado de paso (paso NO es parte de la URL — espejo de `AperturaProcesoPage`); llama
      `votos-api.papeleta()` en el paso 1, `votos-api.emitir()` en la confirmación del paso 3
- [ ] 18.2 Modificar `apps/frontend/src/app/Enrutador.tsx`: caso `'votacion'` → `VotacionPage`
- [ ] 18.3 RED componente: navegar entre pasos sin recargar; el paso 2 no es enlazable/recargable
      sin contexto (D14 — los pasos son estado del contenedor, no rutas)
- [ ] 18.4 RED componente: "sin conexión al confirmar" (la petición nunca llega o se pierde la
      respuesta) muestra el estado correspondiente sin generar `RECHAZO` [spec: derivado — no
      cubierto por el servidor]
- [ ] 18.5 GREEN: wiring completo — pasa 18.3-18.4

### Phase 19: Regresión PR5
- [ ] 19.1 `pnpm --filter @seei/frontend test` verde
- [ ] 19.2 `pnpm typecheck` verde en los 4 paquetes

## PR 6 — Banda de calidad, pantallas de rechazo y comprobante (base = PR 5 branch)

### Phase 20: Banda "Votando como…" (D14, ADR-0011)
- [ ] 20.1 RED componente: `en_calidad_de = 'padre'` → "Votando como padre/apoderado de ▢ · 4° B";
      `en_calidad_de = 'estudiante'` → solo nombre y aula propios [spec: Cada derecho se ejerce de
      forma independiente]
- [ ] 20.2 RED componente: la banda no ofrece ningún control para cambiar de derecho a mitad de
      flujo (ADR-0011 retira el salto)
- [ ] 20.3 GREEN: crear `apps/frontend/src/votos/piezas/BandaVotandoComo.tsx` — pasa 20.1-20.2

### Phase 21: `PantallaRechazo` (4 variantes) y `PanelComprobante`
- [ ] 21.1 RED componente: variante `sin-padron` (causa `SIN_DERECHO`) renderiza icono, título y
      explicación acordes; sin acción de reintento automático
- [ ] 21.2 RED componente: variante `cerrada` (causa `VOTACION_CERRADA`) muestra la hora exacta de
      cierre recibida del servidor
- [ ] 21.3 RED componente: variante `ya-votaste` (causa `DERECHO_YA_EJERCIDO`) muestra fecha/hora
      del registro original y el comprobante ya emitido, nunca un error genérico [spec: Segundo
      voto genuino con clave distinta]
- [ ] 21.4 RED componente: variante `sin-conexion` (estado del cliente, no del servidor) — sin
      código de error de servidor asociado
- [ ] 21.5 GREEN: crear `apps/frontend/src/votos/piezas/PantallaRechazo.tsx` (una pieza
      parametrizada con las 4 variantes, mismo layout) — pasa 21.1-21.4
- [ ] 21.6 RED componente: `PanelComprobante` muestra `codigo_comprobante`, `hora_servidor` y
      `eleccion_resumen` (el resumen SÍ viaja al votante — es su propio voto, distinto del payload
      de auditoría)
- [ ] 21.7 GREEN: crear `apps/frontend/src/votos/piezas/PanelComprobante.tsx` — pasa 21.6

### Phase 22: Wiring final y regresión PR6
- [ ] 22.1 Modificar `apps/frontend/src/votos/VotacionPage.tsx`: enrutar cada código de rechazo del
      backend (D9) a su variante de `PantallaRechazo`; mostrar `PanelComprobante` en éxito
- [ ] 22.2 `pnpm --filter @seei/frontend test` verde
- [ ] 22.3 `pnpm typecheck` verde en los 4 paquetes
- [ ] 22.4 Verificación manual/rollout R2-R4 de `design.md`: recorrido completo de 3 pasos en móvil,
      incluida una recarga/reintento del `POST` que confirma `200` sin fila nueva
