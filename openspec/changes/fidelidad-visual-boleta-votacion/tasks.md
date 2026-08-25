# Tasks: Fidelidad visual de la boleta de votación contra las capturas de referencia

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~110 / PR2 ~280 / PR3 ~300 / PR4 ~330 / PR5 ~190 (~1210 total, tests incluidos; `packages/contracts/src/generated/api.ts` regenerado, excluido del conteo) |
| 400-line budget risk | PR1 Bajo / PR2 Medio / PR3 Medio / PR4 Medio-alto / PR5 Bajo |
| Chained PRs recommended | Yes |
| Suggested split | PR1 backend `periodo_lectivo` (D2) → PR2 Paso 1 completo (D4/D5/D8) → PR3 `BotonSeleccion` + banner + `TarjetaVotoBlanco` (D1/D6, PR de riesgo) → PR4 adopción del patrón en `TarjetaLista`/`TarjetaCandidato`/`TarjetaOpcion` → PR5 Paso 3 (D3/D7) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main (rama larga, commits tageados por PR, sin branches nuevos por convención del proyecto) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium (PR2-PR4)

### Suggested Work Units

| Unit | Goal | PR | Base | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|------|----------------------|-----------------|-------------------|
| 1 | `periodo_lectivo?: string` en `ComprobanteDto`, poblado en `VotosService.construirComprobante()` vía 4ª lectura del `Promise.all` (D2); `ComprobanteService.obtener()` no se toca (hereda por delegación) | PR 1 | tracker | `pnpm --filter @seei/backend test -- votos.service comprobante.service` | Unit con `PrismaService` mockeado | `git revert` PR1; `ComprobanteDto` de 2 campos vuelve a estar activo, sin migración |
| 2 | `PasoInformacionProceso` con badge, hero con overlay, tarjetas de reglas con ícono (`iconos-reglas.tsx` nuevo), footer (D4/D5/D8) | PR 2 | PR1 | `pnpm --filter @seei/frontend test -- PasoInformacionProceso` | Testing Library | `git revert` PR2; Paso 1 minimalista anterior vuelve a estar activo, PR1 no afectado |
| 3 | `BotonSeleccion` (D1, pieza compartida del contrato ARIA) + `BannerInstrucciones` (D6) + `TarjetaVotoBlanco` reescrita + `PasoBoleta` (banner, grilla, hint) — PR de riesgo de accesibilidad | PR 3 | PR2 | `pnpm --filter @seei/frontend test -- BotonSeleccion BannerInstrucciones TarjetaVotoBlanco PasoBoleta` | Testing Library | `git revert` PR3; Paso 2 vuelve al patrón tarjeta-como-`<label>` completo en las 4 tarjetas, PR1/PR2 no afectados |
| 4 | `TarjetaLista`/`TarjetaCandidato`/`TarjetaOpcion` reescritas al patrón foto+cinta+botón outline+`BotonSeleccion`, adoptando la pieza validada en PR3 | PR 4 | PR3 | `pnpm --filter @seei/frontend test -- TarjetaLista TarjetaCandidato TarjetaOpcion VotacionPage` | Testing Library | `git revert` PR4; solo `TarjetaVotoBlanco` queda con el patrón nuevo, las otras 3 vuelven al `<label>` completo — ambas conviven porque comparten `name="eleccion"` |
| 5 | `PanelComprobante` con "Período Lectivo" condicional, indicador estático "Sincronizado", botón "Cerrar Sesión" (D3/D7); wiring de `VotacionPage`/`ComprobantePage` | PR 5 | PR4 (depende de PR1 para el campo) | `pnpm --filter @seei/frontend test -- PanelComprobante VotacionPage ComprobantePage` | Testing Library | `git revert` PR5; comprobante sin período lectivo/sincronizado/cerrar sesión, PR1-PR4 no afectados |

**Bloqueo previo a PR5**: si `periodo_lectivo` se agrega al DTO en PR1, `pnpm openapi:extract` debe
ejecutarse y commitearse en PR1 antes de que PR5 tipe `PanelComprobante` contra el campo — mismo
gate D8 usado en `rediseno-boleta-votacion`.

## PR 1 — Backend: período lectivo en el comprobante (base = feature branch actual)

### Phase 1: `construirComprobante()` puebla `periodo_lectivo` — RED (D2)
- [x] 1.1 RED unit (`votos.service.spec.ts`): existe un `AnioEscolar` con `activo = true` y
      `nombre = "2026"` → `ComprobanteDto.periodo_lectivo === "2026"` [spec vote-casting: Existe un
      `AnioEscolar` activo]
- [x] 1.2 RED unit: `anioEscolar.findFirst` se invoca con `where: { activo: true }`,
      `orderBy: { nombre: 'desc' }`, `select: { nombre: true }` — verificado con
      `toHaveBeenCalledWith` [design.md D2, determinismo sin índice único parcial]
- [x] 1.3 RED unit: ningún `AnioEscolar` activo (`findFirst` → `null`) → `periodo_lectivo` es
      `undefined` y el resto del DTO sale íntegro (`codigo_comprobante`, `hora_servidor`,
      `eleccion_resumen` presentes) [spec vote-casting: Ningún `AnioEscolar` activo no rompe el
      comprobante]
- [x] 1.4 RED unit: la lectura de `anioEscolar` NO se une con `Voto` ni `DerechoVoto` — el mock de
      `anioEscolar.findFirst` no recibe ningún filtro derivado del voto [spec vote-casting: MUST NOT
      unir esta lectura con `Voto` ni `DerechoVoto`]

### Phase 2: GREEN
- [x] 2.1 GREEN: agregar `periodo_lectivo?: string` a `apps/backend/src/votos/dto/comprobante.dto.ts`
      con `@ApiPropertyOptional({ type: String })` (mismo idioma explícito de `type` que el resto del
      DTO, por el incidente de circular dependency de `@nestjs/swagger` ya documentado en
      `papeleta.dto.ts`) [design.md D2]
- [x] 2.2 GREEN: agregar la 4ª lectura al `Promise.all` existente de
      `VotosService.construirComprobante()` y `periodo_lectivo: anioActivo?.nombre` al objeto de
      retorno — pasa 1.1-1.4

### Phase 3: Camino de relectura autenticada hereda el campo — RED/GREEN (D2)
- [x] 3.1 RED unit (`comprobante.service.spec.ts`): el DTO devuelto por `ComprobanteService.obtener()`
      incluye `periodo_lectivo` cuando hay un `AnioEscolar` activo, sin lógica propia nueva en el
      servicio — prueba la delegación en `construirComprobante()` [spec vote-casting: Existe un
      `AnioEscolar` activo; design.md D2 "el punto es que `comprobante.service.ts` no se modifica"]
- [x] 3.2 GREEN: confirmar (sin tocar `comprobante.service.ts`) que 3.1 pasa por herencia de 2.2 —
      si falla, la causa es que `obtener()` dejó de delegar en `construirComprobante()`, no que falte
      código nuevo

### Phase 4: Regresión y contrato PR1
- [x] 4.1 `pnpm --filter @seei/backend test -- votos.service comprobante.service` verde
- [x] 4.2 `pnpm --filter @seei/backend test -- votos.service` — 19 tests de `emitir()`/idempotencia/
      `UNIQUE`/derecho al voto sin modificar [proposal.md Success Criteria: "Ningún cambio en
      `VotosService.emitir()`..."]
- [x] 4.3 `pnpm openapi:extract`: `periodo_lectivo` queda documentado como opcional en
      `packages/contracts/src/generated/api.ts` [design.md "Migración/Despliegue", ADR-0004]
- [x] 4.4 `pnpm typecheck` verde para los archivos tocados por PR1
- [x] 4.5 `rg -i "san alfonso" apps/backend/src/votos` sin resultados

## PR 2 — Paso 1 completo (base = PR 1 branch)

### Phase 5: Íconos de reglas — RED/GREEN (D5)
- [x] 5.1 RED componente (`iconos-reglas.spec.tsx` o cobertura dentro de `PasoInformacionProceso.spec.tsx`):
      `IconoVotoSecreto`, `IconoUnaSolaVez`, `IconoIrreversible` renderizan `svg` con `aria-hidden`,
      mismo `baseProps` (`viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`) que
      `app/iconos-menu.tsx` [design.md D5]
- [x] 5.2 GREEN: crear `apps/frontend/src/votos/piezas/iconos-reglas.tsx` con los 5 íconos
      (`IconoVotoSecreto`, `IconoUnaSolaVez`, `IconoIrreversible`, `IconoInformacion`,
      `IconoProhibido`) — pasa 5.1

### Phase 6: `PasoInformacionProceso` — RED (D4/D8)
- [x] 6.1 RED componente: badge de estado del proceso visible junto al hero
      [spec vote-casting: Paso 1 muestra badge, hero con texto superpuesto, reglas con ícono y
      footer]
- [x] 6.2 RED componente: imagen hero grande con texto superpuesto obtenida de
      `GET /configuracion/logo`, con degradado `bg-gradient-to-t from-primary/90 via-primary/30
      to-transparent` sobre la imagen [spec vote-casting: idem; design.md D4]
- [x] 6.3 RED componente: exactamente 3 tarjetas de reglas, cada una con su ícono de
      `iconos-reglas.tsx` [spec vote-casting: idem]
- [x] 6.4 RED componente: footer presente [spec vote-casting: idem]
- [x] 6.5 RED componente: `GET /configuracion/logo` responde `404` (`fireEvent.error` en el `<img>`)
      → el hero NO desaparece, se pinta `bg-primary` sólido detrás del degradado, el texto
      institucional sigue visible y "Comenzar Votación" permanece funcional [spec vote-casting: Sin
      logo institucional configurado, el paso 1 no rompe; design.md D4, cambio respecto de #31 que
      ocultaba el bloque]
- [x] 6.6 RED componente: ningún texto/copy nuevo menciona "San Alfonso" (grep manual, ver Phase 21)

### Phase 7: GREEN
- [x] 7.1 GREEN: reescribir `apps/frontend/src/votos/piezas/PasoInformacionProceso.tsx` con badge,
      hero con overlay (D4), tarjetas de reglas con ícono (D5), footer, tokens de D8 — pasa 6.1-6.5

### Phase 8: Regresión PR2
- [x] 8.1 `pnpm --filter @seei/frontend test -- PasoInformacionProceso` verde
- [x] 8.2 `pnpm typecheck` verde en `@seei/frontend`
- [x] 8.3 `rg -i "san alfonso" apps/frontend/src/votos/piezas/PasoInformacionProceso.tsx apps/frontend/src/votos/piezas/iconos-reglas.tsx` sin resultados

## PR 3 — `BotonSeleccion` + banner + `TarjetaVotoBlanco` (base = PR 2 branch) — PR de riesgo

### Phase 9: `BotonSeleccion` — RED (D1, contrato ARIA único)
- [x] 9.1 RED componente (`BotonSeleccion.spec.tsx`, nuevo): renderiza `<label>` conteniendo
      `<input type="radio" name="eleccion" className="sr-only">`, con `getByRole('radio')` sin
      wrapper adicional [design.md D1, Interfaces/Contratos]
- [x] 9.2 RED componente: `aria-label` del radio es `` `${texto}: ${etiqueta}` `` cuando `etiqueta`
      está definida (WCAG 2.5.3, *Label in Name*) — `getByRole('radio', { name: 'Seleccionar Lista:
      Lista A' })` [design.md D1, tabla de variantes; spec vote-casting: Modelo de interacción
      foto+cinta+doble botón]
- [x] 9.3 RED componente: `aria-label` es solo `texto` cuando `etiqueta` se omite (caso voto en
      blanco, ya único sin sufijo) [design.md D1, fila `TarjetaVotoBlanco`]
- [x] 9.4 RED componente: `fireEvent.click`/`Space`/`Enter` en el radio dispara `onSeleccionar` una
      única vez [spec vote-casting: El botón sólido dispara la selección igual que antes el click en
      la tarjeta]
- [x] 9.5 RED componente: `checked={seleccionada}` refleja la prop, y el texto visible cambia a
      "Seleccionado" cuando `seleccionada = true` [design.md, render de `BotonSeleccion`]
- [x] 9.6 RED componente: el anillo de foco se pinta con `has-[:focus-visible]:outline-2` (no
      `focus-within`, que también dispara con click de mouse) [design.md D1, "Foco visible"]

### Phase 10: GREEN `BotonSeleccion`
- [x] 10.1 GREEN: crear `apps/frontend/src/votos/piezas/BotonSeleccion.tsx` — pasa 9.1-9.6

### Phase 11: `BannerInstrucciones` — RED/GREEN (D6)
- [x] 11.1 RED componente (`BannerInstrucciones.spec.tsx`, nuevo): caja
      `rounded-card bg-primary p-4 text-on-primary` con `IconoInformacion`, título "Instrucciones de
      Votación" y párrafo de reglas, sin `role="alert"`/`role="status"` (contenido estático, no live
      region) [design.md D6]
- [x] 11.2 GREEN: crear `apps/frontend/src/votos/piezas/BannerInstrucciones.tsx` (sin props) — pasa
      11.1

### Phase 12: `TarjetaVotoBlanco` reescrita — RED (validación end-to-end de `BotonSeleccion`)
- [x] 12.1 RED componente (`TarjetaVotoBlanco.spec.tsx` reescrito): ícono circular distintivo +
      `BotonSeleccion` con texto "Votar en Blanco" [spec vote-casting: `TarjetaVotoBlanco` con ícono
      circular y botón dedicado]
- [x] 12.2 RED componente: el radio interno participa del mismo `radiogroup`/`name="eleccion"` que
      las demás tarjetas — `getByRole('radio', { name: 'Votar en Blanco' })` [spec vote-casting:
      idem; design.md D1, tabla de variantes]
- [x] 12.3 RED componente: nunca aparece marcada como seleccionada al montar (sin estado inicial
      implícito) [spec vote-casting: Voto en Blanco presente en las 3 variantes, nunca
      preseleccionado — invariante D14 de #14 preservada]
- [x] 12.4 RED componente (`PasoBoleta.spec.tsx:105`, `TarjetaVotoBlanco.spec.tsx:12,18,23`):
      ediciones puntuales `/voto en blanco/i` → `/votar en blanco/i` sobre el nombre accesible del
      botón; el título visible "Voto en Blanco" de la tarjeta permanece intacto (`getByText` no
      cambia) [design.md D1, "Ediciones de test que esto obliga"]

### Phase 13: GREEN `TarjetaVotoBlanco`
- [x] 13.1 GREEN: reescribir `apps/frontend/src/votos/piezas/TarjetaVotoBlanco.tsx` con ícono
      circular (`bg-surface-container text-on-surface-variant rounded-card h-16 w-16`, D8) +
      `BotonSeleccion` — pasa 12.1-12.4

### Phase 14: `PasoBoleta` — banner + grilla + radiogroup — RED/GREEN
- [x] 14.1 RED componente (`PasoBoleta.spec.tsx`): monta `BannerInstrucciones` entre el título y el
      `role="radiogroup"`, sin bloquear la interacción con tarjetas ni con "Continuar"
      [spec vote-casting: El banner se muestra al entrar al paso 2]
- [x] 14.2 RED componente: `role="radiogroup" aria-label="Opciones de la boleta"` se preserva en el
      contenedor de la grilla [design.md, "Semántica ARIA preservada"; spec vote-casting: `PasoBoleta`
      conserva `role="radiogroup"`]
- [x] 14.3 RED componente (`VotacionPage.spec.tsx:84`, `PasoBoleta.spec.tsx:139`): edición de test
      `{ name: 'Lista A' }` → `{ name: /lista a/i }` por el nuevo nombre accesible con sufijo
      [design.md D1, "Ediciones de test que esto obliga"]
- [x] 14.4 RED componente: grilla pasa a `grid gap-4 md:grid-cols-3` (antes `space-y-3`)
      [design.md D8, tabla de tokens]
- [x] 14.5 GREEN: modificar `apps/frontend/src/votos/piezas/PasoBoleta.tsx` — monta el banner, ajusta
      la grilla — pasa 14.1-14.4

### Phase 15: Regresión de accesibilidad — verbatim
- [x] 15.1 `TarjetaLista.spec.tsx:57-74` ("Ver Propuesta Completa" es hermano del `<label>` y no marca
      el radio) pasa **sin modificación** — no aplica todavía en PR3 (la tarjeta se reescribe en PR4),
      pero queda como criterio de aceptación explícito para esa PR [design.md D1, "regresión clave"]
- [x] 15.2 `PasoBoleta.spec.tsx:109-122` (`role="radiogroup" aria-label="Opciones de la boleta"`) se
      conserva sin cambios de fondo, solo la edición puntual de 14.3

### Phase 16: Regresión y contrato PR3
- [x] 16.1 `pnpm --filter @seei/frontend test -- BotonSeleccion BannerInstrucciones TarjetaVotoBlanco PasoBoleta` verde
- [x] 16.2 `pnpm --filter @seei/frontend test -- VotacionPage` verde con la edición puntual de 14.3
- [x] 16.3 `pnpm typecheck` verde en `@seei/frontend`
- [x] 16.4 `rg -i "san alfonso" apps/frontend/src/votos/piezas/BotonSeleccion.tsx apps/frontend/src/votos/piezas/BannerInstrucciones.tsx apps/frontend/src/votos/piezas/TarjetaVotoBlanco.tsx apps/frontend/src/votos/piezas/PasoBoleta.tsx` sin resultados

## PR 4 — Adopción del patrón en `TarjetaLista`/`TarjetaCandidato`/`TarjetaOpcion` (base = PR 3 branch)

### Phase 17: `TarjetaLista` reescrita — RED (D1/D8)
- [x] 17.1 RED componente (`TarjetaLista.spec.tsx` reescrito): foto arriba, cinta "Lista N°" absoluta
      sobre la foto, símbolo, lema, propuesta corta, botón outline "Ver Propuesta Completa" condicionado
      a `plan_trabajo_presente`, `BotonSeleccion` con texto "Seleccionar Lista" [spec vote-casting:
      Proceso `municipio` renderiza tarjetas de Lista con cinta y doble botón]
- [x] 17.2 RED componente (`TarjetaLista.spec.tsx:88-94` conservado verbatim): `name="eleccion"`,
      clase `sr-only`, dentro de un `<label>` — pasa sin modificación de fondo [design.md D1,
      "pasan sin modificación"]
- [x] 17.3 RED componente (`TarjetaLista.spec.tsx:57-74` conservado verbatim): "Ver Propuesta
      Completa" hermano del `<label>`, no marca el radio [design.md D1, "regresión clave"]
- [x] 17.4 RED componente (`TarjetaLista.spec.tsx:76-86` conservado): indicador `✓` y
      `border-2 border-primary` de estado seleccionado se conservan, reubicado junto a la cinta
      [design.md D1, "el `✓` se reubica junto a la cinta/badge"]
- [x] 17.5 RED componente: nombre accesible del radio es
      `` `Seleccionar Lista: ${opcion.etiqueta}` `` [design.md D1, tabla de variantes]

### Phase 18: GREEN `TarjetaLista`
- [x] 18.1 GREEN: reescribir `apps/frontend/src/votos/piezas/TarjetaLista.tsx` consumiendo
      `BotonSeleccion` de PR3 — pasa 17.1-17.5

### Phase 19: `TarjetaCandidato` reescrita — RED/GREEN
- [x] 19.1 RED componente (`TarjetaCandidato.spec.tsx` reescrito): foto, cinta con cargo, nombres,
      sin botón de propuesta, `BotonSeleccion` con texto "Seleccionar Candidato"
      [spec vote-casting: Proceso `representante_aula`/`padres` renderiza tarjetas de Candidato]
- [x] 19.2 RED componente (`TarjetaCandidato.spec.tsx:34` conservado): aserción de `<label>`/radio
      pasa sin modificación [design.md D1]
- [x] 19.3 RED componente: nombre accesible es `` `Seleccionar Candidato: ${etiqueta}` ``
      [design.md D1, tabla de variantes]
- [x] 19.4 GREEN: reescribir `apps/frontend/src/votos/piezas/TarjetaCandidato.tsx` — pasa 19.1-19.3

### Phase 20: `TarjetaOpcion` reescrita — RED/GREEN
- [x] 20.1 RED componente (`TarjetaOpcion.spec.tsx` reescrito): sin foto, cinta de etiqueta y
      descripción, `BotonSeleccion` con texto "Seleccionar esta Opción" [spec vote-casting: Proceso
      `consulta` renderiza tarjetas de Opción simple]
- [x] 20.2 RED componente (`TarjetaOpcion.spec.tsx:25` conservado): aserción de radio pasa sin
      modificación [design.md D1]
- [x] 20.3 RED componente: nombre accesible es `` `Seleccionar esta Opción: ${etiqueta}` ``
      [design.md D1, tabla de variantes]
- [x] 20.4 GREEN: reescribir `apps/frontend/src/votos/piezas/TarjetaOpcion.tsx` — pasa 20.1-20.3

### Phase 21: Regresión de accesibilidad final del Paso 2
- [x] 21.1 RED/GREEN integración (`PasoBoleta.spec.tsx`): navegación por flecha derecha/abajo mueve
      el foco al `BotonSeleccion` de la siguiente tarjeta del `radiogroup`, "Ver Propuesta Completa"
      nunca recibe foco por esa navegación [spec vote-casting: "Ver Propuesta Completa" no interfiere
      con la navegación de flechas del grupo]
- [x] 21.2 `VotacionPage.spec.tsx:127` (`{ name: /blanco/i }`) sigue matcheando sin cambios
      [design.md D1, "no se toca"]

### Phase 22: Regresión y contrato PR4
- [x] 22.1 `pnpm --filter @seei/frontend test -- TarjetaLista TarjetaCandidato TarjetaOpcion PasoBoleta VotacionPage` verde
- [x] 22.2 `pnpm typecheck` verde en `@seei/frontend`
- [x] 22.3 `rg -i "san alfonso" apps/frontend/src/votos/piezas/Tarjeta{Lista,Candidato,Opcion}.tsx` sin resultados

## PR 5 — Paso 3: período lectivo, sincronizado, cerrar sesión (base = PR 4 branch, depende de PR1)

### Phase 23: `PanelComprobante` — período lectivo — RED (D2/D7)
- [ ] 23.1 RED componente (`PanelComprobante.spec.tsx`): con `periodo_lectivo = "2026"` en el DTO,
      se muestra la fila "Período Lectivo" con ese valor, sin afectar el resto del comprobante
      [spec comprobante-autenticado: "Período Lectivo" se muestra cuando el DTO lo trae]
- [ ] 23.2 RED componente: sin `periodo_lectivo` (`undefined`), la fila no se renderiza y el resto
      del comprobante se muestra completo [spec comprobante-autenticado: Sin `periodo_lectivo`, el
      comprobante no rompe]

### Phase 24: `PanelComprobante` — indicador estático — RED (D3)
- [ ] 24.1 RED componente: "Estado del Sistema: Sincronizado" se muestra igual en cualquier estado
      (con/sin `periodo_lectivo`, recién emitido o reintento con `yaRegistrado`), sin condicionarse a
      ningún dato [spec comprobante-autenticado: "Estado del Sistema: Sincronizado" siempre estático]
- [ ] 24.2 RED componente: el punto de color va `aria-hidden="true"`, el par etiqueta/valor se lee
      normalmente [design.md D3]

### Phase 25: `PanelComprobante` — botón "Cerrar Sesión" — RED (D7)
- [ ] 25.1 RED componente: botón "Cerrar Sesión" aparece junto a "Volver al Inicio" e invoca la prop
      `onCerrarSesion` al hacer click [spec comprobante-autenticado: "Cerrar Sesión" disponible en el
      camino post-voto]
- [ ] 25.2 RED componente: `onVolverAlInicio`/`onCerrarSesion` son props obligatorias — `PanelComprobante`
      no llama `useSesion()`/`navegar()` internamente (sigue presentacional puro) [design.md D7]
- [ ] 25.3 RED componente: el badge `yaRegistrado` existente no se rompe con las props nuevas
      [spec comprobante-autenticado: "Cerrar Sesión" disponible en la relectura autenticada, sin
      romper `yaRegistrado`]

### Phase 26: GREEN `PanelComprobante`
- [ ] 26.1 GREEN: modificar `apps/frontend/src/votos/piezas/PanelComprobante.tsx` — período lectivo
      condicional (D2), indicador estático (D3), botón "Cerrar Sesión" vía prop (D7) — pasa 23.1-25.3

### Phase 27: Wiring `VotacionPage`/`ComprobantePage` — RED/GREEN
- [ ] 27.1 RED integración (`VotacionPage.spec.tsx`): `PanelComprobante` recibe
      `onVolverAlInicio={() => navegar({ nombre: 'inicio' })}` y `onCerrarSesion={logout}` de
      `useSesion()` [design.md D7, "call sites"]
- [ ] 27.2 RED integración (`ComprobantePage.spec.tsx`): mismo wiring, badge `yaRegistrado` intacto
      [proposal.md Success Criteria: "`ComprobantePage` sigue funcionando en ambos caminos"]
- [ ] 27.3 GREEN: modificar `apps/frontend/src/votos/VotacionPage.tsx` y
      `apps/frontend/src/votos/ComprobantePage.tsx` (agrega `useSesion()` en este último) — pasa
      27.1-27.2

### Phase 28: Regresión y contrato PR5
- [ ] 28.1 `pnpm --filter @seei/frontend test -- PanelComprobante VotacionPage ComprobantePage` verde
- [ ] 28.2 `pnpm typecheck` verde en `@seei/frontend`
- [ ] 28.3 `rg -i "san alfonso" apps/frontend/src/votos/piezas/PanelComprobante.tsx` sin resultados

## Phase 29: Checklist final de branding y regresión completa del change

- [ ] 29.1 `rg -i "san alfonso" apps/` sin resultados sobre todo el árbol de `apps/`
      [proposal.md Out of Scope: "el nombre 'San Alfonso'... no debe filtrarse a ningún componente ni
      copy"]
- [ ] 29.2 `pnpm --filter @seei/backend test` verde — incluidos los 19 tests de
      `VotosService.emitir()` sin modificar [proposal.md Success Criteria]
- [ ] 29.3 `pnpm --filter @seei/frontend test` verde — suite completa, incluidos todos los specs
      reescritos/actualizados de PR2-PR5
- [ ] 29.4 `pnpm typecheck` verde en los 4 paquetes
- [ ] 29.5 Confirmar visualmente (o con specs de snapshot si existieran) que el Paso 1, Paso 2 y
      Paso 3 se acercan al patrón de las 3 capturas de referencia (`paso01.jpg`, `paso02.jpg`,
      `paso03.jpg`) dentro del `AppShell`/sidebar existente, sin reproducir la navegación de
      header+tabs (desviación aceptada, proposal.md Scope/Risks)
- [ ] 29.6 Confirmar que `AppShell.tsx`, `NavegacionPrincipal.tsx` y `menu-por-rol.ts` no fueron
      tocados por ninguna PR de este change (`git diff` acumulado del change contra esos 3 archivos
      vacío) [proposal.md Out of Scope]
