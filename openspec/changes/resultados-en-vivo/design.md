# Diseño: resultados-en-vivo (Backlog #16 — Resultados en vivo)

## Enfoque técnico

Cuatro piezas que no se solapan:

1. **Un controlador hermano dentro de `procesos/`** — `ResultadosController` con `@Controller('procesos')`
   y `@UseGuards(AuthGuard)` **sin** `RolesGuard`, porque el `ProcesosController` existente lleva
   `@Roles('administrador','director','comite')` **a nivel de clase** y la audiencia de #16 es
   cualquier votante autenticado (TECH-DESIGN.md Flujo 4, `proposal.md` decisión 2). El módulo no
   cambia de dueño: `ocultar_resultados` vive en `ProcesoElectoral`, que es de `procesos/`.
2. **Un `ResultadosService` de sólo lectura** que autoriza por **pertenencia** (`DerechoVoto`) antes
   de tocar nada más, y calcula participación + desglose en **una sola transacción `RepeatableRead`**
   (D4) para que `votos_emitidos`, `blancos` y el desglose sean aritméticamente coherentes entre sí.
   Reutiliza el idioma `count()`/`groupBy()` de `padron.service.ts`/`opciones.service.ts`, sin SQL
   crudo salvo el sello de hora.
3. **Una caché corta en Redis** (`SETEX resultados:{proceso_id} 8 <json>`) sobre el `REDIS_CLIENT`
   ya existente, con **autocomprobación de `proceso_id` al deserializar** (D7) y **degradación a
   cálculo directo** si Redis no responde (D8). Sin invalidación activa: el TTL es la única garantía
   de frescura (`proposal.md` decisión 3).
4. **El primer consumidor real de React Query del repo** — `QueryProvider` montado **dentro** de
   `AuthGuard` (D9), hook `useResultadosEnVivo` con `refetchInterval` de 15 s (D10), y componentes
   `recharts` que eligen barras o pastel según un campo `dimension` que **decide el servidor** (D12).
   `usePadronEnVivo.ts` no se toca (`proposal.md` decisión 5).

Sin migración de schema, sin índices nuevos, sin backfill (D13). Todo el modelo de datos ya existe
desde `#2`/`#13`/`#14`.

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Ubicación del código backend | Módulo `procesos/` existente, con **controlador propio**: `procesos/resultados.controller.ts` (`ResultadosController`, `@Controller('procesos')`, `@Get(':id/resultados')`, `@UseGuards(AuthGuard)`), `procesos/resultados.service.ts`, `procesos/resultados-cache.ts` (puro), `procesos/dto/resultados-respuesta.dto.ts`. `procesos.module.ts` suma `redisProvider`, los dos providers nuevos y el controlador al `forRoutes` de `cookie-parser` | Un método más en `ProcesosController`; un módulo nuevo `resultados/`; un controlador bajo `votos/` (approach B de `exploration.md`) | Un método en `ProcesosController` **no puede** abrir la audiencia: `RolesGuard` está aplicado a nivel de clase y `@Roles()` es `getAllAndOverride([handler, class])`. Existe un truco —`@Roles()` sin argumentos guarda `[]`, y el guard devuelve `true` con lista vacía— pero es un doble negativo ilegible que deja la ruta abierta por un detalle de implementación del guard, no por una declaración explícita. Un controlador hermano expresa lo mismo que `votos.controller.ts` ya expresa hoy (`AuthGuard` solo, sin `@Roles`), que es el precedente literal del repo. Un módulo `resultados/` nuevo tendría que reimportar `AuthModule`, `PrismaService`, `redisProvider` y `cookie-parser` para leer un flag (`ocultar_resultados`) que pertenece a `ProcesoElectoral`, entidad de `procesos/`. Los patrones de ruta no chocan: `/procesos/:id` (2 segmentos) nunca casa `/procesos/:id/resultados` (3); aun así `ResultadosController` va **primero** en `controllers: []`, mismo criterio de "rutas estáticas primero" que ya documenta `procesos.controller.ts` |
| D2 | Autorización y orden de comprobaciones | `count(DerechoVoto WHERE proceso_id AND usuario_id) === 0 ⇒ ForbiddenException()` **vacía**, como **primera** operación, **antes** de leer `ProcesoElectoral` y antes de consultar la caché | Leer el proceso primero y `404` si no existe; `@Roles('...')` con audiencia amplia; cachear también la autorización | Leer el proceso primero convierte al endpoint en **oráculo de existencia**: un `404` distinguible de un `403` deja enumerar qué `proceso_id` existen. La regla de no-oráculo es la misma de `#14` D9/D13 y `#15` D11 (`403` idéntico para ajeno e inexistente), y el requisito 1 de la spec la extiende a nivel de pertenencia de grupo. La comprobación es barata: `@@unique([proceso_id, usuario_id, en_calidad_de])` tiene `(proceso_id, usuario_id)` como **prefijo**, así que es un recorrido de rango sobre índice, no un scan. Va antes de la caché a propósito: la autorización es **por usuario** y la caché es **por proceso**; cachear la autorización introduciría retraso de revocación (un derecho revocado seguiría autorizando hasta 8 s) a cambio de ahorrar una lectura indexada. El costo real y aceptado: en ráfaga, cada petición cuesta **una** lectura indexada aunque la caché acierte — lo que ADR-0005 pide abaratar es la **agregación** (5-6 consultas incluido un `groupBy`), no el chequeo de sesión/pertenencia |
| D3 | ¿Guard explícito de `estado = borrador`? | **No.** Ninguna comprobación de `estado`; `abierto`, `cerrado` y `acta_emitida` recorren exactamente el mismo camino, y `borrador` cae por D2. Se deja **constancia en comentario** de que el invariante es propiedad de `#13` ("`DerechoVoto` se materializa en la apertura"), más un e2e que lo fija | `if (proceso.estado === 'borrador') throw new ConflictException(PROCESO_NO_ABIERTO)`; `403` explícito por estado además del de pertenencia | Revisado con criterio crítico, tal como pidió el encargo, y **se confirma** el criterio de `sdd-spec` — pero por una razón más fuerte que "es redundante": *cualquier* guard de estado tiene sólo dos formas posibles y ambas empeoran el diseño. (a) Si devuelve un código **distinto** (`409 PROCESO_NO_ABIERTO`), es un **oráculo**: le confirma a un usuario no autorizado que ese `proceso_id` existe y en qué estado está — exactamente lo que D2 y el requisito 1 de la spec existen para impedir. (b) Si devuelve el **mismo `403` opaco**, es indistinguible por observación del rechazo por pertenencia: agrega un segundo sitio donde vive la política de estados (que habría que mantener sincronizado con `#17` y con todo estado futuro) a cambio de **cero** cambio observable. El invariante del que depende no es accidental: la spec de `#13` ata la creación de `DerechoVoto` a la apertura, y `PadronService` **no materializa** derechos a propósito ("Cálculo de padrón en vivo sin materialización"). Si algún change futuro materializara derechos antes de abrir, la consecuencia sería exponer `votos_emitidos = 0` sobre un padrón ya conocido por su titular — sin fuga de preferencia. Se paga la deuda con un e2e explícito (`borrador ⇒ 403`) que **falla** si ese invariante se rompe, que es la forma barata y no-oráculo de proteger la regla |
| D4 | Forma exacta de la consulta de agregación | Una **transacción interactiva** `prisma.$transaction(async (tx) => …, { isolationLevel: RepeatableRead })` con: `tx.procesoElectoral.findUnique({select:{tipo,ocultar_resultados}})`, `tx.derechoVoto.count({where:{proceso_id}})`, `tx.voto.count({where:{proceso_id}})`, `tx.voto.count({where:{proceso_id, blanco:true}})`, `tx.voto.groupBy({by:['lista_id'\|'opcion_id'\|'candidato_id'], where:{proceso_id, <campo>:{not:null}}, _count:{_all:true}})` y el `findMany` del **catálogo completo** de la dimensión. El `groupBy` se combina en memoria con el catálogo (`mapa.get(id) ?? 0`) | `$transaction([...])` en lote (idioma de `padron.service.ts`); sin transacción, consultas sueltas; `SERIALIZABLE`; derivar `votos_emitidos` de la suma del desglose; `groupBy` como única fuente del desglose | El lote `$transaction([...])` **no sirve acá**: la dimensión del desglose (`lista`/`opcion`/`candidato`) depende de `proceso.tipo`, que sólo se conoce tras la primera lectura — no hay forma de ramificar dentro de un array literal. `RepeatableRead` da **un solo snapshot** para todas las sentencias: sin él (READ COMMITTED, el default) un voto que entre entre el `count` y el `groupBy` produce un pastel cuyas porciones suman **más** que el total, que es justo el defecto que un gráfico hace visible. `SERIALIZABLE` se descarta porque puede abortar con `40001` frente a la escritura concurrente de votos; una transacción **de sólo lectura** en `RepeatableRead` no puede fallar por serialización en Postgres, así que da la coherencia sin el modo de falla. El catálogo completo es obligatorio: `groupBy` sólo devuelve filas **existentes**, así que un candidato con 0 votos desaparecería del gráfico; el `?? 0` sobre un `Map` es el patrón literal de `PadronService` (`estudiantesPorAula.get(aulaId) ?? 0`). El catálogo se lee **sin** filtrar `estado: 'activo'` — a diferencia de `PapeletaService.obtenerOpciones()`, que sí filtra: la papeleta es *qué se puede elegir*, el resultado es *qué se eligió*, y omitir a un candidato dado de baja haría que la suma del desglose fuera menor que `votos_emitidos`. Cada fila lleva su `estado` para que la vista lo rotule. `votos_emitidos` se lee con su propio `count` y **no** se deriva de la suma: el mismo snapshot garantiza `Σ desglose + blancos === votos_emitidos`, y tenerlos por separado convierte esa igualdad en una **aserción de prueba** en vez de una tautología |
| D5 | Forma del DTO de respuesta | **Un solo DTO** (`ResultadosRespuestaDto`) con los tres campos de modo visible (`dimension`, `desglose`, `blancos`) **ausentes** (`undefined`, no `null`) en modo oculto. `estado_visibilidad: 'visible' \| 'oculto'` es el discriminante | Dos DTO con `oneOf`/`@ApiExtraModels` en OpenAPI; un DTO con `desglose: X[] \| null`; `desglose: []` vacío en modo oculto | Dos clases obligan a una unión en `packages/contracts/src/generated/api.d.ts`, y entonces el frontend tiene que **estrechar el tipo antes de leer `votos_emitidos`**, que existe idéntico en ambas variantes — fricción real por seguridad nula, ya que `estado_visibilidad` ya discrimina. El idioma de la casa es exactamente este: `ComprobanteDto` es el **mismo cuerpo** en `201` y `200` (`#14` D6, "el cliente nunca distingue el camino por el cuerpo"). Se rompe deliberadamente con el `\| null` de `PapeletaDto.comprobante` en un punto: el requisito 3 de la spec dice que la respuesta oculta contiene **sólo** cinco campos, y `"desglose": null` es una **sexta clave**; `[]` es peor todavía, porque afirma "hay desglose y está vacío". La clave ausente es la única forma que satisface el texto literalmente, y es verificable con `expect(Object.keys(body).sort())`, que es la aserción que la spec pide de hecho. `dimension` viaja en modo visible en vez de `tipo`: el cliente no debe re-derivar la regla de negocio "`municipio` ⇒ listas" (ADR-0005: "toda la verdad vive en el servidor"), sólo consumir qué **son** los ítems que recibió |
| D6 | Qué significa `hora_servidor` | El **instante en que se calculó** el dato servido, sellado por Postgres con `SELECT now()` **dentro** de la transacción de D4, y cacheado junto al resto del payload. No es "ahora" en el momento de la respuesta | `clock_timestamp()` por petición fuera de la caché; `new Date()` de Node al responder; dos campos (`hora_servidor` + `calculado_en`) | Es la consecuencia honesta de cachear: dentro de la ventana, todas las respuestas describen el **mismo** cálculo, así que su hora debe ser la de ese cálculo. La alternativa —sellar la hora fresca en cada respuesta— exige un viaje a Postgres **por petición** aunque la caché acierte, que es precisamente el costo que la caché existe para eliminar, y produce un payload que se contradice (una hora de "ahora" sobre datos de hace 7 s). `now()` (= `transaction_timestamp()`) y no `clock_timestamp()` porque dentro de una transacción `RepeatableRead` `now()` **es** el instante del snapshot; `clock_timestamp()` avanzaría unos milisegundos por detrás del dato que describe. Un segundo campo se descarta porque el requisito 3 cierra el conjunto de campos del modo oculto en cinco. **Costo asumido y declarado:** ADR-0005 dice que el cliente corrige su desfase local contra esta hora, y acá esa corrección arrastra hasta el TTL (8 s) de error. Es tolerable porque #16 no muestra ninguna cuenta regresiva ni decide validez temporal; `#17` (cierre) **no** debe usar este campo para nada probatorio — para eso está `ProcesoElectoral.cierre_real`, sellado en la transacción de cierre |
| D7 | Clave, TTL e invalidación de Redis | Clave `resultados:{proceso_id}` (prefijo nuevo y disjunto de `session:`/`session:user:`/`recovery:`/los de bloqueo e importación). Valor: **envoltorio** `{ proceso_id, payload }` serializado, escrito con `SETEX` y TTL `RESULTADOS_CACHE_TTL_SECONDS` (default **8**, mismo idioma de env que `SESSION_TTL_SECONDS`/`RECOVERY_TTL_SECONDS`). Al leer, **autocomprobación**: `envoltorio.proceso_id !== procesoId ⇒ tratar como miss`. **Sin invalidación activa**; el TTL es la única garantía de frescura | Clave por usuario/rol; guardar sólo el payload sin envoltorio; `DEL` al emitir cada voto; `SET NX` con mutex anti-estampida; caché en memoria del proceso Node | La clave no varía por usuario ni por rol **porque el payload no lo hace**: el requisito 3 exige que el comité reciba exactamente el mismo cuerpo, y esa igualdad es la que hace legítimo compartir una sola entrada. El envoltorio con `proceso_id` cuesta ~40 bytes y convierte cualquier error futuro de derivación de clave en un **miss** (recalcular) en vez de una **fuga cruzada** (servir el proceso equivocado) — es la respuesta concreta y comprobable al requisito 7 ("MUST NOT servir datos de un `proceso_id` distinto"), y se prueba sin Redis porque `resultados-cache.ts` es puro. Sin invalidación activa por lo que dice `proposal.md`, y porque acoplar `votos.service.ts` al módulo de resultados metería una escritura de Redis dentro de la transacción crítica del voto — un modo de falla nuevo en el camino que `#15` D4 acaba de dejar atómico. La caché **no puede quedar obsoleta en dirección peligrosa**: `ocultar_resultados` es **inmutable una vez `abierto`** (`#13`), así que el modo de visibilidad horneado en la entrada no puede volverse más permisivo que la configuración vigente; si `#17` lo relaja al cerrar, la entrada vieja muestra *menos* de lo permitido durante ≤8 s, que es la dirección segura. La estampida (dos misses simultáneos que calculan en paralelo) se **acepta y se declara**, no se resuelve con mutex: un `SET NX` agrega un modo de falla (el que toma el lock muere ⇒ el resto espera) para cerrar una ventana de milisegundos que sólo produce dos respuestas que difieren en un voto |
| D8 | Qué pasa si Redis no responde | **Degrada**: `try/catch` acotado **sólo** a `redis.get` y `redis.setex` — se registra el fallo y se calcula contra Postgres. Los errores de Prisma **no** se capturan y siguen burbujeando | Dejar burbujear el error de Redis (patrón literal de `session.service.ts`, `bloqueo.service.ts`, `recovery.service.ts`, `importacion.service.ts`, que no capturan nada) | Es una desviación consciente del patrón del repo, y la razón es una diferencia de **rol**, no de gusto: en todos esos consumidores Redis **es la fuente de verdad** (la sesión, el contador de bloqueo, el token, el CSV transitorio) y fallar cerrado es lo único correcto porque no hay dato alternativo. Acá Redis es una **caché** sobre un cálculo exacto que Postgres puede rehacer, así que fallar cerrado apagaría la vista de resultados para toda la jornada por un incidente que no afecta al dato. El contraargumento obvio —"sin caché, la ráfaga de cierre golpea Postgres mil veces"— **no es alcanzable**: `AuthGuard` llama a `SessionService.obtener()`, que hace `redis.get` **antes** de que la petición llegue al controlador; con Redis caído ninguna petición autenticada llega a este servicio. La degradación sólo se ejercita en fallas **parciales** (OOM al escribir, evicción de la clave por política de memoria, timeout de un comando suelto), y en todas ellas degradar es estrictamente mejor que un `500`. El `catch` es deliberadamente estrecho: envolver el cálculo entero escondería un fallo de Postgres detrás de un "cache miss" |
| D9 | Dónde vive `QueryClientProvider` | Componente nuevo `apps/frontend/src/app/QueryProvider.tsx` (`useState(crearQueryClient)`), montado en `App.tsx` **dentro** de `AuthGuard` y envolviendo a `AppShell`: `AuthProvider > AuthGuard > QueryProvider > AppShell > Enrutador`. Defaults en `apps/frontend/src/app/query-client.ts`: `retry: 0`, `refetchOnWindowFocus: false`, `staleTime: 0` | Envolver todo en `main.tsx` o por fuera de `AuthProvider`; `QueryClient` como singleton de módulo; reintentos por defecto de React Query (3, con backoff) | No existe ningún provider raíz de datos hoy: `main.tsx` monta `<App/>` y `App.tsx` es la composición `AuthProvider > AuthGuard > AppShell > Enrutador`, así que hay que crearlo. Ponerlo **dentro** de `AuthGuard` es la decisión de fondo: al cerrar sesión el guard desmonta su subárbol, el `QueryClient` muere con él y la caché de consultas se descarta **sin** cablear ningún `queryClient.clear()` manual — la misma disciplina de "la sesión, no la URL, decide" que ya rige el enrutador (`#12` D11). Un singleton de módulo sobreviviría entre tests y entre sesiones, que es exactamente lo contrario. `retry: 0` porque el repo no reintenta en ninguna capa de fetch (`usePadronEnVivo` marca `error: true` al primer fallo) y porque una vista que sondea cada 15 s ya es su propio reintento; además reintentar un `403` es ruido puro. `refetchIntervalInBackground` se deja en su default (`false`): una pestaña de fondo **no** debe sondear, que es justo el escenario de mil pestañas olvidadas que ADR-0005 teme |
| D10 | Intervalo de sondeo | **15 s** (`INTERVALO_SONDEO_MS = 15_000`, exportado desde el módulo del hook para que una vista de proyección futura lo sobrescriba — ADR-0005: "configurable por vista") | 10 s (piso del rango); 30 s (techo); igualar el TTL (8 s) | El rango de ADR-0005 es 10-30 s y cualquier valor dentro cumple; se elige 15 s por su relación con el TTL de 8 s, que es la única restricción técnica real. Un intervalo **menor o igual** al TTL garantiza que una fracción de los sondeos devuelva bytes idénticos (viaje desperdiciado); 10 s deja apenas 2 s de margen, y con el jitter de red y el desfase entre clientes una porción apreciable de sondeos cae dentro de la misma ventana. 15 s casi duplica el TTL: prácticamente todo sondeo cruza al menos un vencimiento y puede traer dato nuevo. 30 s se descarta por el extremo opuesto: en los minutos finales de la jornada la vista se sentiría congelada, y el sondeo **es** la definición operativa de "tiempo real" que ADR-0005 adoptó al rechazar SSE/WebSockets. Costo declarado: ~1.000 pestañas activas a 15 s ⇒ ~67 pet/s, que la caché de 8 s reduce a ≤ 0,125 agregaciones/s por proceso |
| D11 | Ubicación y ruta del frontend | Carpeta nueva `apps/frontend/src/resultados/` (`resultados-api.ts`, `useResultadosEnVivo.ts`, `ResultadosPage.tsx`, `piezas/*`), ruta **plana** `/resultados/:procesoId` (variante `{ nombre: 'resultados'; procesoId }` en `rutas.ts` + caso en `Enrutador.tsx`) | Colgar todo de `apps/frontend/src/procesos/`; ruta `/procesos/:id/resultados` espejando la del backend | La asimetría con el backend es deliberada y tiene una causa distinta en cada lado. En el **backend** manda la propiedad del dato: `ocultar_resultados` es columna de `ProcesoElectoral`, que es de `procesos/` (D1). En el **frontend** manda la audiencia: `procesos/` es hoy la superficie de **gestión del comité** (`ProcesoWizardPage`, `AperturaProcesoPage`, `ProcesosIndexPage`), y una página para cualquier votante sería el único archivo de esa carpeta fuera de ese gate. La carpeta `votos/` ya establece el precedente de "carpeta del votante". La ruta plana aplica el criterio explícito de `#14` D14 y `#15` D12 —"el votante no gestiona, ejerce"— que es por lo que existen `/votar/:derechoVotoId` y `/comprobante/:votoId` fuera de `/procesos`. `/resultados` sin id cae en `no-encontrada`, igual que `/comprobante` sin id: no hay listado agregado en este change |
| D12 | Componentes de gráfico | El servidor manda `dimension`; la vista mapea: `'opcion'` ⇒ `PieChart`; `'lista'` y `'candidato'` ⇒ `BarChart` horizontal (`layout="vertical"`). `blancos` se dibuja como categoría propia, con token de color distinto, nunca mezclado con candidatos. Orden **determinista y decidido en el servidor**: `votos` desc, `etiqueta` asc como desempate. Cada gráfico va acompañado de una `<table>` con los mismos números | Elegir el gráfico según `tipo` en el cliente; pastel para todo; barras para todo; ordenar en el cliente; sólo SVG sin tabla | Los cuatro `tipo` del schema se reparten en tres dimensiones reales, que es lo que `PapeletaService.obtenerOpciones()` ya codifica: `municipio` ⇒ `Lista`, `consulta` ⇒ `OpcionConsulta`, y `representante_aula`/`padres` ⇒ `Candidato`. El pastel corresponde a `consulta` porque una consulta es una **partición** de la papeleta en pocas categorías excluyentes (A/B/C, sí/no) y la pregunta del lector es "qué proporción eligió cada una". Las barras corresponden a listas y candidatos porque ahí la pregunta es **el orden** ("quién va adelante"), y comparar longitudes es fiable mientras comparar ángulos de porciones deja de serlo pasadas ~4 categorías; horizontal porque los nombres de candidato y lista son etiquetas largas que en vertical se truncan o rotan. El orden se decide en el servidor por dos motivos: mantiene el criterio de ADR-0005 y hace el payload cacheado **estable byte a byte**, que es lo que permite la aserción de igualdad literal del requisito 7. La tabla espejo no es adorno: `recharts` produce SVG sin semántica accesible, y además es la superficie sobre la que las pruebas de Vitest pueden asertar (bajo jsdom, `ResponsiveContainer` mide 0×0 y no dibuja) |
| D13 | Rollout y dependencias | **Sin migración, sin índices nuevos, sin backfill.** Dependencias nuevas **sólo** en `apps/frontend/package.json`: `@tanstack/react-query@^5` y `recharts@^2`. Backend: cero paquetes nuevos (`ioredis` y `REDIS_CLIENT` ya existen). `turbo.json` suma `RESULTADOS_CACHE_TTL_SECONDS` a `test:e2e.env` | Agregar `@@index([proceso_id, lista_id])`/`[proceso_id, candidato_id]`/`[proceso_id, opcion_id]` a `Voto`; `recharts@^3`; tabla de agregados (approach C, ya descartado en `proposal.md`) | El change es de **sólo lectura** sobre un modelo completo: no hay columna, tabla ni dato que crear, y el rollback es `git revert` más el vencimiento solo de claves con TTL de 8 s. Los índices se descartan **por ahora** con número, no por pereza: `@@unique([proceso_id, derecho_voto_id])` ya da recorrido por rango sobre `proceso_id`, y con el orden de magnitud declarado (~1.000 votos por proceso) el `groupBy` es un HashAggregate sobre un puñado de páginas, que además corre **una vez cada 8 s** por proceso gracias a D7. Si algún proceso superara las decenas de miles de votos, el índice de cobertura es una migración aditiva posterior sin cambio de contrato. `recharts@^2` y no `^3` porque el frontend está en React `^18.3.1` y la línea 2.x declara soporte de React 16-18; **verificar la última 2.x al instalar**. `@tanstack/react-query@^5` requiere React 18+, que se cumple |

## Flujo de datos

```
GET /procesos/{id}/resultados          (ResultadosController, AuthGuard SOLO — sin RolesGuard, D1)
  │  ParseUUIDPipe(id)                                    → 400 si no es UUID
  │  AuthGuard → SessionService.obtener() → redis.get     → 401 sin cookie/sesión
  ▼
ResultadosService.obtener(procesoId, sesion)
  │
  ├─1─ AUTORIZACIÓN (siempre, nunca cacheada — D2)
  │     prisma.derechoVoto.count({ where: { proceso_id, usuario_id } })
  │        └── 0 ⇒ ForbiddenException()   ← mismo 403 opaco para: ajeno, inexistente y BORRADOR (D3)
  │
  ├─2─ CACHÉ (D7/D8)
  │     GET resultados:{proceso_id}
  │        ├── hit  → JSON.parse → envoltorio.proceso_id === procesoId ? payload : (tratar como miss)
  │        └── error de Redis → log + seguir como miss   (degrada, NO 500 — D8)
  │
  ├─3─ CÁLCULO (sólo en miss)  prisma.$transaction(tx, { isolationLevel: RepeatableRead })   (D4)
  │     ├ tx.procesoElectoral.findUnique   select { tipo, ocultar_resultados }
  │     ├ tx.$queryRaw`SELECT now() AS ahora`             ← instante DEL SNAPSHOT (D6)
  │     ├ tx.derechoVoto.count({ proceso_id })            → padron_total   (padrón congelado, #13)
  │     ├ tx.voto.count({ proceso_id })                   → votos_emitidos
  │     └ si ocultar_resultados === false:
  │         ├ tx.voto.count({ proceso_id, blanco: true }) → blancos
  │         ├ tx.voto.groupBy({ by: [<campo de la dimensión>], where: { proceso_id, <campo>: { not: null } },
  │         │                  _count: { _all: true } })
  │         └ tx.<catálogo>.findMany({ where: { proceso_id } })   ← SIN filtro estado:'activo' (D4)
  │            └ combinación en memoria:  catálogo × mapa(groupBy)  con `?? 0`
  │               orden: votos desc, etiqueta asc                  ← estable byte a byte (D12)
  │
  ├─4─ SETEX resultados:{proceso_id} 8 JSON({ proceso_id, payload })
  │        └── error de Redis → log + responder igual   (D8)
  ▼
200 ResultadosRespuestaDto

    tipo del proceso        dimension     campo de Voto    catálogo          gráfico (D12)
    ─────────────────────   ───────────   ──────────────   ───────────────   ──────────────
    municipio               'lista'       lista_id         Lista             barras
    representante_aula      'candidato'   candidato_id     Candidato         barras
    padres                  'candidato'   candidato_id     Candidato         barras
    consulta                'opcion'      opcion_id        OpcionConsulta    pastel
```

Frontend (primer consumidor de React Query del repo):

```
main.tsx → App.tsx
   AuthProvider → AuthGuard → QueryProvider → AppShell → Enrutador        (D9)
                                  │                          │
                       useState(crearQueryClient)            └─ case 'resultados'
                       muere con la sesión al                     → <ResultadosPage procesoId/>
                       desmontarse AuthGuard                            │
                                                                        ├ useResultadosEnVivo(procesoId)
                                                                        │    useQuery({ queryKey: ['resultados', procesoId],
                                                                        │               refetchInterval: 15_000,   (D10)
                                                                        │               retry: 0 })
                                                                        │
                                                                        ├ <PanelParticipacion/>      siempre
                                                                        ├ estado_visibilidad === 'visible'
                                                                        │    → <GraficoDesglose dimension .../> + <table>
                                                                        └ estado_visibilidad === 'oculto'
                                                                             → <AvisoResultadosOcultos/>, sin gráfico
```

## Contratos HTTP

| Ruta | Cuerpo | Respuestas |
|---|---|---|
| `GET /procesos/{id}/resultados` | — | `200 ResultadosRespuestaDto` · `400` `id` no-UUID (`ParseUUIDPipe`) · `401` sin cookie de sesión · `403` sin `DerechoVoto`, proceso inexistente **o** proceso en `borrador` (idéntico, sin cuerpo discriminante) |

Sin cambios en ningún endpoint existente. `packages/contracts/openapi.json` y `src/generated/api.d.ts`
se regeneran (`pnpm openapi:extract`) **antes** de escribir una sola línea de frontend.

## Interfaces / Contratos

```ts
// procesos/dto/resultados-respuesta.dto.ts — D5. UN solo DTO; los tres campos de modo visible
// quedan AUSENTES (undefined) en modo oculto: `null` o `[]` serían una sexta clave y el requisito 3
// cierra el conjunto en cinco.
export class ResultadoOpcionDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) etiqueta!: string;
  @ApiProperty({ type: Number }) votos!: number;
  @ApiProperty({ type: String }) estado!: 'activo' | 'baja';  // OpcionConsulta: siempre 'activo'
}

export class ResultadosRespuestaDto {
  @ApiProperty({ type: String })  estado_visibilidad!: 'visible' | 'oculto';
  @ApiProperty({ type: Boolean }) resultados_ocultos_por_configuracion!: boolean;
  @ApiProperty({ type: Number })  votos_emitidos!: number;
  @ApiProperty({ type: Number })  padron_total!: number;
  @ApiProperty({ type: String })  hora_servidor!: string;      // ISO — instante del cálculo (D6)

  @ApiPropertyOptional({ type: String })                 dimension?: 'lista' | 'candidato' | 'opcion';
  @ApiPropertyOptional({ type: () => [ResultadoOpcionDto] }) desglose?: ResultadoOpcionDto[];
  @ApiPropertyOptional({ type: Number })                 blancos?: number;
}
```

`estado_visibilidad` y `resultados_ocultos_por_configuracion` son **hoy** redundantes
(`'oculto' ⟺ true`), y la spec exige ambos. Se conservan separados a propósito y con una unitaria
que fija la equivalencia: existen como campos distintos para que `#17` pueda expresar un
"oculto **porque el proceso todavía no cerró**" (`estado_visibilidad: 'oculto'` con
`resultados_ocultos_por_configuracion: false`) sin romper el contrato ni reinterpretar un booleano.

Campos que **no** existen a propósito: `porcentaje_participacion` y `abstenciones` (el cliente los
deriva de los dos enteros — `proposal.md` decisión 1 y requisito 5 de la spec) y `nulos` (ADR-0008:
no existe el voto nulo; una columna constante en 0 sólo invitaría a interpretarla).

```ts
// procesos/resultados-cache.ts — PURO, sin ioredis: se prueba en Jest sin Redis (D7).
export const TTL_RESULTADOS_SEGUNDOS = Number(process.env.RESULTADOS_CACHE_TTL_SECONDS ?? 8);

export function claveResultados(procesoId: string): string {
  return `resultados:${procesoId}`;             // prefijo disjunto de session:/session:user:/recovery:
}

export interface EnvoltorioResultados {
  proceso_id: string;                            // autocomprobación: un error de derivación de clave
  payload: ResultadosRespuestaDto;               // se degrada a MISS, nunca a fuga cruzada
}

export function serializar(procesoId: string, payload: ResultadosRespuestaDto): string;
export function deserializar(procesoId: string, crudo: string | null): ResultadosRespuestaDto | null;
```

```ts
// procesos/resultados.service.ts — orden de operaciones NO negociable (D2): la autorización es
// lo primero y nunca se cachea; ProcesoElectoral no se lee antes de ella (no-oráculo).
async obtener(procesoId: string, sesion: SesionUsuario): Promise<ResultadosRespuestaDto>
```

Tras autorizar, `procesoElectoral.findUnique` **no puede** devolver `null`:
`DerechoVoto.proceso_id` es una FK con `onDelete: Restrict`, así que la existencia de un derecho
prueba la del proceso. El caso imposible se cierra con el mismo `ForbiddenException()` opaco, nunca
con un `404`.

Claves de auditoría nuevas: **ninguna**. Es una lectura, mismo criterio que `PadronService`
(`#13` D6) y `PapeletaService` (`#14` D13).

## Verificación del requisito 7 contra la implementación concreta

El requisito 7 está redactado sin nombrar Redis a propósito. Esta es la comprobación explícita de
que la implementación de D7 satisface cada una de sus cuatro obligaciones observables:

| Obligación del requisito 7 | Cómo la satisface el diseño | Cómo se prueba |
|---|---|---|
| "lecturas repetidas… dentro de una ventana corta… con el mismo valor" | Dentro del TTL, toda lectura devuelve el **mismo string** de la entrada `resultados:{proceso_id}`; el orden del desglose lo fija el servidor (D12) y el payload se serializa una sola vez, así que la igualdad es **byte a byte**, no sólo semántica | e2e: una lectura de **cebado**, luego emitir un voto nuevo, luego N lecturas ⇒ cuerpos idénticos. El cebado es obligatorio: sin él la prueba corre contra la estampida y es intermitente |
| "ventana corta (segundos de un dígito)" | TTL por defecto **8** s, dentro del rango 5-10 s de ADR-0005 y de un solo dígito. Configurable por `RESULTADOS_CACHE_TTL_SECONDS` sin tocar código | Unitaria pura de `TTL_RESULTADOS_SEGUNDOS === 8`; e2e que asserta el `TTL` real de la clave con `redis.ttl()` |
| "MUST NOT servir datos de un `proceso_id` distinto al solicitado" | Tres barreras encadenadas: (a) la clave **contiene** el `proceso_id`, ya validado como UUID por `ParseUUIDPipe`, así que no puede llevar `:` ni comodines ni empalmar otra clave; (b) el prefijo `resultados:` es disjunto de todos los namespaces existentes; (c) **autocomprobación** `envoltorio.proceso_id === procesoId` al deserializar — si no coincide se trata como miss y se recalcula | Unitaria pura: `deserializar('A', serializar('B', …)) === null`. e2e: dos procesos `A` y `B` consultados en sucesión inmediata, cuerpos disjuntos y coherentes con sus propios padrones |
| "tras vencer la ventana… MUST reflejar los votos emitidos hasta ese momento" | No hay refresco en segundo plano ni invalidación activa: al vencer, la siguiente lectura **recalcula** contra Postgres dentro del snapshot de D4. La cota de frescura es exactamente el TTL | e2e: cebar, votar, `DEL resultados:{id}` desde el cliente Redis de la prueba (equivalente observable al vencimiento, sin dormir 8 s en CI) y verificar que la tercera lectura ya incluye el voto |

Dos propiedades adicionales que el requisito no pide pero que la implementación debe sostener y que
conviene dejar escritas:

- **La entrada cacheada nunca puede ser más permisiva que la configuración vigente.** El modo de
  visibilidad queda horneado en el payload, y eso sólo es seguro porque `#13` declaró
  `ocultar_resultados` **inmutable una vez `abierto`**. Si un change futuro lo volviera mutable
  durante la jornada, una entrada de hasta 8 s podría seguir sirviendo un desglose completo después
  de que alguien ocultara los resultados. El diseño depende de ese invariante ajeno: queda
  registrado acá y en un comentario del servicio.
- **La estampida de arranque en frío es una desviación acotada y aceptada.** Dos misses simultáneos
  calculan en paralelo y pueden devolver valores que difieren en un voto, aunque ambos caigan dentro
  de la misma "ventana corta". Se acepta en vez de introducir un mutex `SET NX` (D7); la ventana es
  el intervalo entre el primer miss y su `SETEX`, y la garantía del requisito rige plenamente para
  toda lectura posterior al primer llenado.

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/src/procesos/resultados.controller.ts` | Crear | D1 — `@Controller('procesos')`, `@Get(':id/resultados')`, `@UseGuards(AuthGuard)` sin `@Roles()`, `ParseUUIDPipe`, `@ApiResponse` 200/400/401/403 |
| `apps/backend/src/procesos/resultados.service.ts` | Crear | D2/D4/D6/D7/D8 — autorización, caché, agregación en `RepeatableRead` |
| `apps/backend/src/procesos/resultados-cache.ts` | Crear | D7 — clave, TTL, envoltorio y autocomprobación; puro, sin `ioredis` |
| `apps/backend/src/procesos/dto/resultados-respuesta.dto.ts` | Crear | D5 — `ResultadosRespuestaDto` + `ResultadoOpcionDto` |
| `apps/backend/src/procesos/procesos.module.ts` | Modificar | D1 — `+redisProvider`, `+ResultadosService`, `+ResultadosController` (primero en `controllers`), `cookie-parser` `forRoutes` |
| `apps/backend/src/procesos/*.spec.ts` | Crear | Unitarias de `resultados-cache.ts` y `ResultadosService` con dobles |
| `apps/backend/test/resultados/resultados.e2e-spec.ts` | Crear | Autorización, modos oculto/visible, estados del proceso, padrón congelado |
| `apps/backend/test/resultados/resultados-cache.e2e-spec.ts` | Crear | Requisito 7: ráfaga, no-mezcla `A`/`B`, vencimiento, `redis.ttl()` |
| `turbo.json` | Modificar | D13 — `test:e2e.env += RESULTADOS_CACHE_TTL_SECONDS` |
| `infra/docker/docker-compose.yml` · `docs/onboarding.md` · `README.md` | Modificar | D13 — documentar `RESULTADOS_CACHE_TTL_SECONDS` (opcional, default 8) |
| `packages/contracts/openapi.json` · `src/generated/api.d.ts` | Modificar | Regenerar (`pnpm openapi:extract`) **antes** de tocar el frontend |
| `apps/frontend/package.json` | Modificar | D13 — `+@tanstack/react-query@^5`, `+recharts@^2` |
| `apps/frontend/src/app/query-client.ts` | Crear | D9 — `crearQueryClient()` con `retry: 0`, `refetchOnWindowFocus: false` |
| `apps/frontend/src/app/QueryProvider.tsx` (+ `.spec.tsx`) | Crear | D9 — `useState(crearQueryClient)` + `QueryClientProvider` |
| `apps/frontend/src/app/App.tsx` | Modificar | D9 — `QueryProvider` **dentro** de `AuthGuard`, envolviendo `AppShell` |
| `apps/frontend/src/app/rutas.ts` (+ `rutas.spec.ts`) | Modificar | D11 — variante `{ nombre: 'resultados'; procesoId }` + `rutaAPath` |
| `apps/frontend/src/app/Enrutador.tsx` (+ `.spec.tsx`) | Modificar | D11 — caso `resultados` ⇒ `<ResultadosPage/>` |
| `apps/frontend/src/resultados/resultados-api.ts` | Crear | D11 — wrapper tipado sobre `createSeeiClient`, idioma de `procesos-api.ts` |
| `apps/frontend/src/resultados/useResultadosEnVivo.ts` (+ `.spec.ts`) | Crear | D10 — `useQuery` + `refetchInterval` 15 s + `INTERVALO_SONDEO_MS` exportado |
| `apps/frontend/src/resultados/ResultadosPage.tsx` (+ `.spec.tsx`) | Crear | D11 — contenedor: todos los efectos y los estados cargando/error/oculto/visible |
| `apps/frontend/src/resultados/piezas/PanelParticipacion.tsx` (+ `.spec.tsx`) | Crear | Presentacional: emitidos, padrón, % y abstenciones **derivados en el cliente** |
| `apps/frontend/src/resultados/piezas/GraficoDesglose.tsx` (+ `.spec.tsx`) | Crear | D12 — `PieChart`/`BarChart` según `dimension` + `<table>` espejo |
| `apps/frontend/src/resultados/piezas/AvisoResultadosOcultos.tsx` (+ `.spec.tsx`) | Crear | Mensaje de "resultados ocultos hasta el cierre", sin gráfico |
| `apps/frontend/src/procesos/usePadronEnVivo.ts` | **Sin cambios (explícito)** | `proposal.md` decisión 5 — cero líneas modificadas, verificable en el diff |

## Estrategia de pruebas

TDD estricto (`openspec/config.yaml`): cada fila se escribe en RED antes del código que la satisface.

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (Jest, backend) — puro | `claveResultados()` ⇒ `resultados:{uuid}`; `TTL_RESULTADOS_SEGUNDOS === 8` y respeta el env; `serializar`/`deserializar` ida y vuelta; **`deserializar` con `proceso_id` ajeno ⇒ `null`**; `deserializar(null)` ⇒ `null`; JSON corrupto ⇒ `null` sin lanzar | Jest puro, **sin Redis y sin Prisma** — `resultados-cache.ts` no importa `ioredis` |
| Unit (Jest, backend) — servicio | Oculto ⇒ `Object.keys(body).sort()` es **exactamente** los 5 campos (sin `desglose`/`blancos`/`dimension`); visible ⇒ `Σ desglose.votos + blancos === votos_emitidos`; opciones con 0 votos **presentes**; candidato/lista en `baja` **presente** con su `estado`; orden `votos` desc + `etiqueta` asc; una `dimension` por cada uno de los 4 `tipo`; hit de caché ⇒ **ninguna** consulta de agregación (spy sobre el doble de Prisma — criterio de éxito literal de `proposal.md`); miss ⇒ `setex` con TTL 8; `redis.get` que **rechaza** ⇒ `200` calculado igual y sin propagar; `setex` que rechaza ⇒ `200` igual; `count(DerechoVoto) === 0` ⇒ `ForbiddenException` **antes** de cualquier agregación; `estado_visibilidad === 'oculto' ⟺ resultados_ocultos_por_configuracion === true` | `PrismaService` mockeado y `{ provide: REDIS_CLIENT, useValue: { get: jest.fn(), setex: jest.fn() } }` — el idioma exacto de `health.controller.spec.ts`. Sin Postgres, sin Redis |
| E2E (Postgres + Redis reales) — contrato | `401` sin cookie; `403` sin `DerechoVoto`; `403` `proceso_id` inexistente **con el mismo cuerpo**; `403` proceso en `borrador` (D3); `400` `id` no-UUID; `200` oculto con el conjunto exacto de 5 campos; `200` visible con desglose; **comité y estudiante reciben cuerpos idénticos** (comparación literal de ambos `body`); proceso `cerrado` calcula igual que `abierto`; `padron_total` no cambia tras mover una matrícula de aula después de la apertura | `test/resultados/resultados.e2e-spec.ts`, patrón de `test/votos/comprobante-autenticado.e2e-spec.ts` (fetch real + `PrismaClient` para preparar filas) |
| E2E (Redis real) — requisito 7 | Cebar con una lectura; emitir un voto; N lecturas ⇒ cuerpos **byte a byte idénticos**; `redis.ttl('resultados:{id}')` ∈ (0, 8]; `DEL` de la clave ⇒ la siguiente lectura ya incluye el voto; procesos `A` y `B` en sucesión inmediata ⇒ sin mezcla; con la clave conteniendo un envoltorio de otro proceso (inyectado a mano) ⇒ se recalcula y responde lo correcto | `test/resultados/resultados-cache.e2e-spec.ts`, con cliente `ioredis` propio de la prueba. **Sin `sleep` de 8 s**: el `DEL` es el equivalente observable del vencimiento |
| Schema (`pg` crudo) | **Nada.** Este change no agrega columnas, índices ni restricciones — no se crea ningún `test/schema/*.spec.ts` | Se deja constancia para que `sdd-tasks` no invente una tarea de schema |
| Unit (Vitest, frontend) | `parsearRuta('/resultados/<id>')` ida y vuelta y `rutaAPath` inversa; `/resultados` sin id ⇒ `no-encontrada`; `useResultadosEnVivo` con fetch doblado + `vi.useFakeTimers()` dentro de un `QueryClientProvider` de prueba ⇒ segunda petición a los 15 s y **ninguna** antes; `retry: 0` ⇒ un `403` aflora al primer fallo; `ResultadosPage` en cargando/error/oculto/visible; `GraficoDesglose` monta `PieChart` con `dimension: 'opcion'` y `BarChart` con `'lista'`/`'candidato'`; la **tabla espejo** contiene las etiquetas y los números exactos, incluidos los 0 y los `baja`; `AvisoResultadosOcultos` visible y **ningún gráfico montado** en modo oculto; `QueryProvider` crea un cliente nuevo al remontarse | `@testing-library/react`. Las aserciones van sobre la **tabla**, no sobre el SVG: bajo jsdom `ResponsiveContainer` mide 0×0 y no dibuja (gotcha de `recharts`) |
| Contract | `pnpm openapi:extract` corre **sin Postgres ni Redis** tras registrar los providers nuevos (`redisProvider` es `lazyConnect`, ningún provider conecta al instanciarse); `GET /procesos/{id}/resultados` documentado con `200/400/401/403` | Job de CI existente |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| IDOR / enumeración sobre `:id` | Leer resultados de un proceso ajeno; barrer UUID para descubrir qué procesos existen; distinguir "no existe" de "no soy parte" | **Applicable** — `:id` es el parámetro de autorización | Pertenencia por `count(DerechoVoto)` antes de todo (D2); `403` **idéntico y sin cuerpo** para ajeno, inexistente y `borrador` (D3); jamás un `404` | `403` sin derecho; `403` UUID inexistente con **el mismo cuerpo**; `403` en `borrador`; `400` no-UUID |
| Fuga de resultados en modo oculto | Desglose "de más" en la respuesta; porcentaje precalculado; corte por aula; campo extra para comité | **Applicable** — es el riesgo central del change | El modo oculto **no calcula** el desglose (ni siquiera lo computa para descartarlo); `dimension`/`desglose`/`blancos` son claves **ausentes**, no `null` (D5); el cuerpo es idéntico para todos los roles (D7) | `Object.keys(body).sort()` exacto; comparación literal del `body` de comité contra el de estudiante |
| Contaminación cruzada de caché | Clave derivada mal; colisión de namespace; entrada de otro proceso inyectada en Redis | **Applicable** — es la obligación 2 del requisito 7 | `proceso_id` validado por `ParseUUIDPipe` dentro de la clave; prefijo `resultados:` disjunto; **autocomprobación** del envoltorio al deserializar ⇒ miss (D7) | `deserializar('A', serializar('B',…)) === null`; e2e `A`/`B` en sucesión; e2e con envoltorio ajeno inyectado a mano |
| Caché más permisiva que la configuración | Ocultar resultados a mitad de jornada y seguir sirviendo el desglose durante la ventana | **Applicable** con mitigación **heredada** | `ocultar_resultados` es inmutable una vez `abierto` (`#13`), así que la entrada nunca puede ser más permisiva que la config vigente; en la dirección contraria (publicar al cerrar) el retraso es fail-safe | e2e de `#13` ya fija la inmutabilidad; acá, comentario del servicio + esta fila como constancia de la dependencia |
| Denegación por ráfaga de lectura | 1.000 pestañas sondeando en el cierre; sondeo en pestañas de fondo; intervalo de cliente manipulado | **Applicable** — es el costo que ADR-0005 declara | Caché de 8 s ⇒ ≤ 0,125 agregaciones/s por proceso (D7); en hit el costo es 1 lectura indexada + 1 `GET` (D2); `refetchIntervalInBackground: false` (D9); el intervalo del cliente no puede hacer daño porque el techo lo pone el servidor con el TTL | Unitaria: hit ⇒ 0 agregaciones. e2e: N lecturas seguidas ⇒ una sola agregación observable |
| Caída/degradación de Redis | Redis caído ⇒ vista de resultados apagada toda la jornada; `catch` ancho que esconde un fallo de Postgres | **Applicable** — es un consumidor nuevo de Redis | `try/catch` acotado **sólo** a `get`/`setex`, nunca al cálculo (D8); los errores de Prisma burbujean; con Redis totalmente caído `AuthGuard` ya corta antes, así que no hay amplificación de carga alcanzable | `redis.get` que rechaza ⇒ `200` correcto; `setex` que rechaza ⇒ `200` correcto; error de Prisma ⇒ `5xx`, **no** enmascarado |
| Secreto del voto por agregación | Proceso con muy pocos votantes: el desglose visible identifica la preferencia individual | **Applicable — mitigación NO incluida en este change** | El diseño honra `ocultar_resultados` y nada más; **no** se inventa un umbral de k-anonimato que ni el spec ni ningún ADR definen. Se escala como pregunta abierta con destinatario (ver "Preguntas abiertas"), agravada porque el default del schema es `ocultar_resultados = false` | Ninguno en este change; queda anotado para que `sdd-tasks` no lo dé por cubierto |
| Enrutamiento (cliente) | `/resultados/<id>` sin sesión; `/resultados/../..`; `/resultados` sin id | **Applicable** | El `Enrutador` sigue montado dentro de `AuthGuard` (`#12` D11); `parsearRuta` sigue siendo total ⇒ `no-encontrada`; el backend valida con `ParseUUIDPipe` | Sin sesión ⇒ `LoginPage` conservando la URL; segmentos `..` ⇒ `no-encontrada`; `/resultados` pelado ⇒ `no-encontrada` |
| Dependencias nuevas de frontend | `recharts`/`react-query` incompatibles con React 18; `QueryClient` global que filtra datos entre sesiones | **Applicable** — son las dos dependencias nuevas del change | `recharts@^2` (soporte declarado de React 16-18) y `@tanstack/react-query@^5` (React 18+), D13; el `QueryClient` vive **dentro** de `AuthGuard` y muere con la sesión (D9) | `QueryProvider` crea un cliente nuevo al remontarse; `pnpm turbo run build`/`typecheck` verdes |
| Shell / subprocesos / Git / PR / clasificación de archivos ejecutables | — | **N/A**: el change no ejecuta shell, no lanza subprocesos, no toca Git ni automatiza PR, y no sube, clasifica ni sirve archivos | — | — |

## Migración / Rollout

**Sin migración de schema, sin backfill, sin índices nuevos** (D13). El change es de sólo lectura
sobre un modelo completo desde `#2`/`#13`/`#14`; greenfield, sin datos de producción.

| # | Paso | Verificación de salida |
|---|---|---|
| R1 | Backend: DTO, caché pura, servicio, controlador y módulo, con sus unitarias y e2e | Suite verde; `GET /procesos/{id}/resultados` responde `403`/`200` según pertenencia y visibilidad |
| R2 | `pnpm openapi:extract` y commit del contrato regenerado | `packages/contracts` expone `/procesos/{id}/resultados` con `200/400/401/403`; el frontend **no compila** contra la ruta antes de este paso |
| R3 | `pnpm --filter @seei/frontend add @tanstack/react-query recharts` + `query-client.ts` + `QueryProvider` en `App.tsx` | `pnpm turbo run build typecheck test` verdes con la app aún sin ninguna vista de resultados |
| R4 | Ruta, `resultados-api.ts`, `useResultadosEnVivo`, `ResultadosPage` y `PanelParticipacion` | La vista muestra participación en oculto y en visible; sondea a los 15 s |
| R5 | `GraficoDesglose` (`recharts`) y `AvisoResultadosOcultos` | Barras para `lista`/`candidato`, pastel para `opcion`, tabla espejo con los mismos números, ningún gráfico en modo oculto |
| R6 | Documentar `RESULTADOS_CACHE_TTL_SECONDS` (compose, onboarding, README) y sumarlo a `turbo.json` | `pnpm turbo run test:e2e` toma la variable; el default 8 funciona sin definirla |

**Rollback.** `git revert` de los PR de aplicación. No queda estado huérfano: nada se escribe en
Postgres y las únicas claves de Redis vencen solas en ≤8 s. Si `recharts` o `@tanstack/react-query`
resultaran inadecuadas, se reemplazan sin tocar el contrato del endpoint (`dimension` desacopla la
elección de gráfico de la librería que lo dibuja).

**Corte de PR sugerido para `sdd-tasks`** (pronóstico: 500-700 líneas, por encima del presupuesto de
400 ⇒ PR encadenados): **PR1** backend completo (DTO + caché pura + servicio + controlador + módulo +
unitarias + los dos e2e) — es indivisible porque la caché y el modo oculto sólo se pueden probar
juntos; **PR2** contrato regenerado + dependencias + `query-client.ts`/`QueryProvider` + ruta
(andamiaje de frontend, sin vista aún); **PR3** `ResultadosPage` + `PanelParticipacion` +
`AvisoResultadosOcultos`; **PR4** `GraficoDesglose` con `recharts` + tabla espejo + documentación de
la variable de entorno.

## Reconciliación con la spec de este change

| Texto de `specs/resultados-en-vivo/spec.md` | Estado |
|---|---|
| "`AuthGuard` sin `@Roles()`… autorizar sólo si el usuario tiene al menos un `DerechoVoto`… `403` idéntico" | **Compatible** (D1/D2). Controlador hermano porque el existente gatea por rol a nivel de clase |
| "`votos_emitidos`, `padron_total`, `estado_visibilidad`, desglose…, y `hora_servidor`" (visible) | **Compatible y más preciso** (D5): el desglose se acompaña de `dimension` y `blancos`, ambos **sólo** en modo visible, para que el cliente no re-derive reglas de negocio y para que `Σ desglose + blancos === votos_emitidos` sea comprobable |
| "sólo con `votos_emitidos`, `padron_total`, `estado_visibilidad`, `hora_servidor` y `resultados_ocultos_por_configuracion`" (oculto) | **Compatible en su literalidad, con una desviación declarada respecto de `proposal.md`**: la propuesta ilustraba el payload oculto con un campo `proceso_id` y con la participación **anidada** (`participacion: { … }`). Se sigue el spec: cinco campos **planos**, sin `proceso_id`. El eco del `proceso_id` no aporta información al cliente (ya la conoce: la puso en la URL) y la propiedad que sí lo necesitaba —la autocomprobación anticontaminación de la caché— se resuelve mejor con un **envoltorio interno** de Redis que nunca se serializa al cliente (D7). La decisión cerrada de la propuesta ("en oculto, sólo participación, sin desglose alguno") se cumple íntegra |
| "MUST NOT incluir… ni porcentajes derivados" | **Compatible** (D5): no existen `porcentaje_participacion` ni `abstenciones`; el cliente los deriva de los dos enteros |
| "`padron_total` de `count(DerechoVoto)`… MUST NOT recalcular desde `Matricula`/`Usuario`" | **Compatible** (D4). `Matricula` y `Usuario` no aparecen en ninguna consulta del servicio |
| "MUST NOT exponer una categoría 'nulos'… abstención como `padron_total - votos_emitidos`" | **Compatible** (D5). No existe campo `nulos`; sí existe `blancos`, que es una categoría **real** de la papeleta (ADR-0008) y no una de nulos |
| "misma lógica para `abierto`, `cerrado` y `acta_emitida`… MUST NOT requerir verificación explícita de `estado = borrador`" | **Compatible y revisado con criterio crítico** (D3): se confirma el criterio de `sdd-spec`, con el fundamento adicional de que cualquier guard explícito o bien es un oráculo de existencia o bien es observacionalmente idéntico al `403` de pertenencia. Se paga con un e2e que fija el invariante de `#13` |
| "lecturas repetidas… mismo valor… MUST NOT servir datos de otro `proceso_id`… tras vencer la ventana…" | **Compatible**, verificado obligación por obligación en "Verificación del requisito 7", con **una** desviación acotada y declarada: la estampida de arranque en frío |
| "participación siempre; desglose sólo si visible; mensaje si oculto; sondeo dentro de 10-30 s" | **Compatible** (D9/D10/D11/D12). Intervalo concreto: **15 s** |

## Preguntas abiertas

- [ ] **`ocultar_resultados` tiene `@default(false)` en el schema, pero ADR-0008 describe la
      configuración "ocultar resultados hasta el cierre" como *activa por defecto*.** Son
      afirmaciones contradictorias, y la que manda hoy es el schema: un proceso creado sin tocar el
      campo **publica** resultados en vivo. No es una decisión de `#16` —el flag es de `#2`/`#13` y
      este change sólo lo lee— pero cambia la postura de riesgo por defecto de todo el sistema.
      Corresponde a `sdd-tasks` escalarlo y a `#17`/una enmienda de spec resolverlo: o el default del
      schema pasa a `true`, o ADR-0008 se corrige para decir que el default activo es el de la UI.
- [ ] **Deanonimización por agregación en procesos muy chicos**: con resultados visibles y un padrón
      de pocos votantes (p. ej. un `representante_aula` de 8 estudiantes), el desglose en vivo puede
      identificar la preferencia individual. Ni el spec ni ningún ADR definen un umbral de
      k-anonimato, y este diseño **deliberadamente no lo inventa**. Si se decide adoptarlo, el lugar
      natural es una regla de spec ("con `padron_total < k`, el desglose se suprime aunque
      `ocultar_resultados = false`") aplicada en el mismo punto de D4 donde se decide calcular o no
      el desglose — un `if` más, sin cambio de contrato.
- [ ] **`#17` (cierre, escrutinio y actas) y la invalidación**: si `#17` publica resultados al cerrar
      relajando `ocultar_resultados`, la publicación se verá con hasta 8 s de retraso (dirección
      fail-safe). Si `#17` necesita publicación instantánea, le alcanza con un
      `DEL resultados:{proceso_id}` dentro de su transacción de cierre; este change **no** provee ese
      gancho a propósito (D7), pero deja el nombre de la clave estable y documentado.
- [ ] **Reutilización del cálculo por `#17`**: `ResultadosService` calcula exactamente lo que un acta
      necesita, pero un acta requiere un cálculo **sellado y no cacheado**. Si `#17` lo reutiliza,
      debe hacerlo por un camino que salte la caché, no leyendo el endpoint. Sin diseñar hasta ese
      change.
- [ ] **Verificar al aplicar**: la última versión `2.x` de `recharts` y que su `peerDependencies`
      acepte React `^18.3.1` (D13). Si sólo hubiera línea `3.x` compatible, es un cambio de versión
      en `package.json`, no de diseño — `dimension` (D12) mantiene el contrato del backend
      indiferente a la librería.
- [ ] **Alta fidelidad inexistente** para la vista de resultados: los componentes usan los tokens
      vigentes de `index.css`, sujeto a revisión de diseño visual (misma situación que `#15`).
