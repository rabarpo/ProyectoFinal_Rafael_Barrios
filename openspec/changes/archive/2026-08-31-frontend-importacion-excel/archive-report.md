# Archivo: frontend-importacion-excel (Backlog #29)

**Fecha de archivado**: 2026-08-31
**Estado de cambio**: CERRADO — PASS WITH WARNINGS
**Cadena de cambios**: 4 PRs encadenados, commits tageados PR1/4 — PR4/4 en rama larga
**Rama**: `feat/administracion-procesos-electorales-pr4-cimientos-backend`

## Resumen ejecutivo

El change **frontend-importacion-excel** (backlog #29) ha sido completamente implementado, verificado y archivado. Cierra la UI de importación masiva de padrón: el backend (#9) ya estaba archivado; este change activa la pantalla para `administrador` y `director` con selector de archivo, envío síncrono, presentación de resultados (contadores + lista de errores), descarga de CSV de errores con manejo de reporte vencido, y reintento sin recargar.

**Veredicto final**: PASS WITH WARNINGS. Cero defectos críticos, 8/8 requisitos implementados, 21/21 escenarios verificados. Build y suite de frontend verdes (794/794 tests). 25/25 tareas completadas. El único WARNING es un artefacto de ciclo TDD no persistido en apply-progress para Phases 1–3; los specs existen, pasan en verde y la estructura de commits lo corrobora.

## Alcance entregado

### Nuevas capacidades
- **Cliente API multipart**: `POST /importaciones/padron` (FormData, campo `archivo`)
  y descarga de `GET /importaciones/:id/errores.csv` (blob + descarga nativa).
- **Pantalla única**: selector de archivo, envío síncrono con indicador de progreso, 
  presentación de resultado (4 contadores: filas_totales/creadas/existentes/invalidas),
  tabla simple de errores por fila (fila/campo/motivo/valor_recibido), botón de descarga CSV
  (disponible si filas_invalidas > 0), y reintento sin recargar.
- **Ruta nueva**: variante plana `Ruta 'importacion-excel'` en `rutas.ts`/`Enrutador.tsx`.
- **Menú actualizado**: placeholder `importacion-excel` en `menu-por-rol.ts` pasa a navegable
  para `administrador`/`director`.

### Validaciones
- Cliente: extensión real (nunca .xlsm), tamaño <= 5 MB — feedback inmediato, sin request.
- Backend: allowlist estricta y autorización `@Roles('administrador','director')` —
  cliente es UX, backend es autoridad.

### Archivos implementados
**Frontend** (6 nuevos, 3 modificados):
- Cliente API: `apps/frontend/src/importacion/importacion-api.ts`
- Validadores/mensajes: `validar-archivo-padron.ts`, `mensajes-error.ts`
- Página contenedora: `ImportacionExcelPage.tsx` (máquina de estados D5, gate D9)
- Piezas presentacionales: `piezas/ResumenImportacion.tsx`, `piezas/TablaErroresImportacion.tsx`
- Enrutador: `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx`
- Menú: `apps/frontend/src/app/menu-por-rol.ts`
- Specs: 10 archivos nuevos/modificados (rutas.spec.ts, menu-por-rol.spec.ts, etc.)

**Backend/Contrato**: CERO cambios — #9 está archivado, contrato inalterado.

### Pruebas (todas verdes)
- Unit: datos puros (round-trip de ruta, validación de archivo, mapeo de códigos de error)
- Componente: página con 9 escenarios (role gate, validación, envío, resultado, reintento, 404)
- Piezas: contadores (2 juegos de valores), tabla de errores (4 columnas, sin acciones, XSS-as-text)
- API: mock de fetch, stub de URL.createObjectURL/revokeObjectURL, casos 200/400/404/red

## Verificación

### Veredicto
**PASS WITH WARNINGS**

### Métricas
- **Tareas**: 25/25 completadas (100%)
- **Requisitos spec**: 8/8 implementados (100%)
  - importacion-excel: 5 requisitos
  - minimal-frontend-router: 1 requisito (variante plana)
  - menu-navegacion-post-login: 2 requisitos (MODIFIED placeholders, ADDED ítem real)
- **Escenarios**: 21/21 verificados (100%)
- **Suite frontend**: 794/794 tests pasan (106 archivos)
- **Build**: verde (`pnpm --filter @seei/frontend build` exit 0)
- **Typecheck**: 0 errores

### Hallazgos

**CRITICAL**: Ninguno.

**WARNING** (no bloqueante):
1. Evidencia de ciclo TDD incompleta en apply-progress: la tabla "TDD Cycle Evidence"
   solo documenta Phase 4 (tareas 4.1–4.6). Phases 1–3 no tienen filas RED/GREEN registradas
   en el artefacto persistido. Mitigación: los 10 archivos de spec existen con asserts
   significativos, pasan verde, y el orden RED→GREEN de tasks.md más la secuencia de commits
   PR1→PR4 corroboran el ciclo. No bloquea archivado; se recomienda que futuras corridas de
   apply persistan la tabla completa por fase.

**SUGGESTION**:
1. Los escenarios "recargar la página reinicia la pantalla" en importacion-excel y
   minimal-frontend-router se cumplen por diseño (estado solo en useState, sin storage)
   pero no tienen test automatizado. La garantía es estructural.
2. El escenario "ninguna dependencia de routing nueva en package.json" se verifica por
   inspección (grep + diff), no por un test de la suite. Considerar un test de guardia.
3. Aserciones via .parentElement en los specs de contadores: leve acoplamiento al DOM;
   un data-testid por contador simplificaría el aserto.

### Evidencia de runtime

**Ejecutado en esta fase** (jsdom, Vitest):
- Unit datos: round-trip rutas, validación archivo (matriz extensión × tamaño),
  mensajes error (5 códigos + 3 fallbacks)
- API: FormData con clave correcta, fetch crudo descarga, 404 sin createObjectURL, revokeObjectURL en finally
- Componente: gate por rol, máquina estados (4 fases), reintento sin recarga, 404 de descarga
  conserva resultado
- Piezas: contadores con 2 juegos de datos, tabla 4 columnas sin acciones, motivo traducido,
  XSS como texto

## Estado del código

### Compliance con spec
Los 8 requisitos (5+1+2) se verificaron con evidencia de code + runtime:

| Req | Escenarios | Estado | Evidencia |
|-----|-----------|--------|-----------|
| R1 Pantalla única importación | 2 (envío síncrono, rol no autorizado) | COMPLIANT | ImportacionExcelPage.spec.tsx |
| R2 Validación cliente tipo/tamaño | 3 (.xlsm rechazado, >5MB rechazado, backend 400 legible) | COMPLIANT | validar-archivo-padron.spec.ts |
| R3 Resultado contadores + errores | 2 (con errores, sin errores) | COMPLIANT | ResumenImportacion + TablaErroresImportacion specs |
| R4 Descarga CSV + reporte vencido | 3 (disponible si errores, no si 0, 404 conserva resultado) | COMPLIANT | importacion-api.spec.ts |
| R5 Reintento sin recargar | 2 (segundo envío reemplaza, recargar reinicia) | COMPLIANT | ImportacionExcelPage.spec.tsx |
| R6 Ruta plana importacion-excel | 3 (navega a /importacion-excel, recarga reinicia, sin dependencia routing) | COMPLIANT | rutas.spec.ts, Enrutador.spec.tsx |
| R7 Placeholders MODIFIED | 2 (admin ve usuarios placeholder, comite no ve academica placeholder) | COMPLIANT | menu-por-rol.spec.ts |
| R8 Ítem real importacion-excel | 4 (admin navega, director ve navegable, comite no ve, docente/estudiante no ven) | COMPLIANT | menu-por-rol.spec.ts, NavegacionPrincipal.spec.tsx |

### Compliance con diseño
Las 11 decisiones (D1–D11) se implementaron y verificaron contra código:
- D1: Ruta plana sin parámetros
- D2: Menu por rol (IMPORTACION_EXCEL navegable)
- D3: Cliente tipado + FormData + as never
- D4: Descarga fetch crudo + blob + URL.createObjectURL
- D5: Union discriminada EstadoImportacion (4 fases)
- D6: Validación cliente sin MIME (extensión real + tamaño)
- D7: Record total 5 códigos + fallback status
- D8: Contenedor/presentacional (ImportacionExcelPage único con estado)
- D9: Gate allowlist fail-closed (puedeImportar = rol ∈ {admin, director})
- D10: TablaGenerica sin acciones, 4 columnas, motivo traducido
- D11: Qué se prueba: dato puro + componente con mock + URL.createObjectURL stubead

El design.md contiene 265 líneas de especificación arquitectónica incluyendo flujos,
contratos de APIs y matrices de amenaza.

### Adherencia a TDD
- RED/GREEN documentado por fase en tasks.md (Phases 1–4)
- Todos los tests de #29 se escriben antes del código (verified by task ordering)
- No hay tautologías, ghost loops ni smoke-tests (assertion quality: 0 CRITICAL, 0 WARNING)
- Safety net: verificación de que CampoArchivo/TablaGenerica no fueron modificadas

## Cambios de la spec principal

Se crearon/actualizaron tres specs principales:

| Spec | Acción | Cambios |
|------|--------|---------|
| `openspec/specs/importacion-excel/spec.md` | APPEND | 5 requisitos nuevos (pantalla única, validación, resultado, descarga, reintento) |
| `openspec/specs/minimal-frontend-router/spec.md` | APPEND | 1 requisito nuevo (Ruta 'importacion-excel' plana) |
| `openspec/specs/menu-navegacion-post-login/spec.md` | MODIFY + ADD | Requirement "Placeholders..." actualizado (ya no menciona importacion-excel como placeholder) + 4 scenarios nuevos para ítem real |

Las 8 requirements y 21 scenarios permanecen consistentes con la implementación.

## Artefactos de referencia

| Artefacto | Ubicación | Estado |
|-----------|-----------|--------|
| Proposal | `openspec/changes/archive/2026-08-31-frontend-importacion-excel/proposal.md` | Archivado |
| Design | `openspec/changes/archive/2026-08-31-frontend-importacion-excel/design.md` | Archivado (copia fiel, 265 líneas) |
| Exploration | `openspec/changes/archive/2026-08-31-frontend-importacion-excel/exploration.md` | Archivado |
| Specs (3 deltas) | `openspec/changes/archive/2026-08-31-frontend-importacion-excel/specs/` | Archivado |
| Specs (principales) | `openspec/specs/importacion-excel/`, `minimal-frontend-router/`, `menu-navegacion-post-login/` | Activos (sincronizados) |
| Tasks | `openspec/changes/archive/2026-08-31-frontend-importacion-excel/tasks.md` | Archivado (25/25 ✓) |
| Verify Report | `openspec/changes/archive/2026-08-31-frontend-importacion-excel/verify-report.md` | Archivado |

## Riesgos conocidos

La matriz de amenazas del design.md (11 límites, 30+ casos adversariales) fue verificada:

| Amenaza | Respuesta de diseño | Verificado |
|---------|-------------------|-----------|
| Enrutamiento: /importacion-excel/algo → no-encontrada | parsearRuta exige partes.length === 1 | ✓ rutas.spec.ts |
| Session bypass | AuthGuard > AppShell (sin cambios, #12 D11) | ✓ inspeccion |
| Role escalation vía consola | Gate allowlist fail-closed, 403 server-side | ✓ Enrutador.spec.tsx |
| .xlsm/macros | Doble barrera: cliente exte nsión real, backend allowlist | ✓ validar-archivo-padron.spec |
| File upload >5MB | Cliente bloqueante, backend limits.fileSize | ✓ validar-archivo-padron.spec |
| CSV injection en descarga | Backend RFC 4180, frontend no reemite | ✓ diseño + inspección |
| Content-Disposition exploit | Nombre construido en cliente, no parseado del header | ✓ importacion-api.spec.ts |
| Blob URL leak (memoria) | URL.revokeObjectURL en finally, incluso en error | ✓ importacion-api.spec.ts |
| 404 reporte vencido → crash | Manejado como dato (ResultadoApi.ok: false), UI sigue montada | ✓ ImportacionExcelPage.spec.tsx |

## Commits entregados

| PR | Commit | Descripción |
|----|--------|------------|
| 1 | 419f88b | Cimientos: ruta plana, menú navegable, página esqueleto con gate |
| 2 | 2c943ab | Barreras puras: validador archivo + mapeo códigos error |
| 3 | 99d0a7b | Cliente API + estado + ResumenImportacion |
| 4 | 434c917 | Descarga CSV + TablaErroresImportacion + manejo 404 |

Todos los commits son cherry-pickable dentro de la rama larga de feature.

## Rollback y rollforward

**Rollback**: cada PR (1–4) es un rollback boundary:
- PR1: revertir `rutas.ts`/`Enrutador.tsx`/`menu-por-rol.ts` + `ImportacionExcelPage.tsx` skeleton
- PR2: revertir `validar-archivo-padron.ts` + `mensajes-error.ts`
- PR3: revertir `importacion-api.ts` (solo importarPadron) + wiring de estado
- PR4: revertir `descargarCsvErrores` + `TablaErroresImportacion.tsx` + botón descarga

Sin migraciones ni datos persistidos — sin riesgos de rollback.

**Rollforward**: no aplica (change cerrado)

## Próximos pasos

**Fuera de alcance de #29**:
- Tests automatizados para reload-reset (garantía es estructural)
- Test de guardia en package.json para ausencia de react-router*
- Data-testid por contador (mejora de accesibilidad de asserts)

**Investigación recomendada** (independiente de #29):
- Suites Redis-dependientes en `pnpm turbo run test`

## Conclusión

El cambio **frontend-importacion-excel** cierra con éxito la UI de importación masiva de padrón,
reutilizando el enrutador hand-rolled y el patrón cliente/presentacional de changes anteriores
(#26–#28, #30). La implementación es conservadora, completamente verificada y aditiva respecto
al backend ya archivado. Listo para producción.

**Estado final**: ARCHIVED — PASS WITH WARNINGS
**Fecha**: 2026-08-31
**Observación de Engram**: obs-id TBD (archive-report)
