# Tasks: resultados-en-vivo (Backlog #16 — Resultados en vivo)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~280-380 / PR2 ~90-140 / PR3 ~90-140 / PR4 ~90-140 (~550-800 total) |
| 400-line budget risk | PR1 Medium-High (backend indivisible) / PR2 Low / PR3 Low / PR4 Low |
| Chained PRs recommended | Yes |
| Suggested split | PR1 backend completo (DTO+caché pura+servicio+controlador+módulo+unitarias+2 e2e) → PR2 contrato regenerado+dependencias+andamiaje React Query+ruta → PR3 vista de resultados (página+participación+aviso oculto) → PR4 gráficos `recharts`+tabla espejo+documentación |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium-High (PR1)

Este corte sigue literalmente la sección "Corte de PR sugerido para `sdd-tasks`" de `design.md`
(pronóstico 500-700 líneas, por encima del presupuesto de 400). PR1 agrupa **todo** el backend
porque `design.md` lo declara indivisible: la caché Redis (D7/D8) y el payload de modo oculto (D5)
solo se pueden probar juntos — separar el controlador de la caché dejaría un PR sin la prueba del
requisito 7 (consistencia de lecturas repetidas) o sin la prueba del payload mínimo oculto, ambas
necesarias para el mismo camino de código (`ResultadosService.obtener()`). PR2 es sólo andamiaje
(contrato + dependencias + `QueryProvider` + ruta), sin ninguna vista todavía — igual a los pasos
R2/R3 de "Migración / Rollout" de `design.md`. PR3 y PR4 separan la vista base (participación,
siempre presente) de los gráficos (`recharts`, solo en modo visible), lo que deja PR3 revisable
sin la dependencia de gráficos y aísla el riesgo de peer deps de `recharts` (D13, pregunta abierta)
en el PR más pequeño y último de la cadena.

### Suggested Work Units

| Unit | Goal | PR | Base | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|------|----------------------|-----------------|-------------------|
| 1 | DTO (D5), caché pura (D7), `ResultadosService` con autorización/caché/agregación `RepeatableRead` (D2/D3/D4/D6/D8), `ResultadosController`+módulo (D1), unitarias y los dos e2e | PR 1 | tracker | `pnpm --filter @seei/backend test -- resultados` + `pnpm --filter @seei/backend test:e2e -- resultados` | Postgres + Redis reales (Docker) | `git revert` PR1; ningún endpoint ni dependencia existente se ve afectado |
| 2 | `pnpm openapi:extract`, `@tanstack/react-query`+`recharts` en `package.json`, `query-client.ts`+`QueryProvider` en `App.tsx` (D9), ruta `/resultados/:procesoId` (D11), `resultados-api.ts`+`useResultadosEnVivo` (D10) | PR 2 | PR1 | `pnpm --filter @seei/frontend test -- rutas` + `pnpm --filter @seei/frontend test -- useResultadosEnVivo` | Vitest + Testing Library, sin backend real | `git revert` PR2; PR1 no afectado, app compila sin ninguna vista de resultados |
| 3 | `ResultadosPage`, `PanelParticipacion`, `AvisoResultadosOcultos`, caso `resultados` en `Enrutador.tsx` | PR 3 | PR2 | `pnpm --filter @seei/frontend test -- Resultados` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR3; PR1/PR2 no afectados |
| 4 | `GraficoDesglose` (`recharts`, D12) + tabla espejo, documentación de `RESULTADOS_CACHE_TTL_SECONDS` (compose/onboarding/README/`turbo.json`) | PR 4 | PR3 | `pnpm --filter @seei/frontend test -- GraficoDesglose` | Testing Library, aserciones sobre la tabla (no el SVG — `ResponsiveContainer` mide 0×0 en jsdom) | `git revert` PR4; resto del change no afectado |

## PR 1 — Backend completo: DTO, caché, servicio, controlador (base = tracker branch)

### Phase 1: DTO de respuesta (D5)
- [x] 1.1 Crear `apps/backend/src/procesos/dto/resultados-respuesta.dto.ts`:
      `ResultadoOpcionDto` (`id`, `etiqueta`, `votos`, `estado`) y `ResultadosRespuestaDto`
      (`estado_visibilidad`, `resultados_ocultos_por_configuracion`, `votos_emitidos`,
      `padron_total`, `hora_servidor` obligatorios; `dimension`/`desglose`/`blancos` con
      `@ApiPropertyOptional`, sin `null` ni `[]` por defecto) [spec: Payload mínimo cuando
      `ocultar_resultados = true`]

### Phase 2: Caché pura de Redis (D7)
- [x] 2.1 RED unit: `claveResultados(procesoId)` ⇒ `resultados:{uuid}` exacto
- [x] 2.2 RED unit: `TTL_RESULTADOS_SEGUNDOS === 8` por defecto y respeta
      `RESULTADOS_CACHE_TTL_SECONDS` del entorno
- [x] 2.3 RED unit: `serializar`/`deserializar` ida y vuelta con el mismo `procesoId`
- [x] 2.4 RED unit: `deserializar(procesoIdA, serializar(procesoIdB, payload))` ⇒ `null`
      (autocomprobación anticontaminación) [spec: Consistencia observable de lecturas repetidas —
      "MUST NOT servir datos de un `proceso_id` distinto"; threat: Contaminación cruzada de caché]
- [x] 2.5 RED unit: `deserializar(procesoId, null)` ⇒ `null`; JSON corrupto ⇒ `null` sin lanzar
- [x] 2.6 GREEN: crear `apps/backend/src/procesos/resultados-cache.ts` (puro, sin `ioredis`) —
      pasa 2.1-2.5

### Phase 3: `ResultadosService` — autorización, caché y agregación (D2/D3/D4/D6/D8)
- [x] 3.1 RED unit: `count(DerechoVoto) === 0` ⇒ `ForbiddenException` lanzada **antes** de
      cualquier lectura de `ProcesoElectoral` o de la caché (spy que verifica orden de llamadas)
      [spec: Autorización por pertenencia, sin restricción de rol; threat: IDOR/enumeración]
- [x] 3.2 RED unit: hit de caché (deserialización válida) ⇒ **cero** consultas de agregación
      (`findUnique`/`count`/`groupBy` no invocados) [spec: Consistencia observable de lecturas
      repetidas — "sin degradar latencia bajo ráfaga"; proposal.md criterio de éxito]
- [x] 3.3 RED unit: miss ⇒ transacción `RepeatableRead` invocada con `isolationLevel:
      'RepeatableRead'`, seguida de `setex` con TTL 8
- [x] 3.4 RED unit: `ocultar_resultados = true` ⇒ `Object.keys(body).sort()` es **exactamente**
      los 5 campos del modo oculto (sin `desglose`/`blancos`/`dimension`) [spec: Payload mínimo
      cuando `ocultar_resultados = true`; threat: Fuga de resultados en modo oculto]
- [x] 3.5 RED unit: `ocultar_resultados = false` ⇒ `Σ desglose.votos + blancos === votos_emitidos`
      [spec: Desglose completo cuando `ocultar_resultados = false`]
- [x] 3.6 RED unit: opciones/candidatos/listas con 0 votos están **presentes** en el desglose
      (combinación catálogo × `groupBy` con `?? 0`)
- [x] 3.7 RED unit: candidato/lista en `estado = 'baja'` está **presente** en el desglose con su
      `estado` (catálogo leído sin filtrar `estado: 'activo'`)
- [x] 3.8 RED unit: orden del desglose es `votos` desc, `etiqueta` asc como desempate (estable
      byte a byte) [design.md D12]
- [x] 3.9 RED unit: una `dimension` correcta por cada uno de los 4 `tipo` de `ProcesoElectoral`
      (`municipio`⇒`lista`, `representante_aula`/`padres`⇒`candidato`, `consulta`⇒`opcion`)
- [x] 3.10 RED unit: no existe campo `nulos` en ningún modo; abstención no viaja como campo (se
      deriva en el cliente) [spec: Sin categoría de nulos; abstención derivada]
- [x] 3.11 RED unit: `estado_visibilidad === 'oculto' ⟺ resultados_ocultos_por_configuracion ===
      true`, para cualquier rol (comité incluido) [spec: Comité consulta proceso oculto]
- [x] 3.12 RED unit: `redis.get` que rechaza ⇒ `200` calculado igual, sin propagar el error
      [design.md D8; threat: Caída/degradación de Redis]
- [x] 3.13 RED unit: `redis.setex` que rechaza ⇒ `200` igual, sin propagar el error
- [x] 3.14 RED unit: un error de Prisma (agregación) **no** se enmascara como cache-miss — sigue
      burbujeando [design.md D8, catch acotado sólo a `get`/`setex`]
- [x] 3.15 GREEN: crear `apps/backend/src/procesos/resultados.service.ts` con
      `PrismaService` mockeado y `{ provide: REDIS_CLIENT, useValue: { get: jest.fn(), setex:
      jest.fn() } }` (idioma de `health.controller.spec.ts`) — pasa 3.1-3.14. Sin Postgres, sin
      Redis reales en esta fase

### Phase 4: Controlador y módulo (D1)
- [x] 4.1 Crear `apps/backend/src/procesos/resultados.controller.ts`: `@Controller('procesos')`,
      `@Get(':id/resultados')`, `@UseGuards(AuthGuard)` **sin** `@Roles()`, `ParseUUIDPipe`,
      `@ApiResponse` para `200/400/401/403`
- [x] 4.2 Modificar `apps/backend/src/procesos/procesos.module.ts`: agregar `redisProvider`,
      `ResultadosService`, `ResultadosController` (**primero** en `controllers: []`, antes de
      `ProcesosController`), `cookie-parser` en `forRoutes`

### Phase 5: E2E de contrato (Postgres + Redis reales)
- [x] 5.1 RED e2e: sin cookie de sesión ⇒ `401`
- [x] 5.2 RED e2e: sin `DerechoVoto` en el proceso ⇒ `403`
- [x] 5.3 RED e2e: `proceso_id` inexistente ⇒ `403` con el **mismo cuerpo** que 5.2 (comparación
      literal) [threat: IDOR/enumeración]
- [x] 5.4 RED e2e: proceso en `borrador` ⇒ `403`, mismo cuerpo que 5.2/5.3 (D3) [spec:
      Comportamiento según estado del proceso — "Proceso en borrador"]
- [x] 5.5 RED e2e: `id` no-UUID ⇒ `400`
- [x] 5.6 RED e2e: proceso visible (`ocultar_resultados = false`) ⇒ `200` con desglose completo
      [spec: Desglose completo cuando `ocultar_resultados = false`]
- [x] 5.7 RED e2e: proceso oculto (`ocultar_resultados = true`) ⇒ `200` con exactamente los 5
      campos del modo oculto [spec: Payload mínimo cuando `ocultar_resultados = true`]
- [x] 5.8 RED e2e: usuario con rol comité y usuario estudiante en el mismo proceso oculto reciben
      cuerpos **idénticos** (comparación literal) [spec: Comité consulta proceso oculto]
- [x] 5.9 RED e2e: proceso `cerrado` con `DerechoVoto` vigente ⇒ `200`, mismo cálculo que
      `abierto` [spec: Proceso cerrado con derecho de voto vigente]
- [x] 5.10 RED e2e: `padron_total` no cambia tras mover una matrícula de aula después de la
      apertura [spec: Cambio de aula posterior a la apertura no afecta el cálculo]
- [x] 5.11 GREEN: crear `apps/backend/test/resultados/resultados.e2e-spec.ts` (patrón de
      `test/votos/comprobante-autenticado.e2e-spec.ts`) — pasa 5.1-5.10

### Phase 6: E2E del requisito 7 — consistencia de caché (Redis real)
Nota de diseño de prueba (`design.md`, "Verificación del requisito 7"): la suite usa una
**lectura de cebado** antes de comparar cuerpos byte a byte — sin ella, la primera petición real
de la prueba corre contra la ventana de estampida (dos misses simultáneos calculando en paralelo,
D7) y produce una comparación intermitente. El vencimiento de la ventana **no se simula
durmiendo 8 s** en CI: se usa `DEL resultados:{proceso_id}` desde el cliente `ioredis` propio de
la prueba como equivalente observable del vencimiento del TTL.
- [x] 6.1 RED e2e: lectura de **cebado** (descartada) + `N` lecturas sucesivas del mismo
      `proceso_id` ⇒ cuerpos **byte a byte idénticos** (`JSON.stringify` igual) [spec:
      Consistencia observable de lecturas repetidas — "Ráfaga de lecturas del mismo proceso"]
- [x] 6.2 RED e2e: `redis.ttl('resultados:{proceso_id}')` ∈ `(0, 8]` tras un miss
- [x] 6.3 RED e2e: cebar, emitir un voto nuevo, luego `DEL resultados:{proceso_id}` (equivalente
      observable al vencimiento, **sin** `sleep`), luego una lectura más ⇒ el cuerpo ya refleja el
      voto nuevo [spec: "tras vencer la ventana… MUST reflejar los votos emitidos hasta ese
      momento"]
- [x] 6.4 RED e2e: procesos `A` y `B` distintos, ambos abiertos, consultados en sucesión
      inmediata ⇒ cuerpos disjuntos, cada uno coherente con su propio padrón [spec: Lecturas de
      procesos distintos nunca se mezclan; threat: Contaminación cruzada de caché]
- [x] 6.5 RED e2e: inyectar a mano en Redis un envoltorio con `proceso_id` ajeno bajo la clave de
      `A` ⇒ la siguiente lectura de `A` se trata como miss, recalcula y responde lo correcto
      (verifica la autocomprobación de D7 contra Redis real, no solo la unitaria de 2.4)
- [x] 6.6 GREEN: crear `apps/backend/test/resultados/resultados-cache.e2e-spec.ts` con cliente
      `ioredis` propio de la prueba — pasa 6.1-6.5

### Phase 7: Regresión PR1
- [x] 7.1 `pnpm --filter @seei/backend test -- resultados` verde (suite unit completa)
- [x] 7.2 `pnpm --filter @seei/backend test:e2e -- resultados` verde contra Postgres + Redis
      reales (incluye Phase 5 y Phase 6)
- [x] 7.3 `pnpm typecheck` verde en los 4 paquetes

## PR 2 — Contrato regenerado y andamiaje de frontend (base = PR 1 branch)

### Phase 8: Contrato HTTP regenerado
- [x] 8.1 Correr `pnpm openapi:extract`: `packages/contracts/openapi.json` y
      `src/generated/api.d.ts` exponen `GET /procesos/{id}/resultados` con `200/400/401/403` —
      commitear el contrato regenerado **antes** de tocar cualquier línea de frontend
      [design.md, paso R2 de Migración/Rollout]

### Phase 9: Dependencias y `QueryProvider` (D9/D13)
- [x] 9.1 Modificar `apps/frontend/package.json`: agregar `@tanstack/react-query@^5` y
      `recharts@^2`
- [x] 9.2 Verificar al instalar: `peerDependencies` de la última versión `2.x` de `recharts`
      acepta React `^18.3.1` (riesgo anotado en design.md, pregunta abierta) — si sólo hubiera
      línea `3.x` compatible, ajustar la versión en `package.json` sin cambio de diseño (`dimension`
      desacopla el contrato del backend de la librería de gráficos)
- [x] 9.3 Crear `apps/frontend/src/app/query-client.ts`: `crearQueryClient()` con `retry: 0`,
      `refetchOnWindowFocus: false`, `staleTime: 0`
- [x] 9.4 RED componente: `QueryProvider` crea un `QueryClient` **nuevo** cada vez que se
      remonta (no reutiliza un singleton de módulo) [design.md D9]
- [x] 9.5 GREEN: crear `apps/frontend/src/app/QueryProvider.tsx` (+ `.spec.tsx`):
      `useState(crearQueryClient)` + `QueryClientProvider` — pasa 9.4
- [x] 9.6 Modificar `apps/frontend/src/app/App.tsx`: `QueryProvider` montado **dentro** de
      `AuthGuard`, envolviendo `AppShell` (`AuthProvider > AuthGuard > QueryProvider > AppShell >
      Enrutador`) — la caché de consultas muere con la sesión al desmontarse `AuthGuard`, sin
      `queryClient.clear()` manual

### Phase 10: Ruta `/resultados/:procesoId` (D11)
- [x] 10.1 RED unit: `parsearRuta('/resultados/<id>')` ida y vuelta y `rutaAPath` inversa;
      `/resultados` sin id ⇒ `no-encontrada` [threat: Enrutamiento (cliente)]
- [x] 10.2 GREEN: modificar `apps/frontend/src/app/rutas.ts` (+ `rutas.spec.ts`): variante
      `{ nombre: 'resultados'; procesoId }` — pasa 10.1
- [x] 10.3 Modificar `apps/frontend/src/app/Enrutador.tsx` (+ `.spec.tsx`): caso `'resultados'`
      queda registrado (componente placeholder o import diferido a Phase 13 según orden de
      compilación — el caso de enrutamiento se prueba aquí, la página se implementa en PR3)

### Phase 11: API cliente y hook de sondeo (D10)
- [x] 11.1 Crear `apps/frontend/src/resultados/resultados-api.ts`: wrapper tipado sobre
      `createSeeiClient` para `GET /procesos/:id/resultados` (idioma de `procesos-api.ts`)
- [x] 11.2 RED unit: `useResultadosEnVivo` con fetch doblado + `vi.useFakeTimers()` dentro de un
      `QueryClientProvider` de prueba ⇒ segunda petición a los 15 s exactos y **ninguna** antes
      [design.md D10]
- [x] 11.3 RED unit: `retry: 0` ⇒ un `403` simulado aflora al primer fallo, sin reintento
- [x] 11.4 GREEN: crear `apps/frontend/src/resultados/useResultadosEnVivo.ts` (+ `.spec.tsx`,
      no `.spec.ts` — el wrapper de prueba usa JSX): `useQuery` con
      `queryKey: ['resultados', procesoId]`, `refetchInterval: 15_000` (`INTERVALO_SONDEO_MS`
      exportado del módulo para que una vista futura lo sobrescriba), `retry: 0` — pasa 11.2-11.3

### Phase 12: Regresión PR2
- [x] 12.1 `pnpm --filter @seei/frontend test -- rutas` verde
- [x] 12.2 `pnpm --filter @seei/frontend test -- useResultadosEnVivo` verde
- [x] 12.3 `pnpm --filter @seei/frontend test -- QueryProvider` verde
- [x] 12.4 `pnpm turbo run build typecheck test` verde con la app aún sin ninguna vista de
      resultados montada [design.md, paso R3 de Migración/Rollout]

## PR 3 — Vista de resultados: participación y aviso de ocultos (base = PR 2 branch)

### Phase 13: `ResultadosPage` (contenedor)
- [ ] 13.1 RED componente: `ResultadosPage` en estado cargando (antes de la primera respuesta)
- [ ] 13.2 RED componente: `ResultadosPage` en estado error (`403`/`401` propagado por el hook)
- [ ] 13.3 RED componente: `ResultadosPage` con `estado_visibilidad = 'oculto'` ⇒ renderiza
      `AvisoResultadosOcultos`, **sin** intentar montar ningún componente de gráfico [spec: Vista
      con resultados ocultos]
- [ ] 13.4 RED componente: `ResultadosPage` con `estado_visibilidad = 'visible'` ⇒ renderiza
      `PanelParticipacion` y delega el desglose a `GraficoDesglose` (mockeado en este PR, real en
      PR4) [spec: Vista con resultados visibles]
- [ ] 13.5 GREEN: crear `apps/frontend/src/resultados/ResultadosPage.tsx` (+ `.spec.tsx`) — pasa
      13.1-13.4
- [ ] 13.6 Modificar `apps/frontend/src/app/Enrutador.tsx`: caso `'resultados'` ⇒
      `<ResultadosPage procesoId={...}/>` real (reemplaza el placeholder de Phase 10)

### Phase 14: `PanelParticipacion`
- [ ] 14.1 RED componente: dado `votos_emitidos`/`padron_total`, muestra emitidos, padrón total,
      **porcentaje de participación y abstenciones derivados en el cliente** (no leídos del
      servidor) [spec: Sin categoría de nulos; abstención derivada — "MUST calcular abstención
      como `padron_total - votos_emitidos`"]
- [ ] 14.2 RED componente: se renderiza siempre, tanto en modo visible como en modo oculto
- [ ] 14.3 GREEN: crear `apps/frontend/src/resultados/piezas/PanelParticipacion.tsx` (+
      `.spec.tsx`) — pasa 14.1-14.2

### Phase 15: `AvisoResultadosOcultos`
- [ ] 15.1 RED componente: mensaje de "resultados ocultos hasta el cierre" visible; **ningún**
      elemento de gráfico montado
- [ ] 15.2 GREEN: crear `apps/frontend/src/resultados/piezas/AvisoResultadosOcultos.tsx` (+
      `.spec.tsx`) — pasa 15.1

### Phase 16: Regresión PR3
- [ ] 16.1 `pnpm --filter @seei/frontend test -- Resultados` verde
- [ ] 16.2 `pnpm --filter @seei/frontend test -- PanelParticipacion` verde
- [ ] 16.3 `pnpm --filter @seei/frontend test -- AvisoResultadosOcultos` verde
- [ ] 16.4 Verificación funcional: sin sesión, `/resultados/:procesoId` muestra `LoginPage`
      conservando la URL (`#12` D11); tras autenticar, renderiza la misma ruta [threat:
      Enrutamiento (cliente)]
- [ ] 16.5 `pnpm typecheck` verde en los 4 paquetes

## PR 4 — Gráficos (`recharts`) y documentación (base = PR 3 branch)

### Phase 17: `GraficoDesglose` (D12)
- [ ] 17.1 RED componente: `dimension: 'opcion'` ⇒ monta `PieChart`
- [ ] 17.2 RED componente: `dimension: 'lista'` y `dimension: 'candidato'` ⇒ montan `BarChart`
      horizontal (`layout="vertical"`)
- [ ] 17.3 RED componente: `blancos` se dibuja como categoría propia, con token de color
      distinto, nunca mezclado con las filas de candidatos/listas/opciones
- [ ] 17.4 RED componente: la **tabla espejo** (`<table>`) contiene las mismas etiquetas y
      números exactos que el desglose recibido, incluidos los ítems con 0 votos y los marcados
      `baja` — las aserciones van sobre la tabla, no sobre el SVG, porque bajo jsdom
      `ResponsiveContainer` mide 0×0 y no dibuja [design.md, gotcha de `recharts` documentado en
      "Estrategia de pruebas"]
- [ ] 17.5 RED componente: el orden de las filas de la tabla respeta el orden recibido del
      servidor (votos desc, etiqueta asc) — el componente no reordena por su cuenta
- [ ] 17.6 GREEN: crear `apps/frontend/src/resultados/piezas/GraficoDesglose.tsx` (+
      `.spec.tsx`) — pasa 17.1-17.5
- [ ] 17.7 Modificar `apps/frontend/src/resultados/ResultadosPage.tsx`: reemplazar el mock de
      `GraficoDesglose` de Phase 13 por el componente real

### Phase 18: Documentación de la variable de entorno (D13)
- [ ] 18.1 Modificar `turbo.json`: `test:e2e.env` `+= RESULTADOS_CACHE_TTL_SECONDS`
- [ ] 18.2 Modificar `infra/docker/docker-compose.yml`: documentar `RESULTADOS_CACHE_TTL_SECONDS`
      (opcional, default 8) en el servicio `backend`
- [ ] 18.3 Modificar `docs/onboarding.md`: documentar `RESULTADOS_CACHE_TTL_SECONDS`
- [ ] 18.4 Modificar `README.md`: mismas variable, sección relevante

### Phase 19: Regresión final del change
- [ ] 19.1 `pnpm --filter @seei/frontend test -- GraficoDesglose` verde
- [ ] 19.2 `pnpm --filter @seei/backend test` y `test:e2e` completos verdes contra Postgres +
      Redis reales
- [ ] 19.3 `pnpm --filter @seei/frontend test` completo verde
- [ ] 19.4 `pnpm typecheck` verde en los 4 paquetes
- [ ] 19.5 `pnpm turbo run test:e2e` verifica que toma `RESULTADOS_CACHE_TTL_SECONDS` del entorno
      y que el default 8 funciona sin definirla

## Pendientes explícitamente fuera de este change (constancia para no inventarlos aquí)

Documentados como "Preguntas abiertas" en `design.md`, ninguno bloquea `sdd-apply` de este change:

- Contradicción `ocultar_resultados` default `false` en schema vs. "activo por defecto" en
  ADR-0008 — corresponde a `#17`/una enmienda de spec, no a `#16`.
- Deanonimización por agregación en procesos con padrón muy chico (sin umbral de k-anonimato
  definido por ningún ADR/spec) — no se inventa aquí; si se adopta, es una regla de spec futura.
- Gancho de invalidación de caché para `#17` (publicación instantánea al cerrar) — no se provee
  en este change a propósito (D7); el nombre de la clave (`resultados:{proceso_id}`) queda estable
  y documentado para que `#17` lo use si lo necesita.
- Reutilización del cálculo de `ResultadosService` por `#17` para el acta sellada — sin diseñar
  hasta ese change.
- Alta fidelidad visual de la vista de resultados — sujeta a revisión de diseño visual posterior
  (misma situación declarada para `#15`).
