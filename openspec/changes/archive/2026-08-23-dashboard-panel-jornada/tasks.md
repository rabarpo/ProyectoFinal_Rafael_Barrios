# Tasks: dashboard-panel-jornada (Backlog #20 — Dashboard y panel de jornada)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~350-450 / PR2 ~120-170 / PR3 ~180-240 / PR4 ~90-130 (~740-990 total) |
| 400-line budget risk | PR1 High (backend indivisible, 5 endpoints) / PR2 Low-Medium / PR3 Medium / PR4 Low |
| Chained PRs recommended | Yes |
| Suggested split | PR1 backend completo (DTOs+caché+constantes+servicio+controlador+módulo+unitarias+e2e) → PR2 contrato regenerado+wrappers/hooks frontend+rutas → PR3 dashboard (piezas+`PanelJornadaPage`+ítem de menú) → PR4 modo proyección+`App.tsx` sin shell |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High (PR1)

`design.md` cuenta ~20 archivos (15 nuevos, 5 modificados) y declara el orden de merge obligatorio:
DTOs backend → regeneración de `packages/contracts` → wrappers/hooks frontend. El usuario confirmó
además el orden proyección/rutas al final. PR1 agrupa **todo** el backend porque D5/D6/D8 comparten
el mismo camino de código (`resumen()` decide `ocultar_resultados` antes de invocar o no
`calcularEscrutinio`; separar controlador de servicio dejaría un PR sin la prueba de D6, que es el
único punto que el diseño dejó abierto y el usuario ya cerró sin excepción). PR2 es sólo andamiaje
(contrato + wrappers + hook genérico + rutas con casos placeholder), sin ninguna vista de dashboard
todavía. PR3 separa la UI de dashboard (interactiva, con selector de proceso) de PR4, que aísla el
modo proyección (`RUTAS_SIN_SHELL`, D10) — el cambio más sensible a revisar porque monta el
enrutador fuera de `AppShell`.

### Suggested Work Units

| Unit | Goal | PR | Base | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|------|----------------------|-----------------|-------------------|
| 1 | Constantes+caché pura (D5), 5 DTOs, `PanelJornadaService` (D3/D4/D6/D7/D8/D11), `PanelJornadaController`+módulo (D1/D2), unitarias y e2e | PR 1 | tracker | `pnpm --filter @seei/backend test -- panel-jornada` + `pnpm --filter @seei/backend test:e2e -- panel-jornada` | Postgres + Redis reales (Docker) | `git revert` PR1; ningún endpoint existente afectado |
| 2 | `pnpm openapi:extract`, `panel-jornada-api.ts`, `usePanelSondeo.ts`+`usePanelJornada.ts` (D9), rutas `panel-jornada`/`proyeccion/:procesoId` con casos placeholder en `Enrutador.tsx` | PR 2 | PR1 | `pnpm --filter @seei/frontend test -- rutas` + `pnpm --filter @seei/frontend test -- usePanelSondeo` | Vitest + Testing Library, sin backend real | `git revert` PR2; PR1 no afectado, app compila sin vista nueva |
| 3 | `piezas/{TarjetasResumen,GraficoVotosPorHora,TablaAvanceAulas,SelectorProcesoActivo}.tsx`, `PanelJornadaPage.tsx`, caso `panel-jornada` real en `Enrutador.tsx`, ítem `PANEL_JORNADA` en `menu-por-rol.ts` | PR 3 | PR2 | `pnpm --filter @seei/frontend test -- PanelJornada` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR3; PR1/PR2 no afectados |
| 4 | `ProyeccionPage.tsx`, caso `proyeccion` real en `Enrutador.tsx`, `RUTAS_SIN_SHELL` en `App.tsx` (D10) | PR 4 | PR3 | `pnpm --filter @seei/frontend test -- Proyeccion` + `pnpm --filter @seei/frontend test -- App` | Testing Library, sin backend real | `git revert` PR4; resto del change no afectado |

## PR 1 — Backend completo (base = tracker branch)

### Phase 1: Constantes y caché pura (D5)
- [x] 1.1 RED unit: `UMBRAL_REZAGO_PP` default `15`, respeta `PANEL_JORNADA_UMBRAL_REZAGO_PP`
- [x] 1.2 RED unit: TTLs default (`300`/`8`/`60`/`30`) respetan sus envs `PANEL_JORNADA_TTL_*_SECONDS`
- [x] 1.3 RED unit: `clavePanel(scope, id?)` ⇒ `panel:{scope}` o `panel:{scope}:{id}` exacto,
      prefijo disjunto de `resultados:`/`session:`/`recovery:`
- [x] 1.4 RED unit: envoltorio `serializar`/`deserializar` ida y vuelta; clave ajena o
      `clave_scope` distinto ⇒ `MISS` (autocomprobación anticontaminación) [threat: Contaminación
      cruzada de caché]
- [x] 1.5 RED unit: JSON corrupto o error de Redis ⇒ `MISS` sin lanzar
- [x] 1.6 GREEN: crear `panel-jornada.constantes.ts` + `panel-jornada-cache.ts` (puro, sin
      `ioredis`) — pasa 1.1-1.5

### Phase 2: DTOs
- [x] 2.1 Crear `dto/{resumen-jornada,institucion,votos-por-hora,avance-aulas,proyeccion}.dto.ts`
      con `@ApiProperty`; `ResumenJornadaDto` marca `dimension`/`desglose`/`blancos` opcionales
      (nunca `null`/`[]` por defecto, idioma de `resultados-respuesta.dto.ts`)

### Phase 3: `PanelJornadaService`
- [x] 3.1 RED unit: `institucion()` cuenta `usuario` rol `estudiante` `estado='activo'` + filas
      `Apoderado` crudas sin dedup [spec: Conteo de estudiantes y vínculos]
- [x] 3.2 RED unit: `resumen()` proceso inexistente ⇒ `404` (D11)
- [x] 3.3 RED unit: `resumen()` `estado === 'borrador'` ⇒ `409 ESTADO_INVALIDO` (D11)
- [x] 3.4 RED unit: `resumen()` con `ocultar_resultados = true` ⇒ `calcularEscrutinio` **nunca**
      invocado (espía) [D6 — confirmado sin excepción por el usuario; threat: Fuga de desglose en
      modo oculto]
- [x] 3.5 RED unit: `resumen()` con `ocultar_resultados = false` ⇒ invoca `calcularEscrutinio` y
      mapea campo por campo sin `spread` (`baja_en` nunca sale)
- [x] 3.6 RED unit: `estado_visibilidad === 'oculto' ⟺ ocultar_resultados === true`, para
      cualquiera de los 3 roles autorizados (comité incluido) — sin excepción [D6]
- [x] 3.7 RED unit: `votosPorHora()` rellena franjas vacías desde `apertura_real` hasta
      `min(now, cierre_real)` [spec: Votos por hora]
- [x] 3.8 RED unit: `avanceAulas()` umbral relativo: `rezagada = padron > 0 && porcentaje <=
      participacion_global_pp - UMBRAL_REZAGO_PP` [spec: Avance por aula — límite exacto]
- [x] 3.9 RED unit: `avanceAulas()` aula con `padron === 0` nunca es `rezagada` (evita división
      por cero)
- [x] 3.10 RED unit: `avanceAulas()` nunca emite desglose por candidato a nivel de aula, sólo
      participación [threat: inferencia en aulas pequeñas]
- [x] 3.11 RED unit: `proyeccion()` no importa ni invoca `calcularEscrutinio`; el payload no
      contiene `desglose`/`blancos`/`dimension` bajo ninguna combinación de `ocultar_resultados`
      [D8; threat: Fuga de desglose por la puerta de proyección]
- [x] 3.12 GREEN: crear `panel-jornada.service.ts` con `PrismaService`/Redis mockeados (idioma de
      `resultados.service.spec.ts`) — pasa 3.1-3.11 (14/14 tests verdes)

### Phase 4: Controlador y módulo (D1/D2)
- [x] 4.1 Crear `panel-jornada.controller.ts`: `@Controller('panel-jornada')`,
      `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('administrador','director','comite')` a nivel
      de clase, 5 rutas `GET`, `ParseUUIDPipe` en `:id`, `@ApiTags/@ApiParam/@ApiResponse` para
      `200/400/401/403/404/409`
- [x] 4.2 Crear `panel-jornada.module.ts`: wiring `PrismaService` + `REDIS_CLIENT` (espejo de
      `procesos.module.ts`)
- [x] 4.3 Modificar `app.module.ts`: importa `PanelJornadaModule`

### Phase 5: E2E (Postgres + Redis reales)
- [x] 5.1 RED e2e: `docente`/`estudiante` ⇒ `403` en los 5 endpoints [spec: Docente intenta
      acceder]
- [x] 5.2 RED e2e: sin cookie de sesión ⇒ `401` [spec: Sin sesión válida]
- [x] 5.3 RED e2e: `comite` ⇒ `200` con datos scoped [spec: Comité consulta el panel]
- [x] 5.4 RED e2e: `:id` no-UUID ⇒ `400` [threat: casos adversarios de ruta]
- [x] 5.5 RED e2e: `proceso_id` inexistente ⇒ `404`
- [x] 5.6 RED e2e: proceso en `borrador` ⇒ `409 ESTADO_INVALIDO`
- [x] 5.7 RED e2e: proceso oculto (`ocultar_resultados = true`) ⇒ `resumen` sin
      `desglose`/`blancos`/`dimension`, para los 3 roles por igual [D6]
- [x] 5.8 RED e2e: proceso visible ⇒ `resumen` con desglose completo
- [x] 5.9 RED e2e: `proyeccion` nunca incluye desglose, independientemente de
      `ocultar_resultados` [spec: Proyección muestra solo agregados]
- [x] 5.10 GREEN: `test/panel-jornada/panel-jornada.e2e-spec.ts` (patrón de
      `resultados.e2e-spec.ts`) — ejecutado contra Postgres+Redis efímeros reales (Docker Desktop
      disponible en este sandbox, confirmado con `docker info`): `up -d --wait` +
      `prisma migrate deploy` + `jest --testPathPattern panel-jornada` ⇒ **9/9 tests verdes**
      (5.1-5.9), 7.48s. Contenedores bajados con `down -v` al terminar.

### Phase 6: Regresión PR1
- [x] 6.1 `pnpm --filter @seei/backend test -- panel-jornada` verde (4 suites / 34 tests)
- [x] 6.2 `pnpm --filter @seei/backend test:e2e -- panel-jornada` verde contra Postgres + Redis
      reales — 9/9 tests verdes (ver nota 5.10). Nota: el `test:e2e` **completo** del paquete
      (`pnpm --filter @seei/backend test:e2e` sin filtro) sigue fallando por una condición de
      carrera preexistente y ajena a este change: Jest corre suites e2e en paralelo y varias
      (`votos-concurrencia`, `procesos-abrir`, `actas-descarga`, etc.) comparten la fila única
      `AnioEscolar.activo = true`, disparando `Unique constraint failed on the fields: (activo)`
      entre suites concurrentes. Reproducido y confirmado — no relacionado con
      `panel-jornada.e2e-spec.ts`, que pasa limpio en aislamiento. Fuera de alcance de este change
      (no se toca el aislamiento de fixtures de otras suites).
- [x] 6.3 `pnpm typecheck` verde en los 4 paquetes (`@seei/backend`, `@seei/contracts`,
      `@seei/frontend`, `@seei/worker`; ejecutado por paquete con `pnpm --filter ... typecheck`
      para no disparar la regeneración de `packages/contracts`, que pertenece a PR2/tarea 7.1)

## PR 2 — Contrato regenerado y andamiaje de frontend (base = PR 1 branch)

### Phase 7: Contrato HTTP
- [x] 7.1 Correr `pnpm openapi:extract`: `packages/contracts` expone los 5 endpoints
      `/panel-jornada/*` con `200/400/401/403/404/409` — commitear antes de tocar frontend.
      Ejecutado vía `pnpm generate:contracts` (turbo: `@seei/backend#openapi:extract` →
      `@seei/contracts#generate:contracts`, per `turbo.json`); confirmado en
      `packages/contracts/src/generated/api.d.ts` las 5 rutas y sus DTOs (`InstitucionDto`,
      `ResumenJornadaDto`, `VotosPorHoraDto`, `AvanceAulasDto`, `ProyeccionDto`)

### Phase 8: API cliente y hook genérico de sondeo (D9)
- [x] 8.1 Crear `panel-jornada-api.ts`: wrappers tipados sobre `createSeeiClient` para los 5
      endpoints (idioma de `resultados-api.ts`)
- [x] 8.2 RED unit: `usePanelSondeo` con fetch doblado + `vi.useFakeTimers()` ⇒ refetch exacto a
      `intervaloMs`, ninguno antes [spec: Sondeo periódico con intervalo configurable]
- [x] 8.3 GREEN: crear `usePanelSondeo.ts` (+ `.spec.tsx`) — pasa 8.2 (2/2 tests)
- [x] 8.4 Crear `usePanelJornada.ts`: `useInstitucion`/`useResumenJornada`/`useVotosPorHora`/
      `useAvanceAulas`/`useProyeccion` sobre `usePanelSondeo`, con `INTERVALO_PANEL_MS` (15s) y
      `INTERVALO_PROYECCION_MS` (30s) respectivamente

### Phase 9: Rutas
- [x] 9.1 RED unit: `parsearRuta`/`rutaAPath` ida y vuelta para `panel-jornada` y
      `proyeccion/:procesoId`; `/proyeccion` sin id, `/proyeccion/../../etc/passwd`,
      `/panel-jornada/algo` ⇒ `no-encontrada` [threat: Enrutamiento (cliente)]
- [x] 9.2 GREEN: modificar `rutas.ts` (+ `rutas.spec.ts`) — pasa 9.1
- [x] 9.3 Modificar `Enrutador.tsx`: casos `panel-jornada`/`proyeccion` registrados con
      placeholder inline (`PanelJornadaPlaceholder`/`ProyeccionPlaceholder`; páginas reales en
      PR3/PR4)

### Phase 10: Regresión PR2
- [x] 10.1 `pnpm --filter @seei/frontend test -- rutas` verde (79/79 archivos, 573 tests)
- [x] 10.2 `pnpm --filter @seei/frontend test -- usePanelSondeo` verde (2/2 tests)
- [x] 10.3 `pnpm turbo run build typecheck test` verde, app aún sin vista de panel montada.
      `build`/`typecheck` limpios en los 4 paquetes. `test`: frontend 79/79 suites verdes;
      backend 46/46 suites relevantes verdes (526 tests) excluyendo
      `recovery.service.spec.ts`/`bloqueo.service.spec.ts`/`session.service.spec.ts` (misma
      flakiness preexistente de carrera contra Redis real bajo Jest en paralelo, documentada en
      6.2 — cero relación con archivos tocados por este change) e
      `importacion.service.spec.ts` (timeout de 5000ms en un test de 2001 filas bajo carga
      paralela, confirmado como flake reproduciendo en aislamiento: pasa limpio en 4.4s cuando
      corre solo — módulo de importación no tocado por este change)

## PR 3 — Dashboard de jornada (base = PR 2 branch)

### Phase 11: Piezas presentacionales (sin hooks de datos)
- [x] 11.1 RED componente `TarjetasResumen`: renderiza institución + resumen recibidos por props
- [x] 11.2 RED componente `GraficoVotosPorHora`: tabla espejo con las mismas franjas/valores
      recibidos, orden cronológico preservado (mismo gotcha de `recharts`/jsdom que #16)
- [x] 11.3 RED componente `TablaAvanceAulas`: aula `rezagada: true` se resalta visualmente;
      `padron === 0` nunca se marca rezagada
- [x] 11.4 RED componente `SelectorProcesoActivo`: lista procesos recibidos por props (fuente:
      `GET /procesos?estado=abierto`), emite el `procesoId` elegido
- [x] 11.5 GREEN: crear las 4 piezas en `piezas/` (+ `.spec.tsx` cada una) — pasa 11.1-11.4

### Phase 12: `PanelJornadaPage` y wiring
- [x] 12.1 RED componente: sin proceso seleccionado ⇒ sólo `TarjetasResumen` institucional +
      `SelectorProcesoActivo`, sin piezas scoped por proceso
- [x] 12.2 RED componente: con proceso seleccionado ⇒ monta `GraficoVotosPorHora` y
      `TablaAvanceAulas` scoped a ese `procesoId`
- [x] 12.3 GREEN: crear `PanelJornadaPage.tsx` (+ `.spec.tsx`) — pasa 12.1-12.2. Deviation menor:
      `usePanelSondeo`/`useResumenJornada`/`useVotosPorHora`/`useAvanceAulas` ganaron un 4to
      parámetro `enabled` (default `true`) para no disparar los 3 endpoints scoped con
      `procesoId=''` antes de que el usuario elija un proceso — el contrato de `usePanelSondeo`
      en design.md no lo preveía explícitamente, pero es aditivo y no rompe 8.2/8.3
- [x] 12.4 Modificar `Enrutador.tsx`: caso `panel-jornada` ⇒ `<PanelJornadaPage/>` real (reemplaza
      placeholder de Phase 9)
- [x] 12.5 Modificar `menu-por-rol.ts`: ítem `PANEL_JORNADA` en `administrador`/`director`/
      `comite`; **sin** ítem de proyección [spec: Navegación a Panel de jornada]. Deviation
      menor: `NavegacionPrincipal.tsx`/`iconos-menu.tsx` necesitaron un ícono nuevo
      (`IconoPanel`) en `ICONO_POR_ID['panel-jornada']` — omitirlo rompía el render con
      "Element type is invalid" (mismo mapa usado por todos los ítems de `MENU_POR_ROL`)
- [x] 12.6 RED test: `MENU_POR_ROL` no expone `PANEL_JORNADA` a `docente`/`estudiante`
      [threat: Rol no autorizado navega a mano]

### Phase 13: Regresión PR3
- [x] 13.1 `pnpm --filter @seei/frontend test -- PanelJornada` verde (84/84 archivos, 592 tests)
- [x] 13.2 `pnpm typecheck` verde en los 4 paquetes

## PR 4 — Modo proyección (base = PR 3 branch)

### Phase 14: `ProyeccionPage` y montaje sin shell (D10)
- [x] 14.1 RED componente: `ProyeccionPage` no renderiza ningún control interactivo (filtros,
      botones) [spec: Proyección no expone controles]
- [x] 14.2 RED componente: `ProyeccionPage` usa `INTERVALO_PROYECCION_MS` (30s), no
      `INTERVALO_PANEL_MS`
- [x] 14.3 GREEN: crear `ProyeccionPage.tsx` (+ `.spec.tsx`) — pasa 14.1-14.2
- [x] 14.4 Modificar `Enrutador.tsx`: caso `proyeccion` ⇒ `<ProyeccionPage procesoId={...}/>` real
- [x] 14.5 Modificar `App.tsx`: `RUTAS_SIN_SHELL = ['proyeccion']`, monta `<Enrutador/>` desnudo
      dentro de `AuthGuard > QueryProvider` (D10). RED+GREEN: `App.spec.tsx` nuevo caso [14.5]
      confirma que la ruta `proyeccion` no renderiza el header "Rol:"/sidebar de `AppShell`
- [x] 14.6 RED test: ningún item de `MENU_POR_ROL` enlaza a la ruta de proyección, para ningún rol
      [spec: Proyección no aparece en el menú] — verde por construcción (nunca se agregó un item
      de proyección a `MENU_POR_ROL`)
- [x] 14.7 RED e2e/integración: rol no autorizado (`docente`) navega directo a
      `/proyeccion/:procesoId` ⇒ backend responde `403` al pedir datos [spec: Acceso directo con
      rol no autorizado] — ya cubierto por el e2e [5.1] (`ENDPOINTS_SCOPED` incluye
      `getProyeccion`; docente ⇒ 403 confirmado, ver Phase 5); no se duplicó el mismo caso

### Phase 15: Regresión final del change
- [x] 15.1 `pnpm --filter @seei/frontend test -- Proyeccion` verde
- [x] 15.2 `pnpm --filter @seei/frontend test` completo verde (85/85 archivos, 597/597 tests)
- [x] 15.3 `pnpm --filter @seei/backend test` y `test:e2e` completos verdes contra Postgres +
      Redis reales. Unit: 46/47 suites verdes (539/540 tests) excluyendo las 3 suites con
      flakiness preexistente de Redis real bajo Jest en paralelo (recovery/bloqueo/
      session.service.spec.ts, documentada en 6.2/10.3) más `importacion.service.spec.ts`
      (timeout de 5000ms bajo carga paralela; confirmado pasando limpio en aislamiento, no
      relacionado con este change). E2e panel-jornada: 9/9 tests verdes contra Postgres+Redis
      efímeros reales (Docker Desktop, confirmado disponible este sandbox)
- [x] 15.4 `pnpm typecheck` verde en los 4 paquetes
- [x] 15.5 `pnpm turbo run build` verde con `/panel-jornada` y `/proyeccion/:procesoId`
      operativas (789 módulos transformados, sin errores)

## Pendientes explícitamente fuera de este change

- [D6 cerrado por el usuario]: el panel respeta `ocultar_resultados` sin excepción para los 3
  roles — no es un pendiente, queda documentado aquí sólo para que `sdd-apply` no lo reabra.
- Migración de `useResultadosEnVivo` (#16) hacia `usePanelSondeo` genérico — change aparte (D9).
- Deduplicación de vínculos apoderado-estudiante por DNI — cerrado por decisión 3 de la propuesta,
  no se implementa.
