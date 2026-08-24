# Diseño: reportes-y-exportaciones (Backlog #18 — Reportes y exportaciones)

## Enfoque técnico

Cuatro piezas, en el orden en que deben existir:

1. **Una migración puramente aditiva**: tres enums nuevos (`DimensionReporte`, `FormatoReporte`,
   `EstadoReporte`) y la tabla `Reporte`. Ningún tipo ni tabla existente cambia, así que no hay
   ningún `ALTER TYPE … ADD VALUE` ni el gotcha de un solo archivo que documentó `#17` D2.
2. **Un módulo Nest nuevo `apps/backend/src/reportes/`** que, en la transacción de la solicitud,
   **calcula y congela** el reporte completo en `Reporte.contenido` (patrón literal de
   `Acta.contenido`, `#17` D6) colgando de `procesos/escrutinio.ts`, y deja la fila en `borrador`.
   El backend **no encola nada** (ADR-0012, `#17` D10): la fila `Reporte` *es* la entrada de outbox.
3. **Un despachador + processor de reportes en el worker** (copia estructural de
   `actas-dispatcher.ts` / `actas.processor.ts`), con cola propia `reportes`, tres renderizadores
   detrás de **un solo puerto** y una transacción terminal con CAS que escribe `REPORTE_GENERADO`
   con el actor tomado **de la fila**, no del payload de cola.
4. **Tres endpoints** (solicitar, consultar, descargar) con las cabeceras defensivas que
   `actas.controller.ts` ya usa para servir `bytea`.

Sin frontend (proposal.md, Out of Scope). El corte que gobierna todo el diseño es el mismo de `#16`:
**qué se calcula** lo decide el gate en la solicitud, **qué se renderiza** lo decide el gate otra vez
en la generación, y **qué se entrega** lo decide el gate una tercera vez en la descarga (D7).

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Ubicación del código | Módulo Nest **propio y de primer nivel** `apps/backend/src/reportes/`: `reportes.module.ts`, `reportes.controller.ts`, `reportes.service.ts`, `reportes.errors.ts`, `modelo-reporte.ts` (puro), `dimensiones.ts` (consultas), `dto/`. Importa `calcularParticipacion`/`calcularEscrutinio` de `../procesos/escrutinio` | Archivos hermanos dentro de `src/procesos/` (lo que hizo `#17` D1 con las actas); método más en `ProcesosController` | `#17` D1 metió las actas en `procesos/` porque un acta **es** parte del ciclo de vida de un `ProcesoElectoral` (la transición `cerrado → acta_emitida` vive en `ProcesosService`). Un reporte no lo es: no transiciona nada, se solicita en cualquier momento y su audiencia es administrativa. El precedente correcto es `importacion/` y `panel-jornada/` —módulos de primer nivel que **leen** procesos sin ser parte de su máquina de estados—, y el import cruzado a `escrutinio.ts` ya está establecido: `panel-jornada.service.ts` lo hace hoy |
| D2 | Esquema Prisma `Reporte` | Tabla nueva con `proceso_id`, `dimension`, `formato`, `estado`, `solicitado_por` (FK `Usuario`, **NOT NULL**), `gate_aplicado Boolean?`, `contenido Json @db.JsonB` (NOT NULL), `archivo Bytes?`, `archivo_mime`, `archivo_nombre`, `creado_en`, `emitido_en`. `@@index([estado, creado_en])` y `@@index([proceso_id, dimension, formato, creado_en])`. `onDelete: Restrict` explícito en ambas FK | Reutilizar `Acta` con un `tipo` nuevo; `solicitado_por` nulable; guardar el archivo en disco/S3 y sólo la ruta en la fila | `Acta` queda descartada desde la exploración: lleva `CHECK tipo <> 'resultados'` y `@@unique([proceso_id, tipo])`, ambas incompatibles con `#18`. `solicitado_por` **no puede ser nulable**: es el único camino por el que el `actor_usuario_id` de `REPORTE_GENERADO` llega al worker (el worker no tiene sesión), y nulable convertiría el requisito "actor poblado" en una promesa del código. `Restrict` en `solicitado_por` es coherente con `EventoAuditoria.actor` y no cuesta nada: los usuarios se desactivan, nunca se borran. `bytea` en la fila replica `Acta.pdf`/`Lista.plan_trabajo`: el despliegue es un VPS con Docker Compose (ADR-0007), sin almacén de objetos |
| D3 | **Ausencia deliberada** de `@@unique` | Ninguna restricción de unicidad. La historia se consulta por `@@index([proceso_id, dimension, formato, creado_en])`, y el schema lleva un comentario que declara la ausencia como decisión | `@@unique([proceso_id, dimension, formato])` por simetría con `Acta` | Es la diferencia semántica central con `#17`: un acta es **una por tipo por proceso** (documento oficial único), un reporte es **un snapshot por solicitud**. Un `@@unique` haría que la segunda solicitud de la misma combinación fallara con `23505` o sobrescribiera el snapshot anterior — exactamente lo que la spec "Snapshot inmutable por solicitud" prohíbe. La ausencia se documenta *en el schema* para que un lector futuro no la "arregle" |
| D4 | Quién calcula: **backend congela, worker sólo renderiza** | El `ModeloReporte` completo se construye en la transacción de `POST /reportes` y se persiste en `Reporte.contenido`. El worker **no** consulta el dominio: lee la fila, poda (D7) y renderiza | Que el processor calcule al generar (lo que sugería la propuesta: "fuente de datos: `escrutinio.ts`"); congelar sólo datos crudos y armar el modelo en el worker | **Desviación declarada respecto de la propuesta, y verificada contra el código**: `apps/worker/tsconfig.json` fija `rootDir: ./src` e `include: src/**/*.ts`, así que el worker **no puede** compilar un import de `apps/backend/src/procesos/escrutinio.ts` pese a tener `@seei/backend` como dependencia de workspace. Habilitarlo exigiría un paquete compartido nuevo, y `packages/contracts` está reservado al contrato HTTP (ADR-0001/ADR-0002). Además el patrón congelado es el que `#17` D6 ya probó: "el PDF se renderiza a partir de ese JSON, nunca al revés" — el reporte es reproducible desde su fila, el instante del snapshot es el de la solicitud (que es el que el solicitante entiende), y el worker queda sin ninguna lógica de negocio que testear contra Postgres |
| D5 | Forma de `contenido`: **modelo tabular canónico por secciones** | `ModeloReporte { version: 1, dimension, formato, titulo, generado_en, meta: Par[], secciones: Seccion[], notas: string[] }`, con `Seccion { clave, titulo, columnas: string[], filas: Celda[][], sensible: boolean }`. **6 constructores** (uno por dimensión) × **3 renderizadores** (uno por formato) | Un JSON distinto por dimensión y un renderizador que conozca las 6 formas (18 combinaciones); `contenido` con los datos crudos y el formateo en el renderizador | 6 + 3 en vez de 6 × 3 es la decisión que hace el change tratable. Cada renderizador conoce **una** forma y ninguna dimensión; cada constructor conoce **una** dimensión y ningún formato. El corolario que importa: la poda del gate (D7) se vuelve **una sola regla genérica** —descartar las secciones `sensible: true`— en vez de seis reglas ad-hoc, que es donde se filtraría el desglose |
| D6 | Fuente de datos de cada dimensión | Ver la tabla "Dimensiones" más abajo. `participacion`/`resultados` cuelgan de `escrutinio.ts` sin reimplementar nada; `votantes`/`abstenciones` son dos `$queryRaw` sobre `DerechoVoto`⋈`Voto`⋈`Usuario`; `candidatos`/`consultas` son lecturas de catálogo | Reimplementar las agregaciones en `reportes.service.ts`; colgar de `panel-jornada.service.ts` para el avance por aula | `escrutinio.ts` es el módulo compartido que `#17` D5 extrajo justamente para esto y sus tres consumidores actuales lo prueban. `panel-jornada` (#20) se descarta como fuente: la exploración ya lo declaró "no es una dependencia formal de #18", y su código está **sin commitear** en el árbol de trabajo — depender de él acoplaría `#18` a un change no entregado |
| D7 | Gate `ocultar_resultados`: **tres capas**, no una | (1) **Solicitud**: si la dimensión es sensible y `ocultar_resultados=true`, el servicio llama **sólo** a `calcularParticipacion()` y no construye la sección sensible. (2) **Generación**: el processor relee `ProcesoElectoral.ocultar_resultados` y **poda** toda sección `sensible: true` si la política viró a oculta; persiste el resultado efectivo en `gate_aplicado`. (3) **Descarga**: `409 REPORTE_NO_DISPONIBLE` si la política vigente es oculta, la dimensión es sensible y el archivo emitido se generó con `gate_aplicado=false` | Aplicarlo **sólo** en el endpoint al encolar (congelar el booleano en la fila); aplicarlo **sólo** en el processor; reevaluar el gate al descargar regenerando el archivo | **La pregunta del brief tiene dos mitades con respuestas distintas.** Los **datos** son un hecho del pasado y se congelan (D4); la **visibilidad es una política vigente** y congelarla equivale a congelar un permiso. Aplicarlo sólo al encolar deja pasar la dirección que duele (`false → true` entre solicitud y generación produce un archivo con desglose que la institución ya decidió ocultar). Aplicarlo sólo al generar deja pasar la fuga lateral: un archivo emitido cuando estaba visible sigue descargable después del viraje, con la misma forma que la fila central de la Threat Matrix de `#17`. La dirección inversa (`true → false`) sólo produce un archivo **más conservador**, y como el snapshot es inmutable (D3) la reparación es solicitar de nuevo — por eso `gate_aplicado` se expone en `GET /reportes/:id`: sin él, un archivo sin desglose es indistinguible de un bug. **Fallo cerrado**: `ocultar_resultados` es `@default(true)`; si el processor no puede leer la fila del proceso, el job **falla**, nunca emite sin podar |
| D8 | Regla de sensibilidad de una sección | `sensible: true` **si y sólo si** su contenido no aparecería en la respuesta de `GET /procesos/:id/resultados` con `ocultar_resultados=true`. En la práctica: desglose por opción/lista/candidato, `blancos`, `cuadre` y `empate`. Todo lo demás (`padron_total`, `votos_emitidos`, `abstenciones`, `porcentaje_participacion`, avance por aula, listas nominales de participación, catálogos) es `sensible: false` | Marcar como sensible "lo que parezca delicado"; marcar el avance por aula como sensible | El corte queda anclado a una frontera que **ya existe y ya está probada**: `calcularParticipacion()` vs `calcularEscrutinio()` (`#17` D5). Cualquier campo nuevo se clasifica preguntando de cuál de las dos funciones sale, no por criterio estético. Las listas nominales de participación no son sensibles porque ADR-0010 §2 lo dice literalmente: "el comité ve quién votó y cuándo (participación), jamás por quién" |
| D9 | Cola, despachador y processor | Cola **propia** `reportes` (`REPORTES_QUEUE_NAME`), job `reporte.generar`, `jobId: 'reporte:'+id`, `attempts: 5`, `backoff: { exponential, 2000 }`. Polling `reporte.findMany({ where:{estado:'borrador'}, orderBy:{creado_en:'asc'}, take, select:{id:true} })`. `REPORTES_POLL_MS`/`REPORTES_BATCH` (defaults 5000/20). Processor **puro** `procesarReporte(repo, renderers, reporteId)` sobre dos puertos, sin `PrismaClient` ni `bullmq` | Reutilizar la cola `actas`; encolar desde el backend tras el commit | Copia literal de `#17` D10, incluido su argumento: perfiles de fallo distintos no comparten cola. Un reporte de 2000 votantes en Excel es lento y con `attempts: 5` puede ocupar un worker minutos; encolarlo detrás de las actas retrasaría el cierre de un proceso, que es la operación crítica. El backend no encola: ADR-0012 y `#17` D10 lo vetan, y la fila `borrador` es la entrada de outbox que el despachador descubre |
| D10 | **Tres renderizadores separados** detrás de un puerto único | Puerto `RendererReporte { readonly mime; readonly extension; render(modelo): Promise<Buffer> }` en el processor; tres adaptadores hermanos: `exceljs-renderer.ts`, `pdfkit-renderer-reporte.ts`, `csv-renderer.ts`. `main.ts` arma el mapa `Record<FormatoReporte, RendererReporte>` y se lo pasa al processor | Un renderizador único con `switch (formato)`; una clase base con tres subclases; reutilizar `PdfkitRendererActa` | **Tres adaptadores, no tres estrategias dentro de una clase**, por una razón operativa concreta: un archivo único importaría `exceljs` **y** `pdfkit` en el mismo módulo, y el worker cargaría ambas librerías en cada job aunque el 90 % de las solicitudes sea CSV. Además los tres modelos de ejecución son incompatibles de fondo (`exceljs` es `async` sobre streams, `pdfkit` es orientado a eventos con `doc.on('end')`, CSV es una función pura sobre strings): un `switch` sobre tres cuerpos que no comparten ni una línea es duplicación disfrazada de reutilización. Es la extensión natural de `#17` D12 (un puerto, un adaptador), no un patrón nuevo. `PdfkitRendererActa` **no** se reutiliza: su `dibujarContenido` conoce la forma del acta, no `ModeloReporte` |
| D11 | Escaping CSV: duplicación declarada | `apps/worker/src/reportes/csv.ts` reimplementa `escaparCeldaCsv`/`neutralizarFormula`/BOM UTF-8/CRLF de `apps/backend/src/importacion/padron-csv.ts`, con un comentario que apunta al original como fuente de verdad y una prueba de paridad de casos | Importar `padron-csv.ts` desde el worker; extraer un paquete `packages/csv` | El import cruzado no compila (mismo hallazgo de D4: `rootDir` del worker). Un paquete compartido para ~30 líneas agregaría un target de build, una entrada en `turbo.json` y una versión que mantener, para una función que no ha cambiado desde `#9`. La duplicación es el costo menor **siempre que sea explícita**: sin el comentario y la prueba de paridad, sería deriva silenciosa |
| D12 | Transacción terminal y **por qué NO hay `FOR UPDATE`** | Una transacción por reporte: (1) `findUnique` de `proceso_id`/`dimension`/`formato`/`solicitado_por`; (2) `updateMany({ where:{ id, estado:'borrador' }, data:{ archivo, archivo_mime, archivo_nombre, gate_aplicado, emitido_en, estado:'emitida' } })` — `count === 0` ⇒ `no-op` y fin; (3) `eventoAuditoria.create('REPORTE_GENERADO')`. **Sin** `SELECT … FOR UPDATE` | Replicar el `SELECT … FOR UPDATE` sobre `ProcesoElectoral` de `#17` D11 "por simetría" | El `FOR UPDATE` de `#17` D11 existía por **una** razón nombrada: la transición `cerrado → acta_emitida` dependía de un `count()` de filas hermanas, y sin lock dos workers podían ver `3` cada uno y ninguno transicionar. `#18` **no tiene ninguna agregación entre filas**: cada `Reporte` es independiente y no transiciona nada fuera de sí mismo. Copiar el lock serializaría todos los reportes de un proceso —incluidos los de un proceso `abierto`, cuya fila `ProcesoElectoral` sí es caliente— reintroduciendo exactamente lo que `#14` D4 prohibía. El CAS de un solo `updateMany` con `estado='borrador'` en el `WHERE` basta y cubre las dos capas de idempotencia de ADR-0012 junto con `jobId: 'reporte:'+id` |
| D13 | Auditoría `REPORTE_GENERADO` | Una clave aditiva. `actor_usuario_id = reporte.solicitado_por` **leído de la fila dentro de la transacción**, `entity_type='Reporte'`, `entity_id = reporte.id`, payload cerrado `{ proceso_id, dimension, formato, gate_aplicado, filas, bytes }`. Escrito por el worker con `tx.eventoAuditoria.create()`. Ningún evento en el camino de fallo. **Cero migraciones de trigger** | Leer el actor del `job.data`; una clave por dimensión; incluir el desglose o los nombres de los votantes en el payload; un evento `REPORTE_SOLICITADO` adicional | Leer el actor de la fila y no del payload es literal de la spec y no es formalismo: el payload de BullMQ vive en Redis, que es volátil (ADR-0012) y puede vaciarse entre el encolado y el reintento — el evento quedaría con `actor: null`, que es justo lo que `#18` corrige respecto de `ACTA_GENERADA`. `REPORTE_GENERADO` no entra en la cláusula `WHEN` del trigger `eventoauditoria_claves_eleccion_trg` (cubre exactamente `VOTO`/`RECHAZO`) y cumple el `CHECK` `^[A-Z_]+$`. El payload es cerrado y construido campo por campo: `filas`/`bytes` son cardinalidades, nunca contenido — ADR-0010 prohíbe por sustancia, no por etiqueta |
| D14 | Alcance, dependencias y rollout | Backend: **cero** paquetes nuevos (`exceljs@^4.4.0` ya está, hoy sólo para leer). Worker: **`+exceljs@^4.4.0`** (misma versión exacta que el backend); `pdfkit` ya está. Frontend: cero archivos. `packages/contracts` se regenera. `turbo.json`, `infra/docker/docker-compose.yml`, `docs/onboarding.md` y `README.md` suman `REPORTES_POLL_MS`/`REPORTES_BATCH` donde ya documentan `ACTAS_*`/`OUTBOX_*` | Instalar `exceljs` también en el worker con una versión distinta; escribir el `.xlsx` a mano; mover `exceljs` a la raíz | Versión idéntica en ambos paquetes porque el mismo `.xlsx` se lee en el backend (importación) y se escribe en el worker: una divergencia de versión sería un bug de interoperabilidad difícil de ver. `exceljs` en el worker no rompe ADR-0001 —el backend sigue sin renderizar—, y el peso ya está en el lockfile |

## Dimensiones (D6) — de dónde sale cada una

| `dimension` | Fuente | Secciones del `ModeloReporte` (`*` = `sensible: true`) |
|---|---|---|
| `participacion` | `calcularParticipacion()` (siempre) + `calcularEscrutinio()` (sólo si visible) + `$queryRaw` de avance por aula sobre `DerechoVoto ⟕ Voto` agrupado por `aula_snapshot`, con etiquetas resueltas vía `Aula ⋈ Grado ⋈ Seccion` | `resumen` (padrón, emitidos, abstenciones, %) · `por_aula` (aula, padrón, votos, abstenciones, %) · `distribucion`\* (etiqueta, votos, % sobre emitidos) |
| `votantes` | `$queryRaw`: `Voto ⋈ DerechoVoto ⋈ Usuario`, proyectando **sólo** `u.nombres, u.codigo, dv.en_calidad_de, dv.aula_snapshot, v.hora_servidor`, `ORDER BY v.hora_servidor` | `votantes` (una fila por voto emitido) |
| `abstenciones` | `$queryRaw`: `DerechoVoto ⟕ Voto WHERE v.id IS NULL`, unido a `Usuario`, `ORDER BY u.nombres` | `abstenciones` (una fila por derecho sin voto) |
| `resultados` | `calcularEscrutinio()` (sólo si visible) + `calcularParticipacion()` (siempre); cuadre y empate con las fórmulas de `#17` D7/D8, **sin reimplementar** las agregaciones | `desglose`\* (etiqueta, votos, %, estado, `baja_en`, más la fila de blancos) · `cuadre`\* (padrón, votos por opción, blancos, nulos = 0, abstenciones, `cuadra`) · `empate`\* · `resumen` (padrón, emitidos, abstenciones, %) |
| `candidatos` | `candidato.findMany({ where:{proceso_id}, include:{ lista:{ select:{nombre, numero} } } })` — catálogo **completo**, sin filtrar `estado`, sin `foto` | `candidatos` (nombres, lista, número, cargo, grado, aula, estado, `baja_en`) |
| `consultas` | `opcionConsulta.findMany({ where:{proceso_id}, orderBy:{etiqueta:'asc'} })` | `opciones` (etiqueta, descripción) |

Reglas transversales de las consultas nominales (`votantes`/`abstenciones`), obligatorias:

- La lista `SELECT` **nunca** incluye `v.lista_id`, `v.opcion_id`, `v.candidato_id`, `v.blanco` ni
  `v.codigo_comprobante` — el comprobante es la única superficie que revela una elección
  individual (ADR-0009/ADR-0010 §4) y no puede viajar en un export.
- Tampoco incluye `u.dni`: `codigo` es el identificador institucional suficiente, y son datos
  personales de menores (ADR-0010, retención).
- `candidatos` sobre un proceso `consulta` (o `consultas` sobre uno `municipio`) devuelve **cero
  filas**: es un reporte vacío válido, no un `400`. El endpoint no valida coherencia
  dimensión↔`TipoProceso`.

## Contratos HTTP (D8)

| Ruta | Cuerpo | Respuestas |
|---|---|---|
| `POST /reportes` | `SolicitarReporteDto { proceso_id, dimension, formato }` | `202 ReporteDetalleDto` (fila creada en `borrador`) · `400 CAMPO_INVALIDO {campo}` (`proceso_id` no-UUID, `dimension`/`formato` fuera del enum) · `401` · `403` rol distinto · `404 PROCESO_NO_ENCONTRADO` |
| `GET /reportes/:id` | — | `200 ReporteDetalleDto` · `400` id no-UUID · `401` · `403` · `404` |
| `GET /reportes/:id/archivo` | — | `200` con el `Content-Type` del formato · `400` · `401` · `403` · `404` · `409 REPORTE_NO_EMITIDO {estado}` · `409 REPORTE_NO_DISPONIBLE` (gate vigente, D7 capa 3) |

- `@Controller('reportes')`, `@UseGuards(AuthGuard, RolesGuard)`, `@Roles('administrador',
  'director', 'comite')` a nivel de clase — mismos tres roles que `ActasController`, y por el mismo
  motivo: un reporte de `resultados` lleva el desglose que `#16` le niega al votante.
- **Sin comprobación de propiedad** sobre `solicitado_por`: los tres roles pueden solicitar
  cualquier reporte, así que restringir la descarga al solicitante no agrega confidencialidad y sí
  fricción. Queda escrito para que no se lea como omisión.
- `202` y no `201`: el recurso `Reporte` existe, pero el artefacto que el cliente quiere **no**;
  `201` con `Location` prometería un archivo descargable que todavía no hay. Es el primer `202` del
  repo (`POST /importaciones/padron` es `201` porque es síncrono) y por eso se justifica aquí.
- `ReporteDetalleDto` **nunca** expone `contenido` ni `archivo`: `{ id, proceso_id, dimension,
  formato, estado, gate_aplicado, archivo_disponible, archivo_bytes, archivo_mime, archivo_nombre,
  solicitado_por, creado_en, emitido_en }`. Mismo criterio que `#17` D13.
- La descarga usa `StreamableFile` con `X-Content-Type-Options: nosniff`,
  `Content-Security-Policy: default-src 'none'` y `Content-Disposition: attachment; filename=…`,
  copiado literal de `actas.controller.ts`.

**Desviación declarada respecto de la spec.** El escenario "Solicitud válida" dice "*y se encoló 1
job en `reportes`*". El endpoint **no** llama a `queue.add()`: crea la fila `borrador`, que es la
entrada de outbox, y el despachador la encola dentro de `REPORTES_POLL_MS` (≤ 5 s). Encolar desde
el backend está vetado por ADR-0012 y `#17` D10, y `openspec/config.yaml` prohíbe contradecir un
ADR en silencio. La verificación del escenario debe asertar **la fila en `borrador`**, y el job
como consecuencia observable del despachador.

## Flujo de datos

```
POST /reportes   { proceso_id, dimension, formato }
  │  AuthGuard + RolesGuard   @Roles('administrador','director','comite')     → 401 / 403
  ▼
ReportesService.solicitar(dto, actorId)
  ├─0─ validar dimension/formato/proceso_id a mano, ANTES de la transacción    → 400 (idioma #17 D9)
  │
  └─ prisma.$transaction(tx, { isolationLevel: RepeatableRead })     ← un solo snapshot (#16 D4)
       1. tx.procesoElectoral.findUnique({ tipo, ocultar_resultados, nombre })  → 404 si no existe
       2. gate = esSensible(dimension) && proceso.ocultar_resultados                        (D7.1)
       3. datos = gate ? calcularParticipacion(tx, id)          ← NUNCA calcula el desglose
                       : calcularEscrutinio(tx, id, tipo)         (+ consultas de la dimensión)
       4. modelo = construirModelo(dimension, datos, gate)      ← PURO, secciones marcadas   (D5)
       5. tx.reporte.create({ estado:'borrador', solicitado_por: actorId, contenido: modelo })
  ▼
202 ReporteDetalleDto        ← la fila `borrador` es la entrada de outbox (ADR-0012); nadie encola
```

```
apps/worker  (nada de esto lo dispara el backend — ADR-0012)                    (D9/D10/D12/D13)

setInterval(REPORTES_POLL_MS)
   └ despacharLoteReportes(repo, reportesQueue, REPORTES_BATCH)
        repo.pendientes() → SELECT id FROM "Reporte" WHERE estado='borrador'
                            ORDER BY creado_en LIMIT n     ← @@index([estado, creado_en])
        queue.addBulk(ids.map(id => ({ name:'reporte.generar', data:{ reporte_id:id },
                                       opts:{ jobId:`reporte:${id}`, attempts:5,
                                              backoff:{exponential, 2000} } })))

reportesWorker('reportes')
   └ procesarReporte(repo, renderers, reporte_id)             ← PURO: dos puertos, sin Prisma
        ├ repo.leer(id) → null | estado!=='borrador'                       ⇒ 'no-op'
        ├ gate = esSensible(dimension) && ocultar_resultados               ← releído AHORA  (D7.2)
        ├ modelo = podar(contenido, gate)     ← descarta TODA sección `sensible: true`      (D5)
        ├ archivo = renderers[formato].render(modelo)   ← sin try/catch: propaga ⇒ reintento
        └ repo.finalizar(id, archivo, mime, nombre, gate) ── transacción terminal ─────────┐
                                                                                           │
   PrismaReportesRepo.finalizar():           ← SIN `FOR UPDATE`: no hay agregación entre    │
     $transaction(tx):                          filas que proteger (D12)                    │
       1. fila = tx.reporte.findUnique({ proceso_id, dimension, formato, solicitado_por })  │
       2. updateMany({ id, estado:'borrador' } → { archivo, …, estado:'emitida' })          │
             count===0 ⇒ 'no-op'  (CAS: reentrega de BullMQ o segundo intento)              │
       3. eventoAuditoria.create('REPORTE_GENERADO',                                        │
                                 actor_usuario_id: fila.solicitado_por)   ← DE LA FILA (D13)│
                                                                                            │
reportesWorker.on('failed', (job,e)) ⇒ attemptsMade >= attempts ⇒ repo.marcarFallido(id) ───┘
                                       (updateMany WHERE estado='borrador' — nunca pisa 'emitida')
```

```
GET /reportes/:id/archivo                                                              (D7.3)
  └ estado !== 'emitida'                                        ⇒ 409 REPORTE_NO_EMITIDO
    esSensible(dimension) && proceso.ocultar_resultados && gate_aplicado === false
                                                                ⇒ 409 REPORTE_NO_DISPONIBLE
    resto                                                       ⇒ 200 StreamableFile
```

## Interfaces / Contratos

```prisma
// apps/backend/prisma/schema.prisma — D2/D3. Grupo nuevo, 100 % aditivo.
enum DimensionReporte { participacion  votantes  abstenciones  resultados  candidatos  consultas }
enum FormatoReporte   { excel  pdf  csv }
enum EstadoReporte    { borrador  emitida  fallido }   // paridad exacta con EstadoActa (#17 D2)

/// D3: la AUSENCIA de @@unique([proceso_id, dimension, formato]) es DELIBERADA — al revés que
/// Acta (1 por tipo por proceso), cada solicitud es su propio snapshot inmutable. No agregarla.
model Reporte {
  id             String           @id @default(uuid()) @db.Uuid
  proceso_id     String           @db.Uuid
  dimension      DimensionReporte
  formato        FormatoReporte
  estado         EstadoReporte    @default(borrador)
  /// D2/D13: NOT NULL a propósito — único camino del actor hasta REPORTE_GENERADO.
  solicitado_por String           @db.Uuid
  /// D7: null mientras 'borrador'; lo escribe el worker con el gate EFECTIVO de la generación.
  gate_aplicado  Boolean?
  contenido      Json             @db.JsonB   // ModeloReporte congelado en la solicitud (D4)
  archivo        Bytes?
  archivo_mime   String?
  archivo_nombre String?
  creado_en      DateTime         @default(now()) @db.Timestamptz(3)
  emitido_en     DateTime?        @db.Timestamptz(3)

  proceso     ProcesoElectoral @relation(fields: [proceso_id],     references: [id], onDelete: Restrict)
  solicitante Usuario          @relation(fields: [solicitado_por], references: [id], onDelete: Restrict)

  @@index([estado, creado_en])                          // barrido del despachador (D9)
  @@index([proceso_id, dimension, formato, creado_en])  // historia de solicitudes (D3)
}
// Usuario y ProcesoElectoral suman `reportes Reporte[]` — sólo schema, sin SQL.
```

```ts
// apps/backend/src/reportes/modelo-reporte.ts — D5. PURO: sin Prisma, sin Nest.
export interface Par     { clave: string; valor: string }
export type    Celda     = string | number | null;
export interface Seccion {
  clave: string; titulo: string; columnas: string[]; filas: Celda[][];
  /// D8: true SI Y SÓLO SI el contenido no aparecería en GET /procesos/:id/resultados con
  /// ocultar_resultados=true. El corte es calcularEscrutinio() vs calcularParticipacion().
  sensible: boolean;
}
export interface ModeloReporte {
  version: 1; dimension: string; formato: string; titulo: string;
  generado_en: string; meta: Par[]; secciones: Seccion[]; notas: string[];
}
/// D7.2: única regla de poda de todo el change. Genérica a propósito.
export function podar(modelo: ModeloReporte, gate: boolean): ModeloReporte;
export function esSensible(dimension: string): boolean;   // participacion | resultados
```

```ts
// apps/worker/src/processors/reportes.processor.ts — D9/D10. Puertos, nunca Prisma ni BullMQ.
// Sin try/catch: un fallo de render DEBE propagar para que BullMQ reintente; 'fallido' lo escribe
// sólo el listener on('failed') de main.ts (patrón literal de actas.processor.ts).
export interface ReportePendiente {
  id: string; proceso_id: string; dimension: string; formato: string; estado: string;
  contenido: unknown;
  /// D7.2: leído AHORA, no congelado en la solicitud — la visibilidad es política vigente.
  ocultar_resultados: boolean;
}
export interface RendererReporte {
  readonly mime: string; readonly extension: string;
  render(modelo: ModeloReporte): Promise<Buffer>;
}
export interface ReportesRepo {
  leer(id: string): Promise<ReportePendiente | null>;
  /** D12: CAS + auditoría con actor leído de la fila. Sin FOR UPDATE (no hay agregación). */
  finalizar(id: string, archivo: Buffer, mime: string, nombre: string,
            gateAplicado: boolean): Promise<'emitida' | 'no-op'>;
  marcarFallido(id: string): Promise<void>;
  pendientes(limite: number): Promise<string[]>;
}
export function procesarReporte(
  repo: ReportesRepo,
  renderers: Record<string, RendererReporte>,
  reporteId: string,
): Promise<'emitida' | 'no-op'>;
```

```ts
// apps/backend/src/reportes/reportes.errors.ts — patrón `as const` + union (idioma de la casa).
CAMPO_INVALIDO:          'CAMPO_INVALIDO',            // 400: dimension/formato/proceso_id
PROCESO_NO_ENCONTRADO:   'PROCESO_NO_ENCONTRADO',     // 404
REPORTE_NO_EMITIDO:      'REPORTE_NO_EMITIDO',        // 409: 'borrador' | 'fallido'
REPORTE_NO_DISPONIBLE:   'REPORTE_NO_DISPONIBLE',     // 409: gate vigente (D7.3)
```

Renderizadores (D10), mismo puerto, tres formas deliberadamente distintas:

| Adaptador | `mime` / `extension` | Qué emite del modelo |
|---|---|---|
| `exceljs-renderer.ts` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` / `.xlsx` | Una hoja por sección (fila de cabecera en negrita) + una hoja `Metadatos` con `meta` y `notas`. Valores escritos como `string`/`number` planos: `exceljs` sólo interpreta fórmula ante `{ formula: … }`, así que no hay superficie de inyección |
| `pdfkit-renderer-reporte.ts` | `application/pdf` / `.pdf` | Título, `meta`, todas las secciones como tablas de ancho fijo, `notas` al pie. Sólo `Helvetica`/`Helvetica-Bold`, `compress: false`, `CreationDate` desde `generado_en` — mismas decisiones de `#17` D12, mismo determinismo declarado (estructura, nunca bytes) |
| `csv-renderer.ts` | `text/csv; charset=utf-8` / `.csv` | **Sólo `secciones[0]` tras la poda**: cabecera + filas, uniforme y RFC 4180 estricto, BOM UTF-8, `\r\n`, escape y neutralización anti-fórmula (D11). `meta`/`notas` se omiten **por diseño**: CSV es un formato de datos para reprocesar, no un documento. Por eso los constructores ordenan siempre la tabla principal en `secciones[0]` |

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modificar | D2/D3 — 3 enums + `model Reporte` + back-relations en `Usuario`/`ProcesoElectoral` |
| `apps/backend/prisma/migrations/<ts>_reporte/migration.sql` | Crear | D2 — DDL puro y aditivo: `CREATE TYPE` ×3, `CREATE TABLE`, 2 índices, 2 FK `RESTRICT` |
| `apps/backend/src/reportes/modelo-reporte.ts` (+ `.spec.ts`) | Crear | D5/D7/D8 — tipos, `podar()`, `esSensible()`; puro |
| `apps/backend/src/reportes/dimensiones.ts` (+ `.spec.ts`) | Crear | D6 — los 6 constructores `construirModelo(dimension, tx, …)` y sus consultas |
| `apps/backend/src/reportes/reportes.service.ts` (+ `.spec.ts`) | Crear | D4/D7.1 — transacción `RepeatableRead`, gate de cálculo, `create` en `borrador` |
| `apps/backend/src/reportes/reportes.controller.ts` (+ `.spec.ts`) | Crear | D8 — 3 rutas, guards, `StreamableFile` con cabeceras defensivas |
| `apps/backend/src/reportes/reportes.errors.ts` · `reportes.module.ts` · `dto/*.dto.ts` | Crear | D8 — códigos, módulo, `SolicitarReporteDto` / `ReporteDetalleDto` |
| `apps/backend/src/app.module.ts` | Modificar | `+ReportesModule`, `cookie-parser` `forRoutes` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | D13 — `REPORTE_GENERADO` + entrada de bitácora |
| `apps/backend/src/procesos/escrutinio.ts` | **Sin cambios (explícito)** | D6 — reutilizado tal cual; editarlo es evidencia de deriva |
| `apps/worker/package.json` | Modificar | D14 — `+exceljs@^4.4.0` (misma versión que el backend) |
| `apps/worker/src/reportes/reportes-dispatcher.ts` (+ `.spec.ts`) | Crear | D9 — espejo de `actas-dispatcher.ts`, cola `reportes` |
| `apps/worker/src/reportes/reportes.repo.ts` | Crear | D12 — adaptador Prisma, transacción terminal con CAS, sin `FOR UPDATE` |
| `apps/worker/src/reportes/reportes-fallido-listener.ts` (+ `.spec.ts`) | Crear | D13 — espejo de `actas-fallido-listener.ts` |
| `apps/worker/src/reportes/csv.ts` · `csv-renderer.ts` · `exceljs-renderer.ts` · `pdfkit-renderer-reporte.ts` (+ `.spec.ts`) | Crear | D10/D11 — tres adaptadores del puerto + escaping CSV duplicado y declarado |
| `apps/worker/src/processors/reportes.processor.ts` (+ `.spec.ts`) | Crear | D9 — puro, dos puertos |
| `apps/worker/src/main.ts` | Modificar | D9 — `Queue`/`Worker` de `reportes`, mapa de renderizadores, `setInterval`, listener `failed` |
| `apps/backend/test/schema/reportes.spec.ts` | Crear | D2/D3 — enums, ausencia de unique, FK, índices |
| `apps/backend/test/reportes/*.e2e-spec.ts` | Crear | D7/D8 — solicitud, gate, descarga, roles |
| `turbo.json` · `infra/docker/docker-compose.yml` · `docs/onboarding.md` · `README.md` | Modificar | D14 — `REPORTES_POLL_MS`/`REPORTES_BATCH` junto a los `ACTAS_*` |
| `packages/contracts/openapi.json` · `src/generated/api.d.ts` | Modificar | Regenerar tras D8 (`pnpm openapi:extract`) |
| `apps/backend/test/resultados/*.e2e-spec.ts` · `apps/backend/test/procesos/*.e2e-spec.ts` | **Sin cambios (explícito)** | Red de regresión de `#16`/`#17`; el change es 100 % aditivo |

## Estrategia de pruebas

TDD estricto (`openspec/config.yaml`, `strict_tdd: true`; `pnpm turbo run test`): cada fila se
escribe en RED antes del código que la satisface.

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Schema (`pg` crudo) | Los 3 enums tienen sus valores exactos; **dos** filas con el mismo `(proceso_id, dimension, formato)` conviven **sin** `23505` (D3, la prueba falla si alguien agrega el `@@unique`); `solicitado_por` NOT NULL rechaza `NULL`; `DELETE` de un `Usuario` con reportes falla por `RESTRICT`; existen ambos índices | `test/schema/reportes.spec.ts`, patrón de `actas.spec.ts` + `expect-pg-error.ts` |
| Unit — `modelo-reporte.ts` | `podar(modelo, true)` descarta **todas** las secciones `sensible` y conserva las demás; `podar(modelo, false)` es identidad; `esSensible` es `true` sólo para `participacion`/`resultados`; podar un modelo cuya `secciones[0]` era sensible deja la siguiente no-sensible en la posición 0 (contrato del CSV, D10) | Puro, sin base |
| Unit — `dimensiones.ts` | Las 6 dimensiones producen su `secciones[0]` esperada; con `gate=true` **no se llama** `calcularEscrutinio` (spy sobre el doble — invariante de `#16`); las consultas de `votantes`/`abstenciones` **no** proyectan `lista_id`/`opcion_id`/`candidato_id`/`blanco`/`codigo_comprobante`/`dni` (aserción sobre el SQL y sobre las columnas del modelo); `candidatos` sobre un proceso `consulta` ⇒ 0 filas sin lanzar; padrón 0 ⇒ `porcentaje = 0`, sin `NaN` | Doble de `Prisma.TransactionClient` |
| Unit — `ReportesService` | `dimension`/`formato` inválidos ⇒ `400` **sin abrir transacción** (spy sobre `$transaction`); proceso inexistente ⇒ `404` sin crear fila; `solicitado_por` se toma de la sesión, nunca del cuerpo | `PrismaService` mockeado (patrón `procesos.service.spec.ts`) |
| E2E (Postgres real) — solicitud | Los 6 × 3 = 18 pares válidos ⇒ `202` y fila `borrador` con `contenido` JSON consultable; rol `estudiante`/`docente` ⇒ `403` y **cero** filas; sin cookie ⇒ `401`; dos solicitudes idénticas ⇒ **dos** filas distintas y la primera intacta (spec "Snapshot inmutable") | `test/reportes/reportes-solicitud.e2e-spec.ts` |
| E2E — gate (**el núcleo del change**) | Con `ocultar_resultados=true`, `resultados` y `participacion` ⇒ `contenido` **sin** ninguna sección `sensible`, para los **tres** roles; con `false` ⇒ con desglose; `candidatos`/`consultas`/`votantes`/`abstenciones` ⇒ catálogo/lista completos en ambos modos; viraje `false→true` **entre** la solicitud y la generación ⇒ archivo podado y `gate_aplicado=true`; descarga de un archivo con `gate_aplicado=false` tras el viraje ⇒ `409 REPORTE_NO_DISPONIBLE` | `test/reportes/reportes-gate.e2e-spec.ts`, con manipulación directa de `ocultar_resultados` entre pasos |
| E2E — descarga | `409 REPORTE_NO_EMITIDO` en `borrador` y en `fallido`; tras marcar `emitida` con bytes ⇒ `200` con el `Content-Type` del formato, `attachment`, `nosniff`; el cuerpo del CSV empieza con BOM UTF-8 y el del PDF con `%PDF-`; `GET /reportes/:id` **nunca** trae `contenido` ni `archivo` | `test/reportes/reportes-descarga.e2e-spec.ts` |
| Unit (Vitest, worker) | `despacharLoteReportes` ⇒ `jobId: 'reporte:<id>'`, `attempts: 5`, backoff exponencial; lote vacío ⇒ **no** llama `addBulk`; `procesarReporte` con fila inexistente / no-`borrador` ⇒ `'no-op'` **sin** renderizar; `render` que rechaza ⇒ propaga y **no** se llama `finalizar`; `finalizar` ⇒ `'no-op'` (CAS perdido) no rompe; formato sin renderizador ⇒ lanza (no emite archivo vacío); los tres renderizadores producen `Buffer` con la firma esperada (`PK` / `%PDF-` / BOM) sobre un modelo de 0 filas, de 2000 filas y con celdas que empiezan en `=`/`+`/`-`/`@` | Vitest con dobles de los puertos, patrón de `actas.processor.spec.ts` |
| Unit — paridad CSV (D11) | `escaparCeldaCsv` del worker y la del backend coinciden en el mismo set de casos (coma, comilla, salto de línea, prefijo de fórmula, vacío, acentos) | Tabla de casos duplicada a propósito en ambos paquetes |
| E2E (Postgres real) — transacción terminal | `finalizar` ⇒ `emitida` + **un** `REPORTE_GENERADO` con `actor_usuario_id = solicitado_por` (**no** `NULL`); ejecutarlo dos veces ⇒ una sola transición y un solo evento; `marcarFallido` sobre una fila ya `emitida` ⇒ no la pisa; `fallido` ⇒ **cero** eventos `REPORTE_GENERADO`; el payload no contiene `candidato_id`/`lista_id`/`opcion_id`/`blanco`/nombres | `apps/worker/test/reportes/reportes-transicion.e2e-spec.ts` con `createPgClient()` |
| Auditoría `[TM4]` | `REPORTE_GENERADO` cumple el `CHECK` `^[A-Z_]+$` y **no** dispara `AU002` (el trigger sólo cubre `VOTO`/`RECHAZO`) — se deja constancia de que la protección es de código (D13), no del motor | `test/schema/auditoria.spec.ts`, caso `[TM4]` existente |
| Contract | `pnpm openapi:extract` corre sin Postgres ni Redis con `ReportesController` registrado; las 3 rutas aparecen con sus códigos, incluido `202` | Job de CI existente |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| Fuga del gate `ocultar_resultados` por la puerta lateral del export | La visibilidad vira a oculta entre la solicitud y la generación; un archivo emitido cuando estaba visible se descarga después del viraje; una sección sensible nueva se agrega sin marcar | **Applicable — riesgo central del change** | Tres capas (D7): no se calcula, se poda y se rechaza la descarga. Una sola regla de poda genérica (D5) en vez de seis ad-hoc. La regla de sensibilidad está anclada a `calcularParticipacion()` vs `calcularEscrutinio()` (D8), no a criterio estético | Viraje entre solicitud y generación ⇒ archivo podado; descarga post-viraje ⇒ `409`; `gate=true` ⇒ `calcularEscrutinio` **nunca** invocado |
| Secreto del voto en un export nominal | `votantes` con `codigo_comprobante` o con la elección; `abstenciones` con `dni`; payload de auditoría construido por *spread* del modelo | **Applicable** — ADR-0009/ADR-0010 | Listas `SELECT` cerradas y explícitas (D6): jamás `lista_id`/`opcion_id`/`candidato_id`/`blanco`/`codigo_comprobante`/`dni`. Payload de auditoría cerrado con sólo cardinalidades (D13). ADR-0010 §2 autoriza expresamente el "quién votó y cuándo" | Aserción sobre las columnas exactas de los 4 modelos nominales y sobre las claves exactas del payload |
| Inyección de fórmulas en el archivo generado | Un candidato llamado `=cmd|'/c calc'!A1`; una `etiqueta` de `OpcionConsulta` que empieza con `@` | **Applicable** — todo el texto libre del catálogo entra al export | CSV: `neutralizarFormula` + escape RFC 4180, portado de `padron-csv.ts` (D11). Excel: valores escritos como `string`/`number` planos — `exceljs` sólo evalúa `{ formula: … }` (D10). PDF: `pdfkit` dibuja texto, no interpreta marcado | Celdas con `=`/`+`/`-`/`@` en los tres formatos; paridad de escaping con el backend |
| Doble render / entrega at-least-once | BullMQ reentrega un `reporte:<id>` ya emitido; dos workers toman el mismo job | **Applicable** — ADR-0012 declara entrega at-least-once | Dos capas: `jobId: 'reporte:'+id` en Redis y el CAS `updateMany WHERE estado='borrador'` en Postgres (D12) — el segundo intento es `no-op` sin doble evento de auditoría | `finalizar` dos veces ⇒ una transición y un evento |
| Auditoría sin actor (regresión de `ACTA_GENERADA`) | El payload del job se pierde por un flush de Redis y el reintento escribe `actor: null` | **Applicable — es el requisito diferencial de `#18`** | `solicitado_por` es columna NOT NULL de la fila y el worker la lee **dentro** de la transacción terminal, nunca de `job.data` (D2/D13) | Evento con `actor_usuario_id = solicitado_por`; prueba con `job.data` deliberadamente vacío salvo el id |
| Fallo permanente de render invisible | Un reporte que nunca se puede renderizar queda indistinguible de uno recién solicitado; un formato sin renderizador emite un archivo vacío | **Applicable** | Tercer estado `fallido` (D2), escrito **sólo** por `on('failed')` al agotar `attempts` (D13); `GET /reportes/:id` lo expone; un formato sin adaptador **lanza** en vez de emitir bytes vacíos | `attemptsMade >= attempts` ⇒ `marcarFallido`; `<` ⇒ **no** se marca; formato desconocido ⇒ lanza |
| Denegación por tamaño / polling | `votantes` de un padrón de 2000 filas en `.xlsx` dentro de un `bytea`; el despachador barre `Reporte` cada 5 s; un rol autorizado solicita 500 reportes | **Applicable** | `@@index([estado, creado_en])` hace el barrido un recorrido de rango (D2); el listado y el detalle **nunca** devuelven bytes ni `contenido` (D8); cola propia para que un export lento no bloquee actas ni correo (D9). **Sin** límite de solicitudes por usuario: queda como pregunta abierta, no como omisión | Modelo de 2000 filas rinde en los 3 formatos sin lanzar; el detalle no contiene `archivo` ni `contenido` |
| Migración destructiva encubierta | Un `ALTER TYPE … ADD VALUE` usado en la misma transacción; una FK que borre en cascada evidencia | **Applicable** aunque acotada | La migración es 100 % aditiva: sólo `CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX` sobre tipos y tabla **nuevos**, sin `ALTER` de nada existente, así que el gotcha de `#17` D2 no aplica. Ambas FK son `RESTRICT` (D2) | `migrate deploy` verde desde baseline; `test/schema/reportes.spec.ts` completo |
| Shell / subprocesos / Git / PR / clasificación de archivos ejecutables / enrutamiento de cliente | — | **N/A**: el change no ejecuta shell, no lanza subprocesos, no toca Git ni automatiza PR, no acepta archivos subidos (los genera, no los recibe) y no agrega superficie de frontend (D14) | — | — |

## Migración / Rollout

| # | Paso | Verificación de salida |
|---|---|---|
| R1 | Migración + `test/schema/reportes.spec.ts` | `pnpm prisma migrate deploy` verde desde baseline; `test:schema` verde |
| R2 | `modelo-reporte.ts` + `dimensiones.ts` (6 constructores) | Unit verde; `calcularEscrutinio` no invocado en modo oculto |
| R3 | `ReportesService` + `ReportesController` + `REPORTE_GENERADO` + `pnpm openapi:extract` | `POST /reportes` ⇒ `202` y fila `borrador`; descarga ⇒ `409` mientras no haya archivo |
| R4 | Worker: despachador, repo, listener y los 3 renderizadores | Un `Reporte` en `borrador` llega a `emitida` con su evento de actor poblado en ≤ 2 ciclos de polling |

Sin backfill ni feature flag: la tabla nace vacía y ningún camino existente cambia de comportamiento.
Rollback = revertir el módulo, el paquete del worker y la migración (`DROP TABLE` + `DROP TYPE` ×3).

## Preguntas abiertas

- [ ] **Cuota de solicitudes por usuario.** Un rol autorizado puede solicitar reportes sin límite y
      cada uno deja un `bytea` en la tabla. La retención/purga está fuera de alcance por la
      propuesta, así que la tabla crece de forma monótona. ¿Cuota por usuario/hora, o se difiere
      junto con la política de retención a un ítem posterior?
- [ ] **`GET /procesos/:id/reportes` (listado).** No está en la spec y sin él un cliente sólo puede
      sondear un `id` que ya conoce. Se deja fuera del alcance para no inventar contrato; la UI de
      un ítem posterior probablemente lo necesite.
- [ ] **Logo institucional en el PDF.** Misma pregunta que dejó `#17` D12 abierta y con la misma
      respuesta provisional: fuera, para no leer `bytea` en el render ni decidir escala.
