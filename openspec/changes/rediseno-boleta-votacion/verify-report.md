# Verify report: rediseno-boleta-votacion (backlog #31)

**Veredicto: PASS** — listo para archivar.

## Completitud

80/80 tareas de `tasks.md` verificadas contra el código real (no solo el checkbox), a través de
los 4 PR commiteados:

- PR1 `f5588d3` — `PapeletaOpcionDto` enriquecido + `PapeletaService.obtenerOpciones()` público
- PR2 `c360321` — `PapeletaArchivosService` + rutas de foto/plan de trabajo + `SinRestriccionDeRol()`
- PR3 `5a52100` — cliente API + 4 piezas de tarjeta del Paso 2
- PR4 `78876ea` — reescritura de los 3 pasos + wiring

## Invariantes críticas verificadas

- **`Seleccion.id` en `PasoBoleta.tsx`**: el único camino a `onSeleccionar` es
  `seleccionarOpcion(opcion.id)`; `candidato_id` solo se usa para armar `urlFotoOpcion(...)`,
  nunca como id de selección. Evita el `ELECCION_INVALIDA` que se produciría si el backend
  recibiera un uuid de `Candidato` en `lista_id`.
- **5 casos de 403 idéntico** en `papeleta-archivos.service.ts`: `resolverOpciones()` lanza
  `new ForbiddenException()` sin cuerpo para derecho ajeno/inexistente; el mismo objeto se lanza
  cuando `.find()` no encuentra la opción, cubriendo id de otro proceso, id de baja y tipo
  `consulta` con la misma respuesta. Los bytes solo se leen después de superar estas
  validaciones.
- **`VotosService.emitir()` intacto**: idempotencia (`clave_idempotencia`), lock `FOR UPDATE OF dv`,
  manejo de colisión `UNIQUE` (`esColisionDeVoto`) y validación del derecho al voto sin cambios;
  el archivo no aparece en el diff de ninguno de los 4 PR.
- **Branding**: `rg -i "san alfonso"` fuera de `openspec/` solo encuentra referencias en
  `DESIGN-SYSTEM.md` (front-matter, fuera de alcance) y `BACKLOG.md` (descripción del ítem) — cero
  ocurrencias en componentes/copy de `apps/`.

## Evidencia de tests/build

- `pnpm --filter @seei/backend test -- votos`: 8 suites / 70 tests OK.
- `pnpm --filter @seei/backend test` (completo): 51/55 suites, 625/656 tests OK; las 4 suites que
  fallan (`session.service`, `bloqueo.service`, `recovery.service`, `importacion.service`) son por
  timeout de conexión a Redis en este sandbox, no relacionadas con el change.
- `pnpm --filter @seei/frontend test`: 92/92 archivos, 645/645 tests OK.
- `pnpm typecheck`: `@seei/contracts`/`@seei/frontend`/`@seei/worker` en verde; `@seei/backend#typecheck`
  falla solo en `mis-derechos.service.spec.ts` (backlog #30, último commit `641e8ec`, no tocado por
  ninguno de los 4 PR de este change — ya documentado en tasks.md 4.2/15.2/21.4).

## Cumplimiento de specs

Los 5 specs delta (`acceso-archivos-boleta`, `vote-casting`, `comprobante-autenticado`,
`configuracion-institucional`, `sistema-diseno-visual`) verificados escenario por escenario contra
el código y los tests en verde, incluyendo `SinRestriccionDeRol()` aplicado solo a
`ConfiguracionController.obtenerLogo()`, `PanelComprobante` sin periodo lectivo ni estado de
sincronización, y `BarraProgresoVotacion` montada independientemente por paso.

## Hallazgos

CRITICAL: 0. WARNING: 0. SUGGESTION: 0. Las dos "Preguntas abiertas" de `design.md` (`Lista.numero`,
`cargo` del cabeza de lista) son preguntas de diseño ya trackeadas, no defectos.

**Siguiente paso recomendado**: `sdd-archive`.
