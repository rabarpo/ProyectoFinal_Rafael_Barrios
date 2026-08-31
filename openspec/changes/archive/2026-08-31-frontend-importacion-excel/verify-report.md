```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:c491c754a6333c35969e0b7030ec9a4fd4950d3e543bb9cd2919b0f129e27685
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 8/8
scenarios: 21/21
test_command: pnpm --filter @seei/frontend test
test_exit_code: 0
test_output_hash: sha256:3935d3a2288b482ed2bef764fbc5d6789d7f6b23386115bb7e675d6e5ea4b2f8
build_command: pnpm --filter @seei/frontend build
build_exit_code: 0
build_output_hash: sha256:31efba2a04ada962c65524b08ac75e533438a5b0e2d2aebad41fef088d909cc8
```

# Informe de verificación — frontend-importacion-excel (Backlog #29)

## Veredicto: PASS WITH WARNINGS

Change frontend puro (cero archivos de backend tocados). Las 25 tareas están implementadas de
forma genuina; los 8 requisitos y 21 escenarios de las 3 capabilities tienen cobertura de código
real; las 11 decisiones de diseño D1-D11 se respetan. La suite de @seei/frontend corre 794/794
en verde, typecheck sale 0 y build compila. Se registra 1 WARNING (la tabla de evidencia de
ciclo TDD en apply-progress solo documenta la Phase 4; las Phases 1–3 se corroboran por el orden
RED->GREEN de tasks.md, la estructura de commits y la ejecucion en verde) y 3 SUGGESTION.

- Modo: OpenSpec (repo-local); Strict TDD ACTIVO; Runner "pnpm turbo run test"
- Commits: 419f88b (PR1); 2c943ab (PR2); 99d0a7b (PR3); 434c917 (PR4)
- Base de comparacion: cf2213f

## 1. Completitud (artefactos)

| Dimension | Estado |
|---|---|
| proposal | presente (no reevaluado aqui) |
| specs (3 deltas) | presentes y verificados |
| design.md (D1-D11) | presente y verificado |
| tasks.md (25 tareas) | todas [x], auditadas |
| apply-progress (obs 241) | presente; tabla de ciclo TDD solo para Phase 4 |

## 2. Cobertura requisito por requisito

### Capability importacion-excel (5 requisitos / 12 escenarios)

| Requisito / Escenario | Evidencia | Estado |
|---|---|---|
| Pantalla unica - Envio sincrono con indicador de progreso | ImportacionExcelPage.spec.tsx "durante el envio muestra role=status y deshabilita el boton; en 201 renderiza el resumen"; importacion-api.spec.ts "envia POST /importaciones/padron con FormData(archivo)" | COMPLIANT |
| Pantalla unica - Rol no autorizado no alcanza la pantalla | ImportacionExcelPage.spec.tsx it.each comite/docente/estudiante; Enrutador.spec.tsx [1.5] it.each roles sin gestion | COMPLIANT |
| Validacion tipo/tamano - Extension no permitida | validar-archivo-padron.spec.ts matriz .xlsm/.xls/.pdf/sin-ext/padron.xlsx.xlsm; ImportacionExcelPage.spec.tsx ".xlsm ... NO invoca importarPadron" | COMPLIANT |
| Validacion tipo/tamano - Archivo que supera 5 MB | validar-archivo-padron.spec.ts "5 MB exactos" vs "5 MB + 1 byte"; ImportacionExcelPage.spec.tsx "mas de 5 MB ... NO invoca importarPadron" | COMPLIANT |
| Validacion tipo/tamano - Rechazo del backend pese a validacion de cliente | ImportacionExcelPage.spec.tsx "en un 400 del backend muestra el mensaje legible sin desmontar"; mensajes-error.spec.ts; importacion-api.spec.ts "mapea un 400 con codigo de negocio" | COMPLIANT |
| Presentacion del resultado - Filas validas e invalidas | ResumenImportacion.spec.tsx (4 contadores, 2 juegos de valores); TablaErroresImportacion.spec.tsx; ImportacionExcelPage.spec.tsx "filas_invalidas > 0 muestra la tabla" | COMPLIANT |
| Presentacion del resultado - Importacion sin errores | ImportacionExcelPage.spec.tsx "filas_invalidas === 0 no muestra tabla ni boton" | COMPLIANT |
| Presentacion del resultado - MUST NOT paginar ni virtualizar | TablaErroresImportacion.tsx usa TablaGenerica sin paginacion; sin react-window | COMPLIANT |
| Descarga CSV - Descarga disponible con filas invalidas | importacion-api.spec.ts "en 200 descarga el blob con nombre de cliente" (URL + encodeURIComponent); ImportacionExcelPage.spec.tsx boton "Descargar CSV de errores" | COMPLIANT |
| Descarga CSV - Sin control de descarga cuando no hay errores | ImportacionExcelPage.spec.tsx "filas_invalidas === 0 ... ni boton de descarga" | COMPLIANT |
| Descarga CSV - Reporte de errores expirado (404) | importacion-api.spec.ts "en 404 devuelve ok:false ... sin crear object URL"; ImportacionExcelPage.spec.tsx "un 404 de descarga muestra el aviso de reporte vencido conservando resumen y tabla" | COMPLIANT |
| Reintento sin recargar - Segundo envio reemplaza el resultado | ImportacionExcelPage.spec.tsx "un segundo envio reemplaza el resultado sin recarga ni navegacion" (2 llamadas, 10->99) | COMPLIANT |
| Reintento sin recargar - Recargar la pagina reinicia la pantalla | Estado solo en memoria (useState); sin localStorage/sessionStorage/URL (inspeccion + D5). Sin test automatizado. | COMPLIANT por inspeccion - SUGGESTION |

### Capability minimal-frontend-router (1 requisito / 3 escenarios)

| Requisito / Escenario | Evidencia | Estado |
|---|---|---|
| Ruta plana - Navegacion a /importacion-excel renderiza la pantalla | rutas.spec.ts [1.1] round-trip + /importacion-excel/x, /algo/mas, /.., /../../etc/passwd -> no-encontrada; Enrutador.spec.tsx [1.5] it.each administrador/director | COMPLIANT |
| Ruta plana - Recargar la pagina reinicia la pantalla | Sin persistencia en URL ni storage (inspeccion rutas.ts variante sin parametros + D1/D5). Sin test de reload. | COMPLIANT por inspeccion - SUGGESTION |
| Ruta plana - Ninguna dependencia de routing nueva en package.json | git diff cf2213f..HEAD -- apps/frontend/package.json vacio; grep -iE "react-router|wouter|@tanstack/react-router|history" sin coincidencias (tarea 5.2) | COMPLIANT por inspeccion - SUGGESTION |

### Capability menu-navegacion-post-login (2 requisitos / 6 escenarios)

| Requisito / Escenario | Evidencia | Estado |
|---|---|---|
| Placeholders deshabilitados (MODIFIED) - Administrador ve placeholder deshabilitado (Usuarios) | NavegacionPrincipal.spec.tsx casos de placeholder usuarios/configuracion vigentes; menu-por-rol.spec.ts [4.2] | COMPLIANT |
| Placeholders - Comite ya no ve placeholder de academica | Tests de #26 vigentes; menu-por-rol.spec.ts [1.3] "ya no queda ningun item proximamente en el mapa" | COMPLIANT |
| Placeholders - importacion-excel MUST NOT seguir siendo placeholder | menu-por-rol.ts proximamente->navegable; menu-por-rol.spec.ts [1.3]; NavegacionPrincipal.spec.tsx [1.4] | COMPLIANT |
| Item real (ADDED) - Administrador navega desde el menu | NavegacionPrincipal.spec.tsx [1.4] click -> pathname === /importacion-excel | COMPLIANT |
| Item real - Director ve el item como navegable | menu-por-rol.spec.ts [1.3] (administrador y director, objeto exacto con ruta) | COMPLIANT |
| Item real - Comite no ve el item | menu-por-rol.spec.ts [1.3] "comite, docente y estudiante no tienen item importacion-excel" | COMPLIANT |
| Item real - Roles sin gestion (docente/estudiante) no ven el item | mismo test it.each | COMPLIANT |

Matriz de cumplimiento: 21/21 escenarios COMPLIANT (2 via inspeccion de codigo donde el
comportamiento de recarga del navegador no es testeable en jsdom; 1 via inspeccion de package.json).

## 3. Auditoria de las 25 tareas

| Fase | Tareas | Verificacion | Estado |
|---|---|---|---|
| 1 (PR1) | 1.1-1.6 | rutas.ts variante + parsearRuta (length===1) + rutaAPath; menu-por-rol.ts navegable; Enrutador.tsx case; ImportacionExcelPage.tsx skeleton con gate D9. Specs con asserts nuevos. | DONE |
| 2 (PR2) | 2.1-2.4 | validar-archivo-padron.ts (regex extension real, 0 < size <= 5 MB, sin MIME); mensajes-error.ts (Record total 5 codigos + fallback status, menciona 2000). | DONE |
| 3 (PR3) | 3.1-3.6 | importarPadron (cliente tipado + aFormData + as never); union discriminada EstadoImportacion; ResumenImportacion.tsx puro. Specs 201/400/red + reintento. | DONE |
| 4 (PR4) | 4.1-4.6 | descargarCsvErrores (fetch crudo, blob, a-download nombre de cliente, revokeObjectURL en finally); TablaErroresImportacion.tsx (TablaGenerica sin acciones); boton de descarga + errorDescarga en estado aparte. Specs 200/404/red + XSS-as-text. | DONE |
| 5 | 5.1-5.3 | Suite frontend verde, package.json sin routing lib, typecheck 0, CampoArchivo/TablaGenerica sin diff. Re-verificado. | DONE |

Ninguna tarea es cosmetica ni "checked sin hacer". El orden RED->GREEN de tasks.md es real:
cada tarea GREEN tiene su archivo de spec con asserts significativos.

## 4. Auditoria de cumplimiento TDD (Strict TDD)

| Chequeo | Resultado | Detalle |
|---|---|---|
| Evidencia TDD reportada | PARCIAL | apply-progress (obs 241) incluye tabla "TDD Cycle Evidence" solo para Phase 4. Phases 1-3 no tienen filas de ciclo en el artefacto retenido. |
| Todas las tareas tienen tests | SI | 10/10 archivos de spec existen (6 nuevos + 4 modificados). |
| RED confirmado (tests existen) | SI | Los 10 archivos existen con los casos descritos en tasks.md. |
| GREEN confirmado (tests pasan) | SI | pnpm --filter @seei/frontend test -> 794/794 en verde, incluidos los ~30 casos nuevos de #29. |
| Triangulacion adecuada | SI | validar-archivo-padron matriz extension x tamano; mensajes-error 5 codigos + 3 fallbacks; importacion-api 200/400/404/red; ImportacionExcelPage 9 escenarios; ResumenImportacion "no hardcodea" con 2 juegos de valores. |
| Safety net en archivos modificados | SI (declarado) | apply-progress documenta baseline verde antes de cada modificacion. |

Cumplimiento TDD: 5/6 chequeos plenos; 1 parcial (evidencia de ciclo de Phases 1-3 no persistida).
No bloqueante: los specs existen, son significativos y pasan; la estructura de commits PR1->PR4 y
el orden de tasks.md corroboran el ciclo.

### Auditoria de calidad de aserciones (Step 5f)

Revisados los 10 archivos de spec. Sin tautologias, sin ghost loops, sin smoke-tests solos,
sin aserciones que no ejecutan codigo de produccion.

| Observacion | Severidad |
|---|---|
| Specs de contadores usan screen.getByText(...).parentElement para leer el valor - leve acoplamiento estructural (no a CSS ni a estado interno). Aceptable. | SUGGESTION |
| importacion-api.spec.ts verifica revokeObjectURL/createObjectURL con toHaveBeenCalled* - es el contrato observable del helper, combinado con aserciones de valor (download, URL). | Aceptable |

Calidad de aserciones: 0 CRITICAL, 0 WARNING.

### Distribucion por capa

| Capa | Tests (aprox. #29) | Herramienta |
|---|---|---|
| Unit (datos / API con fetch stub) | ~28 | Vitest |
| Componente (RTL + jsdom) | ~19 | Vitest + @testing-library/react |
| E2E | 0 | ninguno nuevo (D11) |

## 5. Auditoria de decisiones de diseno D1-D11

| # | Decision | Verificacion | Estado |
|---|---|---|---|
| D1 | Ruta plana sin parametros | rutas.ts variante { nombre: 'importacion-excel' }, parsearRuta exige partes.length === 1, rutaAPath -> /importacion-excel; Enrutador.tsx un case. Tests de path anidado -> no-encontrada. | HONRADA |
| D2 | Menu: proximamente -> navegable, cero cambios de filas | menu-por-rol.ts diff: solo IMPORTACION_EXCEL (clase + ruta); MENU_POR_ROL sin cambios de filas. | HONRADA |
| D3 | Subida multipart con cliente tipado + as never | client().POST('/importaciones/padron', { body: body as never }), aFormData local con clave archivo, sin Content-Type manual, sin credentials. Test verifica URL + clave + ausencia de application/json. | HONRADA |
| D4 | Descarga con fetch crudo + blob | fetch crudo, res.blob(), URL.createObjectURL, a-download sintetico, nombre importacion-<id>-errores.csv en cliente, encodeURIComponent(importacionId), URL.revokeObjectURL en finally (if url), retorna ResultadoApi<void>. Test: ignora Content-Disposition hostil. | HONRADA |
| D5 | Union discriminada de estado | EstadoImportacion = inactivo | enviando | resultado{datos} | error{mensaje}; File en useState aparte; errorDescarga en useState aparte (no pisa fase=resultado). Sin booleanos, sin useReducer, sin storage. | HONRADA |
| D6 | Validacion de cliente sin pareo de MIME | /\.(xlsx|csv)$/i sobre archivo.name, size <= 0 y size > 5 MB; NO mira archivo.type. Tests: .xlsx con type vacio / application/octet-stream -> aceptado. | HONRADA |
| D7 | Record total sobre 5 codigos + fallback status | Record<CodigoImportacion, string> sobre los 5 codigos, prioridad de codigo, fallback 403/404, generico. LIMITE_FILAS_EXCEDIDO menciona "2000". | HONRADA |
| D8 | Contenedor / presentacional | ImportacionExcelPage unico con estado/efectos/API; ResumenImportacion y TablaErroresImportacion puros (solo props, sin useSesion, sin fetch). | HONRADA |
| D9 | Gate de rol allowlist fail-closed | puedeImportar = rol === 'administrador' || rol === 'director'; si falso -> p role=status, return temprano, cero piezas, cero fetch. rol es undefined si no autenticado. | HONRADA |
| D10 | TablaErroresImportacion reusa TablaGenerica sin acciones | Se omite la prop acciones (default [] en TablaGenerica.tsx:38, sin columna de escritura si length === 0). 4 columnas, motivo traducido via MOTIVOS_FILA, claveFila = (e) => e.fila + '-' + e.campo. Test: cero button, <script> como texto. | HONRADA |
| D11 | Que se prueba y como | Dato puro sin render; RTL + vi.mock('./importacion-api') + patron proveer()/SesionContext; URL.createObjectURL/revokeObjectURL stubeados con vi.stubGlobal. Sin e2e nuevos. | HONRADA |

Desviacion menor documentada (apply-progress): el diseno esbozaba extraerCodigoDeRespuesta; se
implemento como codigoDeRespuesta(res) reusando extraerCodigo via res.clone().json(). Sin impacto
funcional. No es hallazgo.

## 6. Evidencia de ejecucion

| Comando | Exit | Resultado |
|---|---|---|
| pnpm --filter @seei/frontend test | 0 | 106 archivos / 794 tests - 794 passed, 0 failed (~67 s). El ruido en stderr ("useSesion debe usarse dentro de <AuthProvider>") es de sesion-context.spec.tsx, un test de camino negativo que asevera ese throw. |
| pnpm --filter @seei/frontend typecheck (tsc --noEmit -p tsconfig.json) | 0 | Sin errores de tipo. |
| pnpm --filter @seei/frontend build (vite build) | 0 | 810 modulos, dist/ generado. Warning informativo de chunk > 500 kB (preexistente). |
| pnpm turbo run test (monorepo) | 1 | @seei/frontend VERDE. @seei/backend: 4 suites fallan - src/importacion/importacion.service.spec.ts, src/auth/session.service.spec.ts, src/auth/bloqueo.service.spec.ts, src/auth/recovery.service.spec.ts - todas por Redis ECONNREFUSED / timeout de hook. 31 tests fallidos, 665 passed. |

Analisis de los fallos de backend: preexistentes y ambientales (no hay Redis local).
git diff cf2213f..434c917 --stat confirma que #29 toca exclusivamente apps/frontend/** (19
archivos, 0 de backend, 0 de packages/contracts). importacion.service.spec.ts es backend y NO fue
modificado por este change. No bloquean #29.

Cobertura: no se ejecuto herramienta de cobertura - analisis por archivo omitido (no bloqueante).

## 7. Restricciones verificadas

| Restriccion | Verificacion | Estado |
|---|---|---|
| CampoArchivo.tsx sin modificar | git diff cf2213f..HEAD -- .../CampoArchivo.tsx -> vacio | OK |
| TablaGenerica.tsx sin modificar | git diff cf2213f..HEAD -- .../TablaGenerica.tsx -> vacio | OK |
| apps/frontend/package.json sin libreria de routing | diff vacio; grep -iE "react-router|wouter|@tanstack/react-router|history" sin coincidencias | OK |
| Cero archivos de backend / contrato | git diff --stat cf2213f..434c917 -> solo apps/frontend/** | OK |

## 8. Hallazgos

### CRITICAL
Ninguno.

### WARNING
1. Evidencia de ciclo TDD incompleta en apply-progress: la tabla "TDD Cycle Evidence" de la
   observacion 241 solo documenta la Phase 4 (tareas 4.1-4.6). Las Phases 1-3 (tareas 1.1-3.6) no
   tienen filas RED/GREEN/TRIANGULATE/SAFETY-NET registradas. Mitigacion: los 10 archivos de spec
   existen con asserts significativos, pasan en verde, y el orden RED->GREEN de tasks.md mas la
   secuencia de commits PR1->PR4 corroboran el ciclo. No bloquea el archivado; se recomienda que
   futuras corridas de apply persistan la tabla completa por fase.

### SUGGESTION
1. Los escenarios "recargar la pagina reinicia la pantalla" (en importacion-excel y en
   minimal-frontend-router) se cumplen por diseno (estado solo en useState, sin
   localStorage/sessionStorage/URL) pero no tienen test automatizado. La garantia es estructural.
2. El escenario "ninguna dependencia de routing nueva en package.json" se verifica por inspeccion
   (grep + diff), no por un test de la suite. Considerar un test de guardia.
3. Aserciones via .parentElement en los specs de contadores: leve acoplamiento al DOM; un
   data-testid por contador simplificaria el aserto.

## 9. Conclusion

PASS WITH WARNINGS. El change esta funcionalmente completo y correcto respecto a las 3 specs y al
diseno; las 25 tareas son reales; la suite de frontend, el typecheck y el build pasan. El unico
WARNING (evidencia TDD de Phases 1-3 no persistida en el artefacto) no compromete la correccion
verificable y no bloquea el archivado. Los fallos de backend en pnpm turbo run test son
ambientales (Redis ausente), preexistentes y ajenos a un change que no toca backend.

Siguiente fase recomendada: sdd-archive.
