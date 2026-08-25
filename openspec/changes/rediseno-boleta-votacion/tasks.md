# Tasks: Rediseño visual de la boleta de votación (3 pasos) — Backlog #31

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~250-350 / PR2 ~300-400 / PR3 ~350-450 / PR4 ~350-450 (~1250-1650 total, tests incluidos; `packages/contracts/src/generated/api.ts` regenerado, excluido del conteo) |
| 400-line budget risk | PR1 Low-Medium / PR2 Medium-High (borderline) / PR3 Medium-High (borderline) / PR4 Medium-High (borderline) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 `PapeletaOpcionDto` enriquecido + mapeo (D1/D2) → PR2 endpoints de archivo + relajación de `/configuracion/logo` (D3/D4) → PR3 piezas nuevas del Paso 2 (D5/D6) → PR4 rediseño de los 3 pasos existentes + wiring (D6/D7) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (rama larga, commits tageados por PR, sin branches nuevos por convención del proyecto) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium-High (PR2-PR4)

### Suggested Work Units

| Unit | Goal | PR | Base | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|------|----------------------|-----------------|-------------------|
| 1 | `PapeletaOpcionDto` + 8 campos opcionales homogéneos (D1); `PapeletaService.obtenerOpciones()` pasa a `public`, mapeo por tipo con `select`/`orderBy`/`include` sin N+1 (D2) | PR 1 | tracker | `pnpm --filter @seei/backend test -- papeleta.service` | Unit con `PrismaService` mockeado | `git revert` PR1; `PapeletaDto` de 2 campos vuelve a estar activo, sin migración |
| 2 | `PapeletaArchivosService` + 2 rutas de binario en `VotosController` (D3); `SinRestriccionDeRol()` en `roles.decorator.ts` + relajación de `GET /configuracion/logo` (D4) | PR 2 | PR1 | `pnpm --filter @seei/backend test -- votos.controller papeleta-archivos roles.guard configuracion.controller` | Unit con `PrismaService` mockeado | `git revert` PR2; PR1 sigue funcional sin los endpoints de archivo, `/configuracion/logo` vuelve a `@Roles('administrador','director')` |
| 3 | Contract sync: `pnpm openapi:extract`, cliente `votos-api.ts` (`urlFotoOpcion`/`urlPlanTrabajoOpcion`), 4 piezas nuevas del Paso 2 (`BarraProgresoVotacion`, `TarjetaLista`, `TarjetaCandidato`, `TarjetaOpcion`, `TarjetaVotoBlanco`) con sus specs (D5/D6) | PR 3 | PR2 | `pnpm --filter @seei/frontend test -- BarraProgresoVotacion Tarjeta` | Testing Library | `git revert` PR3; piezas nuevas sin consumidor aún, PR1/PR2 no afectados |
| 4 | Rediseño de `PasoInformacionProceso`, `PasoBoleta`, `PasoConfirmacion`, `PanelComprobante`, wiring en `VotacionPage`/`ComprobantePage` (D5/D6/D7) | PR 4 | PR3 | `pnpm --filter @seei/frontend test -- votos` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR4; componentes minimalistas anteriores vuelven a estar activos, backend no afectado |

**Bloqueo previo a PR3/PR4**: `pnpm openapi:extract` (Phase de contrato, fin de PR2) debe ejecutarse
y su resultado commitearse antes de tipar cualquier pieza de frontend contra `PapeletaOpcionDto`
enriquecido — mismo gate D8 que en `vote-casting`.

## PR 1 — `PapeletaOpcionDto` enriquecido y mapeo sin N+1 (base = feature branch actual)

### Phase 1: DTO enriquecido (D1)
- [x] 1.1 Modificar `apps/backend/src/votos/dto/papeleta.dto.ts`: agregar a `PapeletaOpcionDto` los
      8 campos opcionales homogéneos (`descripcion`, `simbolo`, `lema`, `propuesta`,
      `plan_trabajo_presente`, `candidato_id`, `candidato_nombres`, `cargo`, `foto_presente`) con
      `@ApiPropertyOptional`, sin unión discriminada (D1) [design.md D1]

### Phase 2: Mapeo por tipo sin N+1 — RED (D2)
- [x] 2.1 RED unit (`papeleta.service.spec.ts`): `tipo === 'municipio'` — `lista.findMany` recibe
      exactamente el `select`/`orderBy`/`include` de D2 (`candidatos: { where: estado activo,
      orderBy: [nombres asc, id asc], take: 1 }`), verificado con `toHaveBeenCalledWith` [design.md
      D2; spec: Convención determinística de candidato cabeza de lista]
- [x] 2.2 RED unit: desempate estable entre dos candidatos activos con nombres distintos — el
      candidato mostrado es el primer `nombres asc` [spec: Selección determinística entre varios
      candidatos activos]
- [x] 2.3 RED unit: lista sin candidatos activos — la opción se emite sin `candidato_id`/
      `candidato_nombres`/`cargo`/`foto_presente`, sin error [spec: Lista sin candidatos activos no
      rompe la tarjeta]
- [x] 2.4 RED unit: `tipo === 'representante_aula'`/`'padres'` — `candidato.findMany` con `orderBy:
      nombres asc` (nuevo, hoy ausente); la opción emite `candidato_id === id` (invariante D6 de
      `design.md`, NO usar `candidato_id` como id de selección)
- [x] 2.5 RED unit: `tipo === 'consulta'` — `opcionConsulta.findMany` con `orderBy: etiqueta asc`
      (nuevo); la opción emite `descripcion` cuando no es `null`, ningún campo de candidato/lista
      [design.md "Regla del mapper"]
- [x] 2.6 RED unit: el `select` de las 3 ramas NUNCA incluye `foto`/`plan_trabajo` (columnas
      `Bytes`) — solo `foto_mime`/`plan_trabajo_mime` para derivar los booleanos `*_presente`
      [design.md D2, threat matrix: exposición de bytes]
- [x] 2.7 RED unit: `cargo` se omite del payload cuando es `null` (regla homogénea del mapper, sin
      rama especial por tipo)

### Phase 3: GREEN
- [x] 3.1 GREEN: implementar `obtenerOpciones()` público con las 3 queries de D2 (`lista.findMany`,
      `candidato.findMany`, `opcionConsulta.findMany`) y el mapeo homogéneo — pasa 2.1-2.7
- [x] 3.2 Confirmar que `PapeletaService.obtener()` (consumidor existente de `obtenerOpciones()`)
      sigue verde sin cambios en su propia spec

### Phase 4: Regresión PR1
- [x] 4.1 `pnpm --filter @seei/backend test -- papeleta.service` verde
- [x] 4.2 `pnpm typecheck` — verde para los archivos tocados por PR1 (`papeleta.dto.ts`,
      `papeleta.service.ts`, `papeleta.service.spec.ts`); `@seei/backend#typecheck` global falla
      por un error preexistente en `mis-derechos.service.spec.ts` (backlog #30, no tocado por este
      change) — confirmado con `git stash` que el error ya existía antes de este apply
- [x] 4.3 `pnpm --filter @seei/backend test -- votos.service` verde y sin modificar (19 tests de
      `emitir()` intactos) [spec: Ningún cambio de comportamiento en la escritura del voto]

## PR 2 — Endpoints de archivo y relajación de `/configuracion/logo` (base = PR 1 branch)

### Phase 5: `PapeletaArchivosService` — RED (D3)
- [ ] 5.1 RED unit (`papeleta-archivos.service.spec.ts`): derecho ajeno (`dv.usuario_id !==
      sesion.userId`) → `ForbiddenException()` sin cuerpo [spec: Opción ajena responde 403
      idéntico]
- [ ] 5.2 RED unit: `derechoVotoId` inexistente → mismo `ForbiddenException()` byte-a-byte que 5.1
      [spec: Opción inexistente responde 403 idéntico al de opción ajena]
- [ ] 5.3 RED unit: `id` de una opción de otro proceso → mismo `403` que 5.1/5.2 [threat matrix:
      IDOR/enumeración]
- [ ] 5.4 RED unit: `id` de una opción dada de baja (no presente en `obtenerOpciones()`) → mismo
      `403` que 5.1-5.3
- [ ] 5.5 RED unit: `tipo === 'consulta'` (ninguna opción lleva `candidato_id`/
      `plan_trabajo_presente`) → mismo `403` que 5.1-5.4, sin rama especial [design.md D3 paso 4]
- [ ] 5.6 RED unit: comparación de los 5 cuerpos `403` anteriores — son literalmente idénticos
      (`toEqual`), sin oráculo de enumeración [spec: Autorización por pertenencia — sin distinguir
      casos]
- [ ] 5.7 RED unit: pertenencia válida pero `foto_presente === false` → `404`, no `403` [spec: Plan
      de trabajo ausente responde 404, no 403]
- [ ] 5.8 RED unit: pertenencia válida pero `plan_trabajo_presente === false` → `404` [spec: Lista
      propia sin plan de trabajo responde 404]
- [ ] 5.9 RED unit: camino feliz — foto de candidato cabeza de lista servida `200` con
      `buffer`+`mime` [spec: Foto de opción propia se sirve correctamente]
- [ ] 5.10 RED unit: en los 5 caminos `403` (5.1-5.5), los bytes (`candidato.findUnique`/
      `lista.findUnique` con `select: foto/plan_trabajo`) NUNCA se leen — autorizar primero, cargar
      después [design.md D3, "autorizar primero, cargar bytes después"]

### Phase 6: `PapeletaArchivosService` — GREEN
- [ ] 6.1 GREEN: crear `apps/backend/src/votos/papeleta-archivos.service.ts` con el algoritmo de
      D3 (`ParseUUIDPipe` en el controller, `derechoVoto.findUnique` + `obtenerOpciones()` como
      fuente única de pertenencia, lectura de bytes solo tras autorizar) — pasa 5.1-5.10

### Phase 7: Rutas de `VotosController` — RED
- [ ] 7.1 RED unit (`votos.controller.spec.ts`): `GET
      /votos/papeleta/:derechoVotoId/opciones/:id/foto` — `:derechoVotoId`/`:id` no-UUID → `400`
      antes de invocar el servicio [threat matrix: Enrutamiento (servidor)]
- [ ] 7.2 RED unit: respuesta `200` incluye `X-Content-Type-Options: nosniff` y `Content-Security-
      Policy: default-src 'none'` [spec: Headers de seguridad presentes en la respuesta]
- [ ] 7.3 RED unit: `GET .../plan-trabajo` sanea `Content-Disposition` con
      `plan_trabajo_nombre.replace(/[^\w.\- ]/g, '_')` — nombre con comillas/CRLF queda saneado
      [design.md "Mejora deliberada"; threat matrix: Clasificación de archivo activo]
- [ ] 7.4 RED unit: `StreamableFile` se construye con el `mime` exacto persistido (no un valor fijo)

### Phase 8: Rutas de `VotosController` — GREEN
- [ ] 8.1 GREEN: agregar las 2 rutas a `votos.controller.ts` delegando en
      `PapeletaArchivosService` — pasa 7.1-7.4
- [ ] 8.2 Registrar `PapeletaArchivosService` en `apps/backend/src/votos/votos.module.ts`

### Phase 9: `SinRestriccionDeRol()` y relajación de `/configuracion/logo` — RED (D4)
- [ ] 9.1 RED unit (`roles.guard.spec.ts`): handler con metadata `[]` (`SinRestriccionDeRol()`)
      anula el `@Roles` de clase → guard deja pasar a cualquier usuario autenticado [design.md D4;
      spec: Un votante (rol `estudiante`) obtiene el logo institucional]
- [ ] 9.2 RED unit: handler sin metadata propia sigue heredando el `@Roles` de la clase → `403`
      para un rol no listado (regresión explícita del comportamiento actual)
- [ ] 9.3 RED unit (`configuracion.controller.spec.ts`):
      `Reflect.getMetadata(ROLES_KEY, ConfiguracionController.prototype.obtenerLogo)` es `[]`
      [spec: El resto de `ConfiguracionController` sigue restringido — verificación negativa
      implícita: solo `obtenerLogo` tiene la metadata vacía]
- [ ] 9.4 RED unit: `GET /configuracion`, `PUT /configuracion`, `POST /configuracion/logo` y el
      listado de comité siguen rechazando `estudiante`/`padre`/`comite` sin cambios [spec: El resto
      de `ConfiguracionController` sigue restringido a administrador/director]

### Phase 10: `SinRestriccionDeRol()` — GREEN
- [ ] 10.1 GREEN: agregar `SinRestriccionDeRol()` a `apps/backend/src/auth/roles.decorator.ts`
      (`SetMetadata(ROLES_KEY, [])`) — pasa 9.1-9.2
- [ ] 10.2 GREEN: anotar `ConfiguracionController.obtenerLogo()` con `@SinRestriccionDeRol()`,
      eliminar el `@ApiResponse({status:403,...})` de ese método (ya no aplica) — pasa 9.3-9.4

### Phase 11: Contrato y regresión PR2
- [ ] 11.1 `pnpm openapi:extract`: confirmar que los 2 endpoints nuevos y el `PapeletaOpcionDto`
      enriquecido quedan documentados en `packages/contracts/src/generated/api.ts`
- [ ] 11.2 `pnpm --filter @seei/backend test -- votos papeleta-archivos roles.guard configuracion`
      verde
- [ ] 11.3 `pnpm typecheck` verde en los 4 paquetes
- [ ] 11.4 `pnpm --filter @seei/backend test -- votos.service` verde y sin modificar (19 tests de
      `emitir()` intactos)

## PR 3 — Cliente API y 4 piezas nuevas del Paso 2 (base = PR 2 branch)

### Phase 12: Cliente API
- [ ] 12.1 Modificar `apps/frontend/src/votos/votos-api.ts`: agregar `urlFotoOpcion(derechoVotoId,
      id)` y `urlPlanTrabajoOpcion(derechoVotoId, id)` tipados contra `@seei/contracts` regenerado
      (D3/D7 — same-origin, cookie de sesión viaja sola, sin `fetch`+`Blob`)

### Phase 13: `BarraProgresoVotacion` — RED/GREEN (D5)
- [ ] 13.1 RED componente (`BarraProgresoVotacion.spec.tsx`): `role="progressbar"` con
      `aria-valuemin=1`, `aria-valuemax={totalPasos}`, `aria-valuenow={pasoActual}` [spec: La barra
      refleja el paso actual en cada uno de los 3 pasos]
- [ ] 13.2 RED componente: texto visible "Paso {pasoActual} de {totalPasos}" y
      "{porcentaje}% Completado" con `porcentaje = round((pasoActual/totalPasos)*100)`
- [ ] 13.3 RED componente: las clases Tailwind usadas mapean únicamente a tokens ya definidos en
      `@theme` (grep de clases arbitrarias) [spec: `BarraProgresoVotacion` usa únicamente tokens
      existentes]
- [ ] 13.4 GREEN: crear `apps/frontend/src/votos/piezas/BarraProgresoVotacion.tsx` — pasa
      13.1-13.3

### Phase 14: 4 tarjetas del Paso 2 — RED/GREEN (D6)
- [ ] 14.1 RED componente (`TarjetaLista.spec.tsx`): renderiza etiqueta, símbolo, lema, propuesta
      corta y foto+nombres+cargo del cabeza de lista; botón "Ver Propuesta Completa" presente solo
      si `plan_trabajo_presente = true` [spec: Proceso `municipio` renderiza tarjetas de Lista]
- [ ] 14.2 RED componente: click en "Ver Propuesta Completa" NO marca la tarjeta como seleccionada
      (botón hermano del `<label>`, no anidado) [design.md D6, "Semántica ARIA preservada"]
- [ ] 14.3 RED componente (`TarjetaCandidato.spec.tsx`): renderiza foto, nombres y cargo, sin botón
      de propuesta [spec: Proceso `representante_aula`/`padres` renderiza tarjetas de Candidato]
- [ ] 14.4 RED componente (`TarjetaOpcion.spec.tsx`): renderiza únicamente etiqueta y descripción,
      sin foto [spec: Proceso `consulta` renderiza tarjetas de Opción simple]
- [ ] 14.5 RED componente (`TarjetaVotoBlanco.spec.tsx`): texto fijo, `border-dashed` en el
      `<label>`, nunca marcada como seleccionada al montar [spec: Voto en Blanco presente en las 3
      variantes, nunca preseleccionado]
- [ ] 14.6 RED componente (las 4 tarjetas): patrón "Candidate Cards" — borde se engruesa y aparece
      el check al seleccionar, mismo comportamiento en las 4 [spec: Selección de tarjeta usa el
      patrón Candidate Cards]
- [ ] 14.7 RED componente (las 4 tarjetas): cada una contiene `<input type="radio"
      name="eleccion" className="sr-only">` dentro de un `<label>`, preservando
      `getByRole('radio')` [design.md D6, "Semántica ARIA preservada"]
- [ ] 14.8 GREEN: crear `apps/frontend/src/votos/piezas/Tarjeta{Lista,Candidato,Opcion,
      VotoBlanco}.tsx` — pasa 14.1-14.7

**Paralelizable**: 13.1-13.4 (`BarraProgresoVotacion`) y 14.1-14.8 (las 4 tarjetas) son
independientes entre sí una vez completado 12.1; pueden implementarse en paralelo por distintos
colaboradores dentro del mismo PR3.

### Phase 15: Regresión PR3
- [ ] 15.1 `pnpm --filter @seei/frontend test -- BarraProgresoVotacion Tarjeta` verde
- [ ] 15.2 `pnpm typecheck` verde en los 4 paquetes

## PR 4 — Rediseño de los 3 pasos existentes y wiring (base = PR 3 branch)

### Phase 16: `PasoInformacionProceso` — RED/GREEN
- [ ] 16.1 RED componente: muestra exactamente 3 tarjetas de reglas (secreto, única vez,
      irreversible) y la imagen de `GET /configuracion/logo` [spec: Paso 1 muestra las 3 reglas y
      el logo institucional]
- [ ] 16.2 RED componente: `GET /configuracion/logo` responde `404` — el paso se renderiza sin la
      imagen, sin error visible, botón "Comenzar Votación" funcional [spec: Sin logo institucional
      configurado, el paso 1 no rompe; design.md D4 "onError + useState local"]
- [ ] 16.3 RED componente: monta `BarraProgresoVotacion` con `pasoActual=1`, `totalPasos=3`
      [spec: La barra refleja el paso actual en cada uno de los 3 pasos]
- [ ] 16.4 GREEN: modificar `apps/frontend/src/votos/piezas/PasoInformacionProceso.tsx` — pasa
      16.1-16.3

### Phase 17: `PasoBoleta` — RED (reescritura completa)
- [ ] 17.1 RED componente (`PasoBoleta.spec.tsx` reescrito): variante `TarjetaLista` para
      `tipo='municipio'`, `TarjetaCandidato` para `representante_aula`/`padres`, `TarjetaOpcion`
      para `consulta`, seleccionada por `tipo` sin heurística sobre campos presentes [spec:
      Variantes de tarjeta del Paso 2 según tipo de proceso]
- [ ] 17.2 RED componente: `TarjetaVotoBlanco` presente en las 3 variantes como tarjeta adicional,
      nunca preseleccionada
- [ ] 17.3 RED componente: `role="radiogroup" aria-label="Opciones de la boleta"` preservado en el
      contenedor de la grilla [design.md D6, "Semántica ARIA preservada"]
- [ ] 17.4 RED componente: `id` de `Seleccion` es siempre `opcion.id`, nunca `candidato_id` — click
      en `TarjetaLista` produce `onSeleccionar({tipo:'opcion', id: opcion.id})` [design.md D6,
      invariante crítica de `Seleccion`]
- [ ] 17.5 RED componente: click en "Ver Propuesta Completa" no cambia la `Seleccion` actual (no
      dispara `onSeleccionar`)
- [ ] 17.6 RED componente: monta `BarraProgresoVotacion` con `pasoActual=2`, muestra
      "% Completado" y footer con "Volver al paso anterior" (invoca `onVolver`)/"Siguiente Paso"
      (deshabilitado sin selección, preserva el comportamiento ya cubierto por #14)

### Phase 18: `PasoBoleta` — GREEN
- [ ] 18.1 GREEN: reescribir `apps/frontend/src/votos/piezas/PasoBoleta.tsx` consumiendo las 4
      piezas de PR3, con `PasoBoletaProps` extendida (`tipo`, `derechoVotoId`, `onVolver`) — pasa
      17.1-17.6

### Phase 19: `PasoConfirmacion` y `PanelComprobante` — RED/GREEN
- [ ] 19.1 RED componente: `PasoConfirmacion` monta `BarraProgresoVotacion` con `pasoActual=3`, sin
      otro cambio visual [design.md "Cambios de archivos" — Phase 3 solo agrega la barra]
- [ ] 19.2 RED componente (`PanelComprobante.spec.tsx`): ícono/badge de éxito + "¡Voto emitido
      correctamente!" + datos reales (fecha/hora, código, resumen de elección) sin `yaRegistrado`
      [spec: Comprobante recién emitido muestra ícono de éxito]
- [ ] 19.3 RED componente: badge "Ya has votado" visible únicamente con `yaRegistrado` [spec:
      Reintento tras voto ya emitido muestra el badge "Ya has votado"]
- [ ] 19.4 RED componente: ningún elemento etiquetado "periodo lectivo" ni "estado de
      sincronización" en ningún estado (`yaRegistrado` true/false) [spec: El comprobante nunca
      muestra periodo lectivo ni estado de sincronización]
- [ ] 19.5 RED componente: `PanelComprobante` NO monta `BarraProgresoVotacion` (post-emisión, fuera
      de los 3 pasos) [design.md, "`PanelComprobante` ... no la barra de progreso"]
- [ ] 19.6 GREEN: modificar `apps/frontend/src/votos/piezas/PasoConfirmacion.tsx` y
      `apps/frontend/src/votos/piezas/PanelComprobante.tsx` — pasa 19.1-19.5

### Phase 20: Wiring — `VotacionPage`/`ComprobantePage`
- [ ] 20.1 RED componente (`VotacionPage.spec.tsx`, solo fixtures + 1 caso nuevo): `papeletaMock`
      gana los campos opcionales de PR1; ningún `findByRole('radiogroup')`/`getByRole('radio')`
      existente cambia; caso nuevo: volver de paso 2 a paso 1 invoca `onVolver`
- [ ] 20.2 GREEN: modificar `apps/frontend/src/votos/VotacionPage.tsx` — pasa `tipo`/
      `derechoVotoId`/`onVolver` a `PasoBoleta`; pasa 20.1
- [ ] 20.3 Modificar `apps/frontend/src/votos/ComprobantePage.tsx`: `<PanelComprobante
      yaRegistrado />` cuando corresponda

### Phase 21: Verificación de branding y regresión final PR4
- [ ] 21.1 `rg -i "san alfonso" apps/` sin resultados [spec: Ningún componente del flujo de
      votación menciona "San Alfonso"; proposal.md Success Criteria]
- [ ] 21.2 `pnpm --filter @seei/frontend test` verde — suite completa, incluidos
      `PasoBoleta.spec.tsx`, `VotacionPage.spec.tsx`, `PanelComprobante.spec.tsx` reescritos/
      actualizados
- [ ] 21.3 `pnpm --filter @seei/backend test` verde — incluidos los 19 tests de
      `VotosService.emitir()` sin modificar [proposal.md Success Criteria]
- [ ] 21.4 `pnpm typecheck` verde en los 4 paquetes
- [ ] 21.5 `pnpm turbo run test` completo verde (regresión cruzada final del change)
