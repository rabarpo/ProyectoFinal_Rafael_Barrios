# Verify report: fidelidad-visual-boleta-votacion

**Veredicto: PASS WITH WARNINGS** - listo para archivar, con 1 hallazgo menor documentado.

## Completitud

29/29 fases de tasks.md (5 PRs) verificadas contra el codigo real, no solo el checkbox:

- PR1 cb53b47 (commiteado) - periodo_lectivo en ComprobanteDto, poblado en
  VotosService.construirComprobante() via 4a lectura del Promise.all; comprobante.service.ts
  intacto (hereda por delegacion).
- PR2 adb9aa4 (commiteado) - PasoInformacionProceso con badge, hero con overlay/degradado y
  fallback bg-primary si el logo 404, 3 tarjetas de reglas con icono (iconos-reglas.tsx),
  footer.
- PR3 (working tree, sin commitear) - BotonSeleccion (contrato ARIA unico, D1),
  BannerInstrucciones (D6), TarjetaVotoBlanco reescrita, PasoBoleta con banner + grilla de 3
  columnas.
- PR4 (working tree, sin commitear) - TarjetaLista/TarjetaCandidato/TarjetaOpcion reescritas
  al patron foto+cinta+doble boton, adoptando BotonSeleccion de PR3.
- PR5 (working tree, sin commitear) - PanelComprobante con periodo lectivo condicional (D2),
  indicador estatico Sincronizado (D3), boton Cerrar Sesion via prop (D7); wiring de
  VotacionPage/ComprobantePage con useSesion().

Nota de estado (no defecto de codigo): PR1 y PR2 ya estan commiteados en la rama
(cb53b47, adb9aa4); solo PR3-PR5 permanecen sin commitear en el working tree. Esto difiere
ligeramente de "las 5 PRs sin commitear" del encargo, pero no afecta la verificacion de codigo,
es informacion para el paso de entrega/archive.

## Cumplimiento de specs (escenario por escenario)

### specs/vote-casting/spec.md

- Campo periodo_lectivo: VotosService.construirComprobante() agrega una 4a lectura
  (anioEscolar.findFirst con where activo true, orderBy nombre desc) sin join con
  Voto/DerechoVoto; periodo_lectivo queda undefined si no hay anio activo. Cubierto por
  votos.service.spec.ts y comprobante.service.spec.ts (delegacion). PASS.
- Banner de instrucciones: BannerInstrucciones montada por PasoBoleta entre el titulo y el
  radiogroup, sin role alert/status. Test [14.1] confirma que no bloquea tarjetas ni
  Siguiente Paso. PASS.
- Modelo de interaccion foto+cinta+doble boton, ARIA preservada: BotonSeleccion conserva
  input type radio name eleccion sr-only dentro de un label (D1); Ver Propuesta Completa es
  un button hermano, sin name eleccion ni type radio. radiogroup preservado en PasoBoleta.
  PASS, con 1 WARNING (ver Hallazgos).
- Paso 1 con badge/hero/reglas-icono/footer y fallback de logo 404: confirmado en
  PasoInformacionProceso.tsx: el bloque hero ya NO desaparece con onError, pinta bg-primary
  solido detras del degradado. PASS.
- Variantes de tarjeta por tipo de proceso: PasoBoleta selecciona TarjetaLista (municipio),
  TarjetaCandidato (representante_aula/padres), TarjetaOpcion (consulta) por proceso.tipo,
  nunca por heuristica. TarjetaVotoBlanco presente en las 3 variantes, nunca preseleccionada. PASS.
- Invariante D6 heredada (Seleccion.id siempre opcion.id, nunca candidato_id): intacta en
  PasoBoleta.seleccionarOpcion(). PASS.

### specs/comprobante-autenticado/spec.md

- Boton Cerrar Sesion: PanelComprobante recibe onCerrarSesion obligatorio; ambos call
  sites (VotacionPage.tsx, ComprobantePage.tsx) lo cablean a logout() de useSesion(). Tests
  [25.1]/[27.1]/[27.2] confirman ambos caminos (post-voto y relectura autenticada) sin romper
  yaRegistrado. PASS.
- Periodo Lectivo condicional / Sin periodo lectivo no rompe: PanelComprobante renderiza la
  fila solo si comprobante.periodo_lectivo esta definido; tests [23.1]/[23.2]. PASS.
- Estado del Sistema Sincronizado siempre estatico: literal fijo sin condicional, punto de
  color aria-hidden true; test [24.2] confirma el aria-hidden. PASS (ver nota en Hallazgos
  sobre cobertura explicita de en cualquier estado).
- PanelComprobante sigue presentacional puro: no llama useSesion()/navegar() internamente;
  test [25.2] lo confirma sin providers. PASS.
- REMOVED Sin campos nuevos en ComprobanteDto: correctamente reemplazado por el requirement
  MODIFIED que documenta el renderizado condicional real. Consistente con el codigo.

## Cumplimiento de design.md (D1-D8)

- D1 (contrato ARIA unico en BotonSeleccion, label sobre input radio sr-only, aria-label con
  sufijo WCAG 2.5.3): implementado literal, incluyendo onKeyDown para Space/Enter. PASS.
- D2 (periodo_lectivo resuelto en construirComprobante(), comprobante.service.ts sin tocar):
  confirmado, git diff de PR1 no toca comprobante.service.ts. PASS.
- D3 (Sincronizado decorativo, comentario obligatorio en el codigo): presente el comentario
  explicito en PanelComprobante.tsx. PASS.
- D4 (hero con overlay + fallback bg-primary, sin ocultar el bloque en 404): implementado. PASS.
- D5 (SVG inline propios, sin libreria nueva): iconos-reglas.tsx con 5 iconos, mismo baseProps
  que iconos-menu.tsx; no se agrego dependencia de iconos a package.json. PASS.
- D6 (banner estatico sin props, sin live region): confirmado. PASS.
- D7 (PanelComprobante presentacional puro, acciones por props obligatorias, wiring en los 2
  call sites): confirmado, incluidos los tests dedicados [27.1]/[27.2] de wiring. PASS.
- D8 (tokens de DESIGN-SYSTEM.md, sin hex literal): revision de las clases Tailwind en
  PasoInformacionProceso, TarjetaLista/Candidato/Opcion, TarjetaVotoBlanco, PanelComprobante:
  coinciden con la tabla de D8, sin literales hex. PASS.

## Scope declarado (proposal.md)

- git diff de AppShell.tsx, NavegacionPrincipal.tsx, menu-por-rol.ts contra el estado previo
  del change: vacio, confirma que Out of Scope se respeto en las 5 PRs.
- VotosService.emitir(): sin modificaciones, solo se toco construirComprobante() (metodo
  separado, fuera de la transaccion critica). Los 19 tests de emitir()/idempotencia/UNIQUE/
  derecho al voto en votos.service.spec.ts no fueron editados (diff acumulado del change es
  puramente aditivo: 89 inserciones, 0 eliminaciones en ese archivo).
- rg -ril san alfonso apps/: unica coincidencia PasoInformacionProceso.spec.tsx, que es una
  asercion NEGATIVA (assert de que el texto NO aparece), no una filtracion real. Confirmado.

## Evidencia de tests/build

- pnpm --filter @seei/frontend test -- --run: 95/95 archivos, 691/691 tests OK. (Los mensajes
  "Uncaught useSesion debe usarse dentro de AuthProvider" en la salida son el test negativo
  esperado de sesion-context.spec.tsx, no fallos.)
- pnpm --filter @seei/backend test -- votos comprobante: 8/8 suites, 75/75 tests OK
  (votos.controller.spec.ts, votos.service.spec.ts, papeleta.service.spec.ts,
  papeleta-archivos.service.spec.ts, comprobante.service.spec.ts,
  mis-derechos.service.spec.ts, correo-comprobante.spec.ts, comprobante.spec.ts).
- pnpm --filter @seei/frontend typecheck: verde, sin errores.
- Nota conocida (confirmada preexistente, fuera de este change, segun indicacion del encargo): el
  typecheck a nivel monorepo falla en mis-derechos.service.spec.ts (RolUsuario), y 3 tests de
  apps/backend/src/auth/*.service.spec.ts fallan por falta de Redis local. Ninguno de esos
  archivos fue tocado por este change, no se reportan como hallazgos.

## Hallazgos

CRITICAL: 0

WARNING: 1

- PasoBoleta.spec.tsx test [21.1]: el spec vote-casting exige un escenario de comportamiento
  ("al presionar flecha derecha/abajo, el foco avanza al boton solido de la siguiente tarjeta").
  El test implementado verifica una condicion ESTRUCTURAL (el boton Ver Propuesta Completa
  no es type radio ni comparte name eleccion con el grupo), no una asercion de movimiento
  de foco real. Esto es una limitacion conocida de jsdom (no implementa la navegacion nativa de
  flechas de un radiogroup de inputs), asi que el test estructural es una prueba indirecta
  razonable, pero deja el escenario de comportamiento explicito del spec sin una asercion directa
  de document.activeElement. No bloquea el archive: la garantia real depende del comportamiento
  nativo del navegador sobre input type radio name eleccion, que es HTML estandar y no
  requiere codigo propio (documentado en design.md D1 como la razon misma de conservar el input
  nativo). Se recomienda, si se retoma este change o uno futuro, agregar una prueba e2e
  (Playwright) que si ejerza el foco real en un navegador, fuera del alcance de Testing
  Library/jsdom.

SUGGESTION: 1

- Task 24.1 (Sincronizado se muestra igual en cualquier estado, con/sin periodo_lectivo,
  recien emitido o reintento) no tiene un test dedicado con ese nombre exacto en
  PanelComprobante.spec.tsx (solo existe [24.2] para el aria-hidden). El requisito esta
  satisfecho por construccion (el indicador se renderiza incondicionalmente en el JSX, sin ningun
  if/&& que lo envuelva, y los tests [23.1]/[23.2]/[19.2]/[19.3] ya montan el componente
  en los 4 estados relevantes sin que el indicador desaparezca), pero una asercion explicita
  reforzaria la trazabilidad de esa tarea puntual.

## Siguiente paso recomendado

sdd-archive.
