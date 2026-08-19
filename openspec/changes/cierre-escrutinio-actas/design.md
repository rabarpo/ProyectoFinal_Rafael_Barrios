# Diseño: cierre-escrutinio-actas (Backlog #17 — Cierre, escrutinio y actas)

## Enfoque técnico

Cinco piezas, en el orden en que deben existir:

1. **Una migración obligatoria sobre `Acta`** — no sólo aditiva: además de `TipoActa` +2,
   `EstadoActa` +1 y `pdf`/`pdf_mime`, la columna `contenido` cambia de `TEXT` a `JSONB` (D3), gana
   `@@unique([proceso_id, tipo])` y `@@index([estado, creado_en])`. La tabla está vacía y sin
   consumidores desde `#2`, así que el cambio de tipo es seguro; el precio es que
   `test/schema/support-tables.spec.ts` [R7] deja de compilar contra la realidad y se actualiza en el
   mismo PR (D3).
2. **Un módulo de cálculo compartido `procesos/escrutinio.ts`** (D5) del que `ResultadosService`
   pasa a colgar sin cambio de contrato observable — los dos e2e de `#16` son la red de regresión y
   corren **sin editar una línea**.
3. **`ProcesosService.cerrar()`** (D4) — espejo estructural de `abrir()`: `UPDATE … WHERE estado =
   'abierto' RETURNING`, no-op idempotente, `ConflictException` con código nuevo. Se desvía de
   `abrir()` en un punto y por una razón concreta: corre en `RepeatableRead` porque calcula el
   escrutinio dentro de la misma transacción y necesita **un solo snapshot** (mismo motivo que `#16`
   D4), lo que obliga a capturar `P2034` fuera del callback (patrón literal de `#14` D5).
4. **Un dispatcher de actas en el worker** (D10/D11), copia estructural de `outbox-dispatcher.ts` con
   cola propia, más el primer renderizador de PDF del monorepo (`pdfkit`, D12) y la primera escritura
   de auditoría hecha por el worker (D14).
5. **Dos endpoints de lectura/descarga** para el comité (D13), con las cabeceras defensivas que
   `listas.controller.ts` ya usa para servir bytes.

Sin frontend en este change (D15): la propuesta no lista ni un archivo de `apps/frontend` en
"Affected Areas". El contrato se regenera para que la vista del comité sea un slice posterior.

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Ubicación del código | Todo dentro de `ProcesosModule`, como **archivos hermanos** de `src/procesos/`: `escrutinio.ts` (cálculo compartido), `actas-contenido.ts` (armado del snapshot, puro), `actas.controller.ts`, `actas.service.ts`, `dto/cerrar-proceso.dto.ts`, `dto/cierre-respuesta.dto.ts`, `dto/acta-resumen.dto.ts`. `cerrar()` es un método más de `ProcesosService`, junto a `abrir()` | Subcarpeta `src/procesos/actas/` (lo que sugería la propuesta); módulo nuevo `src/actas/`; método más en `ProcesosController` | Desviación **declarada** respecto de la propuesta, y sólo de ubicación de archivos. Ninguna carpeta del repo tiene submódulos anidados: `procesos/` ya convive con `resultados.controller.ts`/`resultados.service.ts`/`resultados-cache.ts` como hermanos (`#16` D1), y ese es el precedente literal. Un módulo `src/actas/` tendría que reimportar `AuthModule`, `AuditoriaModule`, `PrismaService` y `cookie-parser` para leer un blob que cuelga de `ProcesoElectoral` —entidad de `procesos/`— y para escribir una transición de estado que vive en `ProcesosService`. Se separa `ActasController` de `ProcesosController` (en vez de sumar dos métodos) por el mismo criterio de `#16` D1: un controlador por superficie, aunque acá **sí** comparta `@Roles` de clase |
| D2 | Migración exacta y su gotcha de enum | **Un solo archivo** `prisma/migrations/<ts>_acta_escrutinio_pdf/migration.sql`, 100 % DDL, sin ningún `INSERT`/backfill. Orden: `ALTER TYPE "TipoActa" ADD VALUE 'escrutinio'` · `ADD VALUE 'oficial'` · `ALTER TYPE "EstadoActa" ADD VALUE 'fallido'` · `ALTER TABLE "Acta" ALTER COLUMN "contenido" TYPE JSONB USING "contenido"::jsonb` · `ADD COLUMN "pdf" BYTEA` · `ADD COLUMN "pdf_mime" TEXT` · `CREATE UNIQUE INDEX "Acta_proceso_id_tipo_key"` · `CREATE INDEX "Acta_estado_creado_en_idx"` · `ADD CONSTRAINT "acta_tipo_no_deprecado_chk" CHECK ("tipo" <> 'resultados')` | Recrear los enums desde cero (`CREATE TYPE`+`ALTER COLUMN`+`DROP TYPE`); partir la migración en dos archivos "por si acaso"; dejar `resultados` utilizable | **El gotcha es real pero no muerde acá**: Prisma envuelve cada archivo de migración en una transacción, y desde PostgreSQL 12 (el repo corre 16, ADR-0015) `ALTER TYPE … ADD VALUE` **sí** puede ejecutarse dentro de un bloque transaccional — lo que **no** puede hacerse es *usar* el valor nuevo en esa misma transacción. Como esta migración es DDL pura y ningún `INSERT`/`UPDATE`/`DEFAULT` menciona `escrutinio`/`oficial`/`fallido`, un solo archivo es correcto. **Regla que queda escrita para el futuro:** cualquier migración posterior que necesite *escribir* uno de estos valores debe ir en un archivo distinto. El `CHECK` convierte "`resultados` queda deprecado" (decisión 1 de la propuesta) de convención en garantía del motor, sin recrear el tipo — Postgres no permite `DROP VALUE`, pero sí prohibir su uso |
| D3 | `Acta.contenido`: `TEXT` → `JSONB` | **Cambio de tipo**, `contenido Json @db.JsonB` en el schema | Dejarlo `TEXT` con el JSON serializado dentro; columna nueva `contenido_json` conviviendo con la vieja | La propuesta ya exige "snapshot completo en JSON estructurado"; el desacuerdo es sólo con el tipo de la columna. `JSONB` es lo que el criterio de reproducibilidad de TECH-DESIGN.md ("un recuento directo sobre `Voto` coincide exactamente con el acta") necesita: se verifica con `SELECT contenido->'conteos'->>'votos_emitidos' FROM "Acta"` en una prueba de schema, sin deserializar en la aplicación y sin confiar en que el productor escribió JSON válido. El precedente exacto es `EventoAuditoria.payload Json @db.JsonB`. Es seguro porque `Acta` **no tiene ningún consumidor** desde `#2` (confirmado por la exploración): la tabla está vacía y `USING "contenido"::jsonb` no puede fallar sobre cero filas. **Costo real y declarado:** `test/schema/support-tables.spec.ts` [R7] inserta el literal `'contenido de prueba'`, que no es JSON válido — ese test **rompe con la migración** y se actualiza en el mismo PR a un objeto JSON. Es la única regresión conocida de la migración y está contada |
| D4 | Forma de `cerrar()` | `prisma.$transaction(cb, { isolationLevel: 'RepeatableRead' })`. **Primera** sentencia: `UPDATE "ProcesoElectoral" SET estado='cerrado', cierre_real=clock_timestamp() WHERE id=$1::uuid AND estado='abierto' RETURNING id, tipo, apertura_real, cierre_real, ocultar_resultados`. 0 filas ⇒ relectura: inexistente ⇒ `404`; `cerrado`/`acta_emitida` ⇒ **no-op idempotente 200** con el estado vigente; `borrador` ⇒ `409 PROCESO_NO_CERRABLE` con `estado` en el cuerpo. `P2034`/`40001` se captura **fuera** del callback y reintenta el camino de relectura, que devuelve el 200 no-op | `ReadCommitted` (el default, lo que usa `abrir()`); `SERIALIZABLE`; `SELECT … FOR UPDATE` previo al `UPDATE`; calcular el escrutinio fuera de la transacción y sólo insertar las actas dentro | El `UPDATE … WHERE estado='abierto' RETURNING` es el mismo mecanismo concurrency-safe de `abrir()` y se conserva tal cual: la guarda **es** la cláusula `WHERE`, no una lectura previa. Lo que sí cambia es el nivel de aislamiento, y por una razón que `abrir()` no tenía: acá la misma transacción hace después seis lecturas de agregación, y bajo `ReadCommitted` cada sentencia toma un snapshot nuevo — un voto que entre entre el `count` y el `groupBy` produce un acta cuyo cuadre **no cuadra**, que es exactamente el defecto que un acta oficial no puede tener (mismo argumento de `#16` D4, con más consecuencia). `SERIALIZABLE` agrega abortos por dependencias de lectura sin comprar nada más. `FOR UPDATE` previo es redundante: el `UPDATE` ya toma el lock de fila y además decide. El precio de `RepeatableRead` es un modo de falla nuevo y acotado: si dos `cerrar()` concurrentes se solapan, el segundo levanta `40001` (`could not serialize access due to concurrent update`) en vez de bloquear-y-ver-0-filas; se captura fuera del callback —la transacción queda abortada, igual que tras un `23505` en `#14` D5— y se responde el mismo 200 idempotente que habría respondido sin la carrera. El escrutinio **debe** ir dentro de la transacción: fuera de ella el acta describiría un instante distinto del `cierre_real` que sella |
| D5 | Extracción del cálculo de `#16` sin deriva | Módulo nuevo `procesos/escrutinio.ts` con funciones libres sobre `tx` (idioma de `materializarDerechosVoto()` en `procesos.service.ts`): `catalogoDe(tipo)`, `calcularParticipacion(tx, procesoId)` y `calcularEscrutinio(tx, procesoId, tipo)` (= participación + `blancos` + desglose). `ResultadosService.calcular()` se reescribe encima y **mapea explícitamente** al DTO, campo por campo, sin `spread` | Un `TallyService` inyectable; que `calcularEscrutinio()` devuelva directamente `ResultadosRespuestaDto`; que `ResultadosService` llame siempre a `calcularEscrutinio()` y descarte el desglose en modo oculto | Función libre y no provider porque el consumidor no está sólo en Nest: `escrutinio.ts` se prueba con un doble de `tx` sin levantar el contenedor de DI, igual que `resultados-cache.ts` se prueba sin Redis. La **partición en dos funciones no es cosmética**: la Threat Matrix de `#16` ("Fuga de resultados en modo oculto") exige que el modo oculto **no calcule** el desglose, ni siquiera para descartarlo; una única función lo violaría en silencio. El mapeo explícito preserva las tres propiedades que los e2e de `#16` asertan literalmente: el conjunto exacto de 5 claves del modo oculto (`baja_en` **no** entra al DTO público), el orden de claves y el orden del desglose — de los que depende la igualdad byte a byte de la entrada cacheada (requisito 7 de `#16`). **Criterio de aceptación de este change:** `test/resultados/*.e2e-spec.ts` y `resultados.service.spec.ts` pasan **sin editarse**; cualquier edición de esos archivos es evidencia de deriva, no de refactor |
| D6 | Forma de `Acta.contenido` | **Un esquema con raíz común y secciones**: `{ version: 1, tipo, generado_en, proceso, institucion, firmantes, notas, … }`, donde cada `tipo` agrega su sección (`apertura` / `participacion` / `escrutinio`) y `oficial` **embebe las tres**. Los cuatro snapshots se arman en `actas-contenido.ts` a partir de **un solo** resultado de `calcularEscrutinio()` | Cuatro esquemas sin raíz común; guardar el mismo blob idéntico cuatro veces; guardar sólo el JSON en `oficial` y dejar las otras tres como texto | `version` existe para que un futuro reglamento cambie la plantilla sin que leer un acta vieja sea ambiguo (el mandato "configurable/revisable" de `BACKLOG.md` es un requisito de *evolución*, y sin discriminante de versión no hay evolución segura). La raíz común lleva `firmantes` en las **cuatro** actas, no sólo en `oficial`: las cuatro se firman en el mismo acto, y el bloque de firma del PDF se dibuja desde el mismo lugar en las cuatro plantillas. `institucion: { nombre, director }` se lee de `Configuracion` **dentro** de la transacción de cierre y se congela: el worker renderiza el PDF sin consultar nada, que es la condición literal de "el PDF se renderiza a partir de ese JSON, nunca al revés" |
| D7 | Detección de empate | `max = max(desglose.votos)`; `empate = max > 0 && desglose.filter(f => f.votos === max).length >= 2`; el acta lleva `{ empate: boolean, votos_maximos: number, empatados: string[] }` con los **ids del desglose**. **Una sola agrupación por proceso** | Agrupar por `Candidato.cargo`; agrupar por "pregunta" de la consulta; declarar empate también con `max === 0`; desempatar o bloquear el cierre | Hallazgo del modelo real que corrige la letra de la propuesta: **no existe ninguna agrupación intra-proceso**. `Voto` tiene un `CHECK` de *exactamente una* elección, `Candidato.cargo` es `String?` libre sin FK ni unicidad (metadato de impresión, no clave de contienda) y **no hay modelo `Pregunta`** — `OpcionConsulta` cuelga directamente de `ProcesoElectoral`. La decisión 6 de la propuesta ("cargo de una lista, o pregunta de una consulta") describe un modelo multi-contienda que el schema no tiene; aplicada al schema real colapsa exactamente en "primer lugar del único desglose", que es lo que se implementa. `max === 0` **no** es empate: con participación cero todas las opciones comparten el 0, y rotularlo "empate" invitaría al comité a resolver una contienda que no ocurrió; el acta reporta `sin_votos: true` con su nota. El sistema nunca desempata ni bloquea (PRD). **Configurable/revisable**: si un change futuro introduce contiendas múltiples, `empate` pasa de escalar a arreglo por contienda — cambio de plantilla, no de cálculo |
| D8 | Cuadre, porcentajes y participación cero | `cuadre: { padron_total, votos_por_opcion, blancos, nulos: 0, abstenciones, cuadra: boolean }` con `abstenciones = padron_total − votos_emitidos` y `cuadra = votos_por_opcion + blancos + nulos + abstenciones === padron_total`. `porcentaje_participacion` se **almacena** en el snapshot, redondeado a 2 decimales con `Math.round(x*10000)/100`, y vale `0` cuando `padron_total === 0`. `cuadra === false` **no** bloquea el cierre: se reporta en el acta y viaja en el payload de `PROCESO_CERRADO` | Derivar los porcentajes al renderizar el PDF (idioma de `#16`, que los deja al cliente); abortar el cierre si `cuadra === false`; omitir `nulos` | Los porcentajes se almacenan —al revés que en `#16` D5— porque el consumidor es un **documento probatorio**, no una vista: si el PDF los calculara, el número impreso dejaría de estar respaldado por el snapshot y "el acta es reproducible desde su JSON" se rompería. Bloquear por `cuadra === false` sería lo peor posible: un proceso que ya está `cerrado` en la base quedaría sin acta y sin forma de emitirla, convirtiendo un defecto de conteo en una pérdida de trazabilidad; el acta es evidencia, no una compuerta. `nulos: 0` con su nota fija es literal de ADR-0008. La guarda de división por cero es doble: `padron_total === 0` ⇒ `0` (no `NaN`, no error), y `votos_emitidos === 0` ⇒ `sin_votos: true` (D7) |
| D9 | `CerrarProcesoDto` y validación de firmantes | `{ confirmar: boolean; firmantes: { nombre: string; cargo: string }[] }`, validado **a mano antes** de abrir la transacción (idioma de la casa: sin `class-validator`, igual que `AbrirProcesoDto`). `confirmar !== true` ⇒ `400 CAMPO_INVALIDO {campo:'confirmar'}`. `firmantes` no-arreglo, vacío, con más de 10 elementos, o con algún `nombre`/`cargo` vacío tras `trim()` o de más de 120 caracteres ⇒ `400 CAMPO_INVALIDO {campo:'firmantes'}`. Se persiste el valor `trim()`eado | `class-validator` sólo para este DTO; sin cota de largo; validar dentro de la transacción; resolver los firmantes desde `Usuario WHERE rol='comite'` | Espejo exacto de `abrir()`, incluido el rechazo **antes** de abrir la transacción (una transacción que se abre para morir en la primera validación es coste puro). Las cotas no son burocracia: este texto libre se dibuja en un PDF de ancho fijo, y 10 firmantes × 120 caracteres es el límite bajo el cual el bloque de firmas del layout de D12 sigue entrando en la página. No es superficie de inyección —`pdfkit` dibuja texto, no interpreta marcado—, pero sí de rotura de layout. La fuente `Usuario WHERE rol='comite'` ya quedó descartada por la decisión 5 de la propuesta (reproducibilidad tras cambios de personal) |
| D10 | Dispatcher y processor de actas en el worker | Cola **propia** `actas` (`ACTAS_QUEUE_NAME`), job `acta.pdf`, `jobId: 'acta:'+id`, `attempts: 5`, `backoff: { exponential, 2000 }` — copia estructural de `outbox-dispatcher.ts`. Polling: `acta.findMany({ where:{estado:'borrador'}, orderBy:{creado_en:'asc'}, take: limite, select:{id:true} })`. Processor **puro** `procesarActa(repo, renderer, actaId)` sobre dos puertos (`ActasRepo`, `RendererActa`), sin `PrismaClient` ni `bullmq`. `ACTAS_POLL_MS`/`ACTAS_BATCH` (defaults 5000/20) | Reutilizar la cola `correo`; un dispatcher genérico parametrizado por tabla; que el processor conozca Prisma; encolar desde el backend tras el commit | Cola separada porque los dos trabajos tienen perfiles distintos y **acoplados serían un riesgo real**: un SMTP caído satura los reintentos de `correo` durante la jornada, y el cierre —que ocurre exactamente después— quedaría detrás de esa cola. Un dispatcher genérico obligaría a abstraer `estado`, `creado_en` y el nombre de la tabla para dos usos: el duplicado explícito es más barato de leer y de cambiar. La prohibición de encolar desde el backend es literal de ADR-0018 §2 y ADR-0012: la fila `Acta` nace en la transacción del cierre (D4) y el worker la descubre por polling; cualquier barrido "desde fuera" de esa transacción está **vetado**, no desaconsejado. La forma del processor (puertos, sin capturar errores para que BullMQ reintente) es literal de `outbox-correo.processor.ts` |
| D11 | Escritura terminal y transición `cerrado → acta_emitida` | **Una transacción por acta**, en el adaptador Prisma del worker: (1) `SELECT id FROM "ProcesoElectoral" WHERE id=$1::uuid FOR UPDATE`; (2) `acta.updateMany({ where:{ id, estado:'borrador' }, data:{ pdf, pdf_mime, estado:'emitida' } })` — `count === 0` ⇒ `no-op` y fin (CAS real); (3) `eventoAuditoria.create(ACTA_GENERADA)`; (4) `acta.count({ where:{ proceso_id, estado:'emitida' } })`; (5) si `=== 4`, `procesoElectoral.updateMany({ where:{ id: proceso_id, estado:'cerrado' }, data:{ estado:'acta_emitida' } })`. `estado='fallido'` lo escribe **sólo** `actasWorker.on('failed')` cuando `attemptsMade >= attempts` | Contar sin lock; `SERIALIZABLE`; `reclamar()`+`marcarEmitida()` separados (patrón de `JobCorreo` con columna `intentos`); un barrido del backend que repare la transición; que el backend la haga en una relectura | El `FOR UPDATE` sobre `ProcesoElectoral` es la pieza no obvia y es **obligatoria**: sin él, bajo `ReadCommitted`, dos workers que terminan la 3ª y la 4ª acta en paralelo pueden ver `3` cada uno y **ninguno** transiciona — el proceso quedaría en `cerrado` para siempre con sus cuatro actas `emitida`, un estado inconsistente que ningún reintento repara. Serializar cuatro transacciones por proceso es gratis, y es exactamente lo **contrario** de lo que `#14` D4 prohibía (`FOR UPDATE OF dv`, nunca el proceso) por una razón que ya no aplica: durante la votación esa fila es caliente y bloquearla serializa la jornada entera; acá el proceso ya está `cerrado` y nadie más la toca. El CAS de un solo `UPDATE` con `estado='borrador'` en el `WHERE` es **más fuerte** que el `reclamar()`+`intentos` de `JobCorreo` (donde dos llamadas concurrentes pueden devolver `true` porque ninguna cambia el estado), así que no se replica esa columna. La transición no la hace el backend: decisión 2 de la propuesta, y hacerlo desde una relectura exigiría un polling nuevo sin beneficio |
| D12 | `pdfkit`: forma del render y determinismo | Puerto `RendererActa { render(contenido, tipo): Promise<Buffer> }` en el processor; adaptador `apps/worker/src/actas/pdfkit-renderer.ts`: `new PDFDocument({ size:'A4', margin:50, info:{ Title, CreationDate: new Date(contenido.generado_en) } })`, chunks de `doc.on('data')` ⇒ `Buffer.concat` en `doc.on('end')`. Sólo fuentes estándar (`Helvetica`/`Helvetica-Bold`), ningún TTF ni recurso externo. `pdf_mime` siempre `'application/pdf'` | Plantillas HTML + navegador headless; incrustar el logo institucional; asertar igualdad byte a byte del PDF en las pruebas | El puerto existe para que la elección de librería (decisión 4 de la propuesta, la marcada como más revisable) sea reemplazable sin tocar el processor ni el contrato JSON→PDF. Fuentes estándar y cero recursos externos mantienen la promesa de huella mínima de ADR-0007: `pdfkit` sin TTF no agrega megabytes ni un paso de build a la imagen del worker. El logo de `Configuracion` se deja **fuera a propósito**: obligaría a leer `bytea` en el render y a decidir formato/escala, y el acta es un documento tabular — queda como pregunta abierta. **Determinismo declarado:** fijar `CreationDate` desde el snapshot elimina la fuente de variación obvia, pero `pdfkit` escribe un identificador de documento propio, así que **el PDF no es byte-determinista** y las pruebas asertan estructura (cabecera `%PDF-`, tamaño > 0, texto extraído con los números clave), nunca igualdad de bytes |
| D13 | Endpoints de lectura y descarga | `ActasController`, `@Controller('procesos')`, `@UseGuards(AuthGuard, RolesGuard)`, `@Roles('administrador','director','comite')`. `GET /procesos/:id/actas` ⇒ `ActaResumenDto[]` (`{ id, tipo, estado, creado_en, pdf_disponible }`, nunca bytes ni `contenido`); `GET /procesos/:id/actas/:tipo/pdf` ⇒ `StreamableFile` con `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'` y `Content-Disposition: attachment; filename="acta-<tipo>-<id>.pdf"` | Direccionar el PDF por `acta_id`; abrir la descarga a cualquier votante con `DerechoVoto` (audiencia de `#16`); devolver `contenido` JSON por HTTP | Direccionar por `:tipo` es posible **porque** existe `@@unique([proceso_id, tipo])` (D2): el cliente descarga sin un `GET` previo y la superficie de IDOR sigue siendo un único parámetro, el `:id` del proceso, ya gateado por rol. La audiencia **no** puede ser la de `#16`: el acta de escrutinio contiene el desglose completo **siempre**, incluso con `ocultar_resultados = true` (así lo exige la decisión 1 de la propuesta), así que abrirla al votante sería una fuga lateral del gate de visibilidad de `#16` — es la fila central de la Threat Matrix. Las tres cabeceras son copia literal de `listas.controller.ts` (`GET /listas/:id/plan-trabajo`), el único precedente del repo que sirve `bytea`. `contenido` no se expone por HTTP en este change: no está en el alcance de la propuesta y merece su propio contrato (pregunta abierta) |
| D14 | Auditoría | Dos claves nuevas. `PROCESO_CERRADO`: actor = usuario del comité, `entity_type='ProcesoElectoral'`, payload `{ tipo, cierre_real, padron_total, votos_emitidos, blancos, abstenciones, cuadra, empate, sin_votos, actas_creadas: 4, firmantes: N }`. `ACTA_GENERADA`: actor **`null`** (el worker no tiene sesión), `entity_type='Acta'`, `entity_id = acta.id`, payload `{ proceso_id, tipo, bytes }`. **Cero migraciones de trigger** | Una clave por tipo de acta (`ACTA_APERTURA_GENERADA`, …); incluir `empatados` o el desglose en el payload; inventar un usuario de sistema como actor; que el worker llame a `AuditoriaService` | Ninguna de las dos claves entra en la cláusula `WHEN` del trigger `eventoauditoria_claves_eleccion_trg`, que cubre exactamente `('VOTO','RECHAZO')` — confirmado leyendo la migración, no asumido; el `CHECK` de convención (`^[A-Z_]+$`) sí las alcanza y ambas lo cumplen. **El payload no puede llevar `empatados`**: son `candidato_id`/`lista_id`/`opcion_id` con otro nombre, y aunque el trigger no los vería (busca por nombre de clave), ADR-0010 los prohíbe por sustancia, no por etiqueta. El detalle vive en `Acta.contenido`, que no es una tabla de auditoría. Clave única con `tipo` en el payload por el mismo criterio con que `#14` D11 puso `motivo` en el payload en vez de multiplicar claves. `ACTA_GENERADA` es **el primer evento de auditoría escrito por el worker**: es viable porque `seei_app` conserva `INSERT` (ADR-0015: sólo se revocaron `UPDATE/DELETE/TRUNCATE`), y se escribe con `tx.eventoAuditoria.create()` desde el adaptador Prisma —`AuditoriaService` es un provider Nest que el worker no puede importar— con el mismo shape y dentro de la misma transacción terminal de D11 |
| D15 | Alcance, dependencias y rollout | Backend: **cero** paquetes nuevos. Worker: `+pdfkit@^0.15` y `+@types/pdfkit` (dev). Frontend: **fuera de alcance**, cero archivos. `packages/contracts` se regenera. `turbo.json`, `infra/docker/docker-compose.yml`, `docs/onboarding.md` y `README.md` suman `ACTAS_POLL_MS`/`ACTAS_BATCH` donde ya documentan `OUTBOX_POLL_MS`/`OUTBOX_BATCH` | Incluir la pantalla de cierre del comité en este change; instalar `pdfkit` en el backend "por si acaso" | La propuesta enumera "Affected Areas" archivo por archivo y **no lista ni uno de `apps/frontend`**: incluir la vista sería alcance que la propuesta no aprobó, sobre un change que ya pronostica muy por encima del presupuesto de 400 líneas. El contrato regenerado deja el terreno listo para ese slice. `pdfkit` sólo en el worker mantiene la frontera de ADR-0001: el backend nunca renderiza |

## Contenido de las 4 actas (`Acta.contenido`, `version: 1`)

Raíz común a las cuatro (D6):

```jsonc
{
  "version": 1,
  "tipo": "apertura" | "cierre" | "escrutinio" | "oficial",
  "generado_en": "<ISO, = now() del snapshot de la transacción de cierre>",
  "proceso": { "id", "nombre", "tipo", "apertura_real", "cierre_real", "ocultar_resultados" },
  "institucion": { "nombre": "<Configuracion.nombre>", "director": "<Configuracion.director>" },
  "firmantes": [ { "nombre", "cargo" } ],
  "notas": [ "<texto fijo de nulos=0>", "…" ]
}
```

| `tipo` | Sección propia | Contenido |
|---|---|---|
| `apertura` | `padron` | `{ padron_total, derechos_estudiante, derechos_padre, aulas, apertura_real }` — el padrón **congelado** (`count(DerechoVoto)`), nunca `Matricula`/`Usuario` en vivo |
| `cierre` | `participacion` | `{ padron_total, votos_emitidos, abstenciones, porcentaje_participacion, quorum: { valor, informativo: true }, cierre_real }` — `quorum` es dato reportado, jamás una condición (propuesta, reglas adicionales) |
| `escrutinio` | `escrutinio` | `{ dimension, desglose: [{ id, etiqueta, votos, porcentaje, estado, baja_en }], blancos, cuadre, empate: { empate, votos_maximos, empatados }, sin_votos }` — catálogo **completo**, sin filtrar `estado='activo'` |
| `oficial` | `apertura` + `participacion` + `escrutinio` | Las tres secciones anteriores embebidas tal cual, sin recalcular nada |

Las cuatro salen de **una sola** llamada a `calcularEscrutinio()` (D5). `oficial` no vuelve a consultar
la base: `actas-contenido.ts` compone los cuatro objetos en memoria a partir del mismo resultado.

## Flujo de datos

```
POST /procesos/{id}/cerrar   { confirmar: true, firmantes: [{nombre, cargo}, …] }
  │  AuthGuard + RolesGuard  @Roles('administrador','director','comite')   → 401 / 403
  │  ParseUUIDPipe(id)                                                     → 400 si no es UUID
  ▼
ProcesosService.cerrar(id, dto, actorId)
  ├─0─ validarCerrarProcesoDto(dto)          ⇒ 400 CAMPO_INVALIDO   (D9, ANTES de la transacción)
  │
  └─ try { prisma.$transaction(tx, { isolationLevel: RepeatableRead })                       (D4)
       1. tx.$queryRaw`UPDATE "ProcesoElectoral"
                          SET estado='cerrado', cierre_real=clock_timestamp()
                        WHERE id=$1::uuid AND estado='abierto'
                       RETURNING id, tipo, apertura_real, cierre_real, ocultar_resultados`
          └─ 0 filas ⇒ relectura:  inexistente        ⇒ 404
                                   cerrado|acta_emitida ⇒ 200 no-op idempotente
                                   borrador           ⇒ 409 PROCESO_NO_CERRABLE {estado}
       2. escrutinio = calcularEscrutinio(tx, id, tipo)                                      (D5)
             ├ derechoVoto.count            → padron_total
             ├ voto.count                   → votos_emitidos
             ├ voto.count({blanco:true})    → blancos
             ├ voto.groupBy([campo])        → mapa id → votos
             └ catálogo completo (Lista|Candidato|OpcionConsulta, SIN filtro estado)
                orden: votos desc, etiqueta asc                        ← mismo criterio que #16
       3. institucion = tx.configuracion.findUnique({ clave:'institucional' })               (D6)
       4. contenidos = armarActas(proceso, escrutinio, institucion, firmantes)          (D6/D7/D8)
       5. tx.acta.createMany([apertura, cierre, escrutinio, oficial])  estado='borrador'
             └─ @@unique([proceso_id, tipo]) es la red final contra un doble cierre           (D2)
       6. auditoria.log(tx, 'PROCESO_CERRADO', actorId, 'ProcesoElectoral', id, {conteos})   (D14)
     } catch (e) { esConflictoDeSerializacion(e) ⇒ relectura en transacción limpia ⇒ 200 no-op }
  ▼
200 CierreRespuestaDto     ← 4 filas Acta 'borrador' commiteadas con el UPDATE (outbox, ADR-0012)
```

```
apps/worker  (nada de esto lo dispara el backend — ADR-0012/ADR-0018)              (D10/D11/D12)

setInterval(ACTAS_POLL_MS)
   └ despacharLoteActas(repo, actasQueue, ACTAS_BATCH)
        repo.pendientes()  → SELECT id FROM "Acta" WHERE estado='borrador'
                             ORDER BY creado_en LIMIT n         ← @@index([estado, creado_en])
        queue.addBulk(ids.map(id => ({ name:'acta.pdf', data:{ acta_id:id },
                                       opts:{ jobId:`acta:${id}`, attempts:5,
                                              backoff:{exponential, 2000} } })))

actasWorker('actas')
   └ procesarActa(repo, renderer, acta_id)                       ← PURO: dos puertos, sin Prisma
        ├ repo.leer(id) → null | estado!=='borrador'  ⇒ 'no-op'
        ├ pdf = renderer.render(contenido, tipo)       ← sin try/catch: propaga ⇒ BullMQ reintenta
        └ repo.finalizar(id, pdf)  ── transacción terminal ────────────────────────────────┐
                                                                                           │
   PrismaActasRepo.finalizar():                                                            │
     $transaction(tx):                                                                     │
       1. SELECT id FROM "ProcesoElectoral" WHERE id=$1 FOR UPDATE   ← serializa las 4      │
       2. acta.updateMany({id, estado:'borrador'} → {pdf, pdf_mime, estado:'emitida'})      │
             count===0 ⇒ 'no-op'  (CAS: otro intento ya la emitió)                          │
       3. eventoAuditoria.create('ACTA_GENERADA', actor=null, entity='Acta')                │
       4. n = acta.count({proceso_id, estado:'emitida'})                                    │
       5. n===4 ⇒ procesoElectoral.updateMany({id, estado:'cerrado'} → 'acta_emitida')      │
                                                                                           │
actasWorker.on('failed', (job,e)) ⇒ attemptsMade >= attempts ⇒ repo.marcarFallido(id) ──────┘
```

## Contratos HTTP

| Ruta | Cuerpo | Respuestas |
|---|---|---|
| `POST /procesos/{id}/cerrar` | `CerrarProcesoDto { confirmar, firmantes[] }` | `200 CierreRespuestaDto` (cerrado ahora **o** ya lo estaba, mismo cuerpo) · `400 CAMPO_INVALIDO` (`confirmar`/`firmantes`) o `:id` no-UUID · `401` · `403` rol distinto · `404` proceso inexistente · `409 PROCESO_NO_CERRABLE {estado:'borrador'}` |
| `GET /procesos/{id}/actas` | — | `200 ActaResumenDto[]` (`[]` si el proceso aún no cerró) · `400` · `401` · `403` · `404` proceso inexistente |
| `GET /procesos/{id}/actas/{tipo}/pdf` | — | `200 application/pdf` · `400` `:id` no-UUID o `tipo` fuera de `apertura\|cierre\|escrutinio\|oficial` · `401` · `403` · `404` proceso o acta inexistente · `409 ACTA_NO_EMITIDA {estado}` |

`GET /procesos/{id}/resultados` **no cambia** — ni ruta, ni cuerpo, ni códigos (D5).
`packages/contracts/openapi.json` y `src/generated/api.d.ts` se regeneran (`pnpm openapi:extract`).

## Interfaces / Contratos

```ts
// procesos/escrutinio.ts — D5. Funciones LIBRES sobre `tx` (idioma de materializarDerechosVoto()).
// La partición en dos NO es cosmética: el modo oculto de #16 no debe calcular el desglose.
export type Dimension = 'lista' | 'candidato' | 'opcion';
export type CampoVoto = 'lista_id' | 'candidato_id' | 'opcion_id';
export function catalogoDe(tipo: string): { dimension: Dimension; campo: CampoVoto };

export interface Participacion { ahora: Date; padron_total: number; votos_emitidos: number }

export interface FilaEscrutinio {
  id: string; etiqueta: string; votos: number;
  estado: 'activo' | 'baja';
  baja_en: string | null;      // SÓLO para el acta — jamás llega a ResultadosRespuestaDto (D5)
}

export interface Escrutinio extends Participacion {
  blancos: number;
  dimension: Dimension;
  desglose: FilaEscrutinio[];  // orden fijado acá: votos desc, etiqueta asc
}

export function calcularParticipacion(tx: Prisma.TransactionClient, procesoId: string): Promise<Participacion>;
export function calcularEscrutinio(tx: Prisma.TransactionClient, procesoId: string, tipo: string): Promise<Escrutinio>;
```

```ts
// procesos/procesos.errors.ts — dos códigos nuevos, aditivos (patrón as const + union).
PROCESO_NO_CERRABLE: 'PROCESO_NO_CERRABLE',  // 409: estado 'borrador' (nunca para el no-op)
ACTA_NO_EMITIDA:     'ACTA_NO_EMITIDA',      // 409: acta en 'borrador' o 'fallido', o pdf IS NULL
```

```ts
// worker/src/actas/actas.processor.ts — D10. Puertos, nunca Prisma ni BullMQ (patrón literal de
// outbox-correo.processor.ts). Sin try/catch: un fallo de render DEBE propagar para que BullMQ
// reintente; `fallido` lo escribe sólo el listener on('failed') de main.ts.
export interface ActaPendiente { id: string; proceso_id: string; tipo: TipoActa; estado: EstadoActa; contenido: unknown }
export interface RendererActa { render(contenido: unknown, tipo: TipoActa): Promise<Buffer> }
export interface ActasRepo {
  leer(id: string): Promise<ActaPendiente | null>;
  /** Transacción terminal completa de D11: CAS + auditoría + conteo + transición del proceso. */
  finalizar(id: string, pdf: Buffer): Promise<'emitida' | 'no-op'>;
  marcarFallido(id: string): Promise<void>;
  pendientes(limite: number): Promise<string[]>;
}
export function procesarActa(repo: ActasRepo, renderer: RendererActa, actaId: string): Promise<'emitida' | 'no-op'>;
```

```sql
-- prisma/migrations/<ts>_acta_escrutinio_pdf/migration.sql — D2. DDL PURO.
-- PG16 admite ADD VALUE dentro del bloque transaccional de Prisma; lo que NO admite es USAR el
-- valor nuevo en la misma transacción. Por eso este archivo no lleva ningún INSERT/UPDATE/DEFAULT
-- que mencione 'escrutinio'/'oficial'/'fallido'. Cualquier migración FUTURA que necesite
-- escribirlos debe ir en un archivo separado.
ALTER TYPE "TipoActa"   ADD VALUE 'escrutinio';
ALTER TYPE "TipoActa"   ADD VALUE 'oficial';
ALTER TYPE "EstadoActa" ADD VALUE 'fallido';
ALTER TABLE "Acta" ALTER COLUMN "contenido" TYPE JSONB USING "contenido"::jsonb;  -- tabla vacía
ALTER TABLE "Acta" ADD COLUMN "pdf" BYTEA;
ALTER TABLE "Acta" ADD COLUMN "pdf_mime" TEXT;
CREATE UNIQUE INDEX "Acta_proceso_id_tipo_key"  ON "Acta"("proceso_id", "tipo");
CREATE INDEX        "Acta_estado_creado_en_idx" ON "Acta"("estado", "creado_en");
-- 'resultados' no se puede DROP (Postgres); se prohíbe su uso, que es el efecto buscado.
ALTER TABLE "Acta" ADD CONSTRAINT "acta_tipo_no_deprecado_chk" CHECK ("tipo" <> 'resultados');
```

Claves de auditoría nuevas: **dos** (`PROCESO_CERRADO`, `ACTA_GENERADA`), ambas fuera de la cláusula
`WHEN` del trigger de ADR-0016 — sin migración de trigger (D14).

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modificar | D2/D3 — `TipoActa` +2, `EstadoActa` +1, `contenido Json @db.JsonB`, `pdf`/`pdf_mime`, `@@unique([proceso_id, tipo])`, `@@index([estado, creado_en])` |
| `apps/backend/prisma/migrations/<ts>_acta_escrutinio_pdf/migration.sql` | Crear | D2 — DDL puro, con el comentario del gotcha de `ADD VALUE` |
| `apps/backend/src/procesos/escrutinio.ts` (+ `.spec.ts`) | Crear | D5 — `catalogoDe`, `calcularParticipacion`, `calcularEscrutinio` |
| `apps/backend/src/procesos/resultados.service.ts` | Modificar | D5 — delega en `escrutinio.ts`; mapeo explícito al DTO, sin `spread`; **cero cambio de contrato** |
| `apps/backend/src/procesos/actas-contenido.ts` (+ `.spec.ts`) | Crear | D6/D7/D8 — puro: `armarActas()`, cuadre, empate, porcentajes, notas |
| `apps/backend/src/procesos/procesos.service.ts` | Modificar | D4 — método `cerrar()` + `esConflictoDeSerializacion()` |
| `apps/backend/src/procesos/procesos.errors.ts` | Modificar | `PROCESO_NO_CERRABLE`, `ACTA_NO_EMITIDA` (aditivo) |
| `apps/backend/src/procesos/dto/cerrar-proceso.dto.ts` · `cierre-respuesta.dto.ts` · `acta-resumen.dto.ts` | Crear | D9/D13 — DTO planos con `@ApiProperty`, sin `class-validator` |
| `apps/backend/src/procesos/actas.service.ts` · `actas.controller.ts` (+ `.spec.ts`) | Crear | D13 — listado y descarga con `StreamableFile` y cabeceras defensivas |
| `apps/backend/src/procesos/procesos.controller.ts` | Modificar | `POST /:id/cerrar` (`@HttpCode(200)`), idioma de `abrir()` |
| `apps/backend/src/procesos/procesos.module.ts` | Modificar | `+ActasController` (antes de `ProcesosController`), `+ActasService`, `cookie-parser` `forRoutes` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | D14 — `PROCESO_CERRADO`, `ACTA_GENERADA` + entrada de bitácora |
| `apps/backend/test/schema/support-tables.spec.ts` | **Modificar (regresión conocida)** | D3 — `[R7]` inserta `'contenido de prueba'`, que no es JSON válido; pasa a un objeto JSON |
| `apps/backend/test/schema/actas.spec.ts` | Crear | D2 — enums, `@@unique`, `CHECK` de `resultados`, `contenido` JSONB consultable |
| `apps/backend/test/procesos/procesos-cerrar.e2e-spec.ts` | Crear | D4/D6/D7/D8 — idempotencia, estados, cuadre, empate, participación cero, baja |
| `apps/backend/test/procesos/actas-descarga.e2e-spec.ts` | Crear | D13 — roles, `409 ACTA_NO_EMITIDA`, cabeceras, `application/pdf` |
| `apps/worker/package.json` | Modificar | D15 — `+pdfkit@^0.15`, `+@types/pdfkit` (dev) |
| `apps/worker/src/actas/actas-dispatcher.ts` (+ `.spec.ts`) | Crear | D10 — espejo de `outbox-dispatcher.ts`, cola `actas` |
| `apps/worker/src/actas/actas.repo.ts` | Crear | D11 — adaptador Prisma, transacción terminal con `FOR UPDATE` |
| `apps/worker/src/actas/pdfkit-renderer.ts` (+ `.spec.ts`) | Crear | D12 — único archivo que importa `pdfkit` |
| `apps/worker/src/processors/actas.processor.ts` (+ `.spec.ts`) | Crear | D10 — puro, dos puertos |
| `apps/worker/src/main.ts` | Modificar | D10/D11 — `Queue`/`Worker` de `actas`, `setInterval`, listener `failed` |
| `turbo.json` · `infra/docker/docker-compose.yml` · `docs/onboarding.md` · `README.md` | Modificar | D15 — `ACTAS_POLL_MS`/`ACTAS_BATCH` junto a los `OUTBOX_*` |
| `packages/contracts/openapi.json` · `src/generated/api.d.ts` | Modificar | Regenerar tras D13 |
| `apps/backend/test/resultados/*.e2e-spec.ts` · `resultados.service.spec.ts` | **Sin cambios (explícito)** | D5 — red de regresión de `#16`; editarlos es evidencia de deriva |

## Estrategia de pruebas

TDD estricto (`openspec/config.yaml`, `strict_tdd: true`; `pnpm turbo run test`): cada fila se escribe
en RED antes del código que la satisface.

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Schema (`pg` crudo) | `TipoActa` tiene los 5 valores y `EstadoActa` los 3; `INSERT` con `tipo='resultados'` ⇒ error del `CHECK`; segunda `Acta` con el mismo `(proceso_id, tipo)` ⇒ `23505` sobre `Acta_proceso_id_tipo_key`; `contenido` acepta un objeto y se consulta con `contenido->'cuadre'->>'padron_total'`; `contenido` inválido como JSON ⇒ error del motor; el índice `Acta_estado_creado_en_idx` existe | `test/schema/actas.spec.ts`, patrón de `outbox.spec.ts` + `expect-pg-error.ts` |
| Unit (Jest) — `escrutinio.ts` | Las 4 dimensiones de `catalogoDe`; opciones con 0 votos **presentes**; candidato/lista en `baja` presente con `estado` **y** `baja_en`; orden `votos` desc + `etiqueta` asc; `Σ desglose + blancos === votos_emitidos`; `calcularParticipacion` **no** ejecuta `groupBy` ni el `findMany` del catálogo (spy sobre el doble) | Doble de `Prisma.TransactionClient`; sin Postgres |
| Unit (Jest) — `actas-contenido.ts` | Empate con 2 y con 3 máximos; **sin** empate con `max === 0`; `cuadra` verdadero en el caso feliz y falso en un desglose manipulado; `padron_total === 0` ⇒ `porcentaje 0`, sin `NaN` ni excepción; `nulos === 0` y su nota presente; las 4 actas comparten la raíz común y `oficial` embebe las tres secciones; los firmantes llegan `trim()`eados | Puro, sin base |
| Unit (Jest) — `ProcesosService.cerrar()` | `confirmar !== true` ⇒ `400` **sin abrir transacción** (spy sobre `$transaction`); firmantes vacío/>10/campo vacío/>120 chars ⇒ `400`; `P2034` ⇒ relectura y `200`, sin propagar; payload de `PROCESO_CERRADO` **sin** `candidato_id`/`lista_id`/`opcion_id`/`blanco`/`eleccion`/`empatados` | `PrismaService` y `AuditoriaService` mockeados (patrón `procesos.service.spec.ts`) |
| E2E (Postgres real) — cierre | `abierto` ⇒ `200` + `estado='cerrado'` + `cierre_real` no nulo + **4** filas `Acta` en `borrador` con `contenido` JSON; segunda llamada ⇒ `200` idéntico y siguen 4 actas; `borrador` ⇒ `409 PROCESO_NO_CERRABLE`; UUID inexistente ⇒ `404`; rol `estudiante` ⇒ `403`; proceso con 0 votos ⇒ `200` con abstención total y las 4 actas; candidato dado de baja aparece con `estado:'baja'` y `baja_en` en el acta de escrutinio; empate real ⇒ `empate:true` con los ids; `SELECT count(*) FROM "Voto"` coincide con `contenido->'cuadre'` (reproducibilidad de TECH-DESIGN.md) | `test/procesos/procesos-cerrar.e2e-spec.ts`, patrón de `procesos-abrir.e2e-spec.ts` |
| E2E — concurrencia del cierre | Dos `POST /cerrar` con `Promise.all` ⇒ exactamente **4** filas `Acta`, un solo `PROCESO_CERRADO`, ningún `5xx`; arnés determinista con `pg` crudo: `BEGIN` + `UPDATE … estado='cerrado'` sin commit, disparar el endpoint, commitear el crudo ⇒ el endpoint responde el `200` no-op (ejercita el `catch` de `P2034` de D4) | `test/schema/helpers/pg-client.ts` + `fetch`, patrón de `votos-concurrencia.e2e-spec.ts` |
| E2E — descarga | `403` con rol `estudiante`; `409 ACTA_NO_EMITIDA` con el acta en `borrador`; tras marcarla `emitida` con `pdf`, `200` con `content-type: application/pdf`, `Content-Disposition: attachment`, `nosniff` y cuerpo que empieza en `%PDF-`; `tipo` fuera del enum ⇒ `400`; proceso inexistente ⇒ `404` | `test/procesos/actas-descarga.e2e-spec.ts` |
| Unit (Vitest, worker) | `despacharLoteActas` ⇒ `jobId: 'acta:<id>'`, `attempts: 5`, `backoff` exponencial; lote vacío ⇒ **no** llama `addBulk`; `procesarActa` con acta inexistente / no-`borrador` ⇒ `'no-op'` **sin** renderizar; `render` que rechaza ⇒ propaga y **no** se llama `finalizar`; `finalizar` que devuelve `'no-op'` (CAS perdido) no rompe; `pdfkit-renderer` produce un `Buffer` que empieza en `%PDF-` y cuyo texto extraído contiene los conteos del snapshot; render de un snapshot con 0 votos y con 10 firmantes no lanza | Vitest con dobles de los puertos, patrón de `outbox-dispatcher.spec.ts`/`outbox-correo.processor.spec.ts` |
| E2E (Postgres real) — transición terminal | Marcar 3 actas `emitida` ⇒ el proceso sigue `cerrado`; la 4ª ⇒ pasa a `acta_emitida` y hay **4** eventos `ACTA_GENERADA` con `actor_usuario_id IS NULL`; ejecutar `finalizar` dos veces sobre la misma acta ⇒ una sola transición y un solo evento; **carrera real**: dos conexiones `pg` finalizando la 3ª y la 4ª en paralelo ⇒ el proceso **sí** llega a `acta_emitida` (esta prueba falla sin el `FOR UPDATE` de D11) | `test/procesos/actas-transicion.e2e-spec.ts` con `createPgClient()` |
| Auditoría `[TM4]` | Un `INSERT` directo de `PROCESO_CERRADO`/`ACTA_GENERADA` con `{"detalle":{"candidato_id":…}}` **no** dispara `AU002` (el trigger sólo cubre `VOTO`/`RECHAZO`) — se deja constancia de que la protección de esas dos claves es de código (D14), no del motor; ambas cumplen el `CHECK` `^[A-Z_]+$` | `test/schema/auditoria.spec.ts`, caso `[TM4]` existente |
| Regresión de `#16` | `test/resultados/resultados.e2e-spec.ts`, `resultados-cache.e2e-spec.ts` y `resultados.service.spec.ts` pasan **sin editarse** tras la extracción de D5 | Suite existente; cualquier edición se trata como fallo de diseño |
| Contract | `pnpm openapi:extract` corre sin Postgres ni Redis con `ActasController` registrado; las tres rutas nuevas aparecen con sus códigos | Job de CI existente |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| Fuga del gate `ocultar_resultados` por la puerta lateral del acta | Un votante descarga el acta de escrutinio de un proceso con resultados ocultos y ve el desglose completo antes del cierre público | **Applicable — riesgo central del change** | Las tres rutas de actas llevan `RolesGuard` + `@Roles('administrador','director','comite')` a nivel de clase; el acta **nunca** se sirve a la audiencia de `#16` (D13); el listado no expone `contenido` | `403` para `estudiante` en listado y descarga; `403` para un `estudiante` **con** `DerechoVoto` en ese proceso |
| Secreto del voto en auditoría | `empatados` (que son `candidato_id`) en el payload de `PROCESO_CERRADO`; desglose completo en `ACTA_GENERADA`; payload construido por *spread* del snapshot | **Applicable** — ADR-0010/ADR-0016 | Payloads canónicos y cerrados, sólo conteos y booleanos, construidos campo por campo (D14); el detalle vive en `Acta.contenido`, que no es tabla de auditoría; el trigger **no** cubre estas claves, así que la barrera es de código y se prueba como tal | Aserción sobre las claves exactas de ambos payloads; `[TM4]` documenta que el trigger no las alcanza |
| Concurrencia del cierre | Doble clic del comité; dos miembros cerrando a la vez; cierre mientras entran votos | **Applicable** | `WHERE estado='abierto'` como única guarda (D4); `RepeatableRead` ⇒ escrutinio de un solo snapshot; `P2034` capturado fuera ⇒ `200` no-op; `@@unique([proceso_id, tipo])` como red final contra 8 actas | `Promise.all` de dos cierres ⇒ 4 actas; arnés `pg` determinista del `catch` de `P2034` |
| Proceso atascado entre `cerrado` y `acta_emitida` | Dos workers cierran la 3ª y la 4ª acta en paralelo y ninguno observa `count === 4` | **Applicable — el modo de falla es permanente y silencioso** | `SELECT … FOR UPDATE` sobre `ProcesoElectoral` al inicio de la transacción terminal (D11) | Carrera real de dos conexiones `pg`; la prueba **debe fallar** si se quita el `FOR UPDATE` |
| Doble render / entrega at-least-once | BullMQ reentrega un job ya procesado; dos workers toman el mismo `acta:<id>` | **Applicable** — ADR-0012 declara la entrega at-least-once | Dos capas: `jobId: 'acta:'+id` en Redis y el CAS real `updateMany WHERE estado='borrador'` en Postgres (D11), que hace del segundo intento un `no-op` sin doble evento de auditoría | `finalizar` dos veces ⇒ un evento y una transición |
| Fallo permanente de render invisible | Un acta que nunca se puede renderizar queda indistinguible de una recién creada | **Applicable** | Tercer estado `fallido` (D2), escrito **sólo** por `on('failed')` al agotar `attempts` (D11) — paridad exacta con `EstadoJobCorreo`; el endpoint responde `409 ACTA_NO_EMITIDA` con `estado` para que el comité vea la causa | `attemptsMade >= attempts` ⇒ `marcarFallido`; `attemptsMade < attempts` ⇒ **no** se marca |
| Entrada de texto libre en un documento generado | Firmantes con 5 000 caracteres, cadenas de control, cadena vacía, arreglo vacío | **Applicable** | Cotas de D9 (≤10 firmantes, ≤120 caracteres, no vacíos tras `trim`), aplicadas antes de la transacción; `pdfkit` **dibuja** texto, no interpreta marcado, así que no hay superficie de inyección — sí de rotura de layout | Los cuatro casos ⇒ `400 CAMPO_INVALIDO {campo:'firmantes'}`; render con 10 × 120 caracteres no lanza |
| Migración destructiva encubierta | El `ALTER COLUMN … TYPE JSONB` corre sobre una tabla con filas de texto no-JSON; un `ADD VALUE` usado en la misma transacción | **Applicable** — es la única migración no puramente aditiva del change | `Acta` está vacía y sin consumidores desde `#2` (verificado); la migración es DDL puro sin uso de los valores nuevos (D2); `support-tables.spec.ts` se actualiza en el mismo PR (D3) | `migrate deploy` verde desde baseline; `test/schema/actas.spec.ts` completo |
| Denegación por polling / tamaño de payload | El dispatcher barre `Acta` cada 5 s; PDFs grandes en `bytea` inflando la respuesta | **Applicable** | `@@index([estado, creado_en])` hace el barrido un recorrido de rango sobre ≤4 filas por proceso (D2); el listado **nunca** devuelve bytes ni `contenido` (D13); un acta escolar típica es de decenas de KB | Listado ⇒ el cuerpo no contiene `pdf` ni `contenido` |
| Shell / subprocesos / Git / PR / clasificación de archivos ejecutables / enrutamiento de cliente | — | **N/A**: el change no ejecuta shell, no lanza subprocesos, no toca Git ni automatiza PR, no acepta archivos subidos (los PDF los **genera** el sistema, no los recibe) y no agrega superficie de frontend (D15) | — | — |

## Migración / Rollout

| # | Paso | Verificación de salida |
|---|---|---|
| R1 | Migración + `test/schema/actas.spec.ts` + actualización de `support-tables.spec.ts` [R7] | `pnpm prisma migrate deploy` verde desde baseline; `test:schema` verde |
| R2 | `escrutinio.ts` extraído; `ResultadosService` colgado de él | Los tres archivos de prueba de `#16` verdes **sin editarse** |
| R3 | `cerrar()` + DTO + errores + `actas-contenido.ts` + `PROCESO_CERRADO` | `POST /procesos/:id/cerrar` ⇒ `estado='cerrado'` y 4 `Acta` en `borrador` |
| R4 | `ActasController`/`ActasService` + `pnpm openapi:extract` | Contrato regenerado con las tres rutas; descarga ⇒ `409` mientras no haya PDF |
| R5 | Worker: `pdfkit`, dispatcher, processor, repo, `main.ts` | Los 4 PDFs se emiten y el proceso llega a `acta_emitida` |
| R6 | Documentar `ACTAS_POLL_MS`/`ACTAS_BATCH` (turbo, compose, onboarding, README) | `pnpm turbo run test` toma las variables; los defaults funcionan sin definirlas |

**Rollback.** Greenfield, sin datos de producción. El código se revierte con `git revert` sin dejar
estado huérfano: las `Acta` en `borrador` dejan de procesarse y `ProcesoElectoral.estado` puede
quedar en `cerrado`, valor válido del enum desde `#2`. La migración es **casi** aditiva y su reversa
tiene dos costos distintos: `pdf`/`pdf_mime`/los índices/el `CHECK` se revierten con `DROP`; los
valores de enum exigen recrear el tipo y sólo son seguros si ninguna fila los usa; y `contenido`
volver a `TEXT` **pierde la estructura** salvo que se acepte el `::text` del JSON. En la práctica el
rollback correcto es revertir el código y dejar la migración puesta.

**Corte de PR sugerido para `sdd-tasks`** (pronóstico: 1 100-1 400 líneas, muy por encima del
presupuesto de 400 ⇒ PR encadenados obligatorios): **PR1** migración + pruebas de schema +
`support-tables.spec.ts` corregido; **PR2** `escrutinio.ts` extraído con la suite de `#16` intacta
(indivisible: la extracción y su prueba de no-regresión viajan juntas); **PR3** `cerrar()` + DTO +
errores + `actas-contenido.ts` + auditoría + unit/e2e (la transacción completa, indivisible por la
misma razón que `#14` PR2); **PR4** endpoints de lectura/descarga + contrato regenerado; **PR5**
worker completo (dependencia, dispatcher, processor, repo, renderer, `main.ts`, transición terminal)
+ documentación de las variables de entorno.

## Reconciliación con la propuesta

| Texto de `proposal.md` | Estado |
|---|---|
| Decisión 1 — `TipoActa` +`escrutinio`/`oficial`, `resultados` deprecado; 4 actas atómicas al cerrar | **Compatible y reforzado** (D2): el deprecado pasa de convención a `CHECK` del motor |
| Decisión 2 — el worker hace `cerrado → acta_emitida` al emitir la 4ª acta | **Compatible, con una condición que la propuesta no vio** (D11): sin `FOR UPDATE` sobre `ProcesoElectoral`, dos workers concurrentes pueden dejar el proceso atascado en `cerrado` con las 4 actas emitidas |
| Decisión 3 — cierre siempre manual, `cerrar()` idempotente | **Compatible** (D4). El rechazo de voto por hora de `votos.service.ts` no se toca |
| Decisión 4 — `pdfkit` | **Compatible** (D12), con puerto `RendererActa` para que la revisión de esa decisión no arrastre al processor |
| Decisión 5 — firmantes en `CerrarProcesoDto`, congelados en el snapshot | **Compatible** (D9/D6), con cotas de largo/cantidad que la propuesta no fijaba y que el layout del PDF exige |
| Decisión 6 — empate = máximo compartido "dentro de la misma agrupación (cargo de una lista, o pregunta de una consulta)" | **Compatible en su efecto, con una corrección declarada** (D7): el schema real **no tiene agrupaciones** (`Voto` elige exactamente una opción; `Candidato.cargo` es texto libre sin FK; no existe modelo `Pregunta`). La regla colapsa en "primer lugar del único desglose". Se agrega una precisión que la propuesta no fijaba: con `max === 0` no se declara empate |
| Decisión 7 — `EstadoActa` +`fallido`, escrito al agotar los reintentos de BullMQ | **Compatible** (D2/D11), copia literal del listener `on('failed')` de `#15` |
| Reglas adicionales — cuadre, nulos 0, participación cero, quórum informativo, baja, reproducibilidad | **Compatible** (D6/D8), con dos precisiones: los porcentajes se **almacenan** (al revés que en `#16`) porque el acta debe ser reproducible desde su JSON, y `cuadra === false` se reporta pero **nunca** bloquea el cierre |
| "`Acta` +`pdf Bytes?`, `+pdf_mime String?`" | **Compatible y ampliado** (D2/D3): además `contenido` pasa a `JSONB`, más `@@unique([proceso_id, tipo])` y `@@index([estado, creado_en])`. La propuesta ya exigía "JSON estructurado"; acá se le da el tipo de columna que corresponde |
| "`apps/backend/src/procesos/actas/` (nuevo módulo)" | **Desviación declarada, sólo de ubicación** (D1): archivos hermanos en `src/procesos/`, sin subcarpeta ni módulo nuevo — ninguna carpeta del repo anida submódulos y `#16` ya fijó el precedente |
| "Endpoint de lectura de actas… alcance exacto de rutas/roles se resuelve en `sdd-design`" | **Resuelto** (D13): dos rutas, roles `administrador\|director\|comite`, PDF por `:tipo` |

## Preguntas abiertas

- [ ] **`representante_aula` con varias aulas agrega globalmente.** `ProcesoAula` admite N aulas y
      `catalogoDe()` (heredado de `#16`) cuenta todos los `Candidato` del proceso en un solo
      desglose, sin partir por aula — así que un proceso de representantes con 3 aulas produce **un**
      ganador, no tres. `Candidato.aula` es `String?` libre, sin FK a `Aula`, así que ni siquiera hay
      con qué agrupar de forma confiable. Este diseño **replica** el comportamiento vigente de `#16`
      a propósito (no inventa una regla que ninguna spec definió), pero el acta lo hace visible de
      una forma que la vista en vivo no hacía. Corresponde escalarlo: o el comité crea un proceso por
      aula, o un change futuro agrega la contienda al modelo (y con ella el empate por contienda de
      D7).
- [ ] **`Acta.contenido` no se expone por HTTP.** El comité sólo puede leer el PDF. Un
      `GET /procesos/:id/actas/:tipo` que devuelva el JSON sería barato y útil para una vista de
      escrutinio, pero está fuera del alcance de la propuesta (D13).
- [ ] **El logo institucional no se dibuja en el acta** (D12): incrustarlo obliga a leer `bytea` en
      el render y a decidir formato/escala. Si el reglamento futuro lo exige, entra al snapshot como
      dato congelado, no como consulta del worker.
- [ ] **La pantalla de cierre del comité no existe** (D15). Mientras tanto, el riesgo que la propuesta
      levantó —la ventana entre la hora prevista y el cierre manual— no tiene ninguna señal en la UI:
      un proceso `abierto` que ya no acepta votos se ve igual que uno votándose. Es una brecha
      operativa real, no sólo cosmética, y debe entrar al backlog junto con la vista de descarga.
- [ ] **Verificar al aplicar**: la última `0.15.x` de `pdfkit` y que `@types/pdfkit` la acompañe. Si
      hubiera que subir de línea mayor, es un cambio de versión en `package.json`, no de diseño — el
      puerto `RendererActa` (D12) mantiene el processor indiferente.
- [ ] **`Configuracion.nombre`/`director` son `String?`.** Si el singleton nunca se completó, el acta
      imprime la institución vacía. Este change no agrega una validación de cierre por eso (sería un
      bloqueo nuevo sin fuente); el acta reporta lo que hay. Un reglamento futuro puede exigirlos.
