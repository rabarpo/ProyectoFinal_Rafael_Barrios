# Exploración: fidelidad-visual-boleta-votacion

## Estado actual

El backlog #31 (`rediseno-boleta-votacion`) se implementó en 4 PRs y ya está archivado
(`openspec/changes/archive/2026-08-24-rediseno-boleta-votacion/`). Se construyó a partir de la
descripción textual de `design.md`, sin comparar nunca contra las 3 capturas de referencia reales
del usuario (`paso01.jpg`, `paso02.jpg`, `paso03.jpg`, fuera del repo en `C:\Rafael\CLAUDE CODE\`).
Al compararlo recién ahora, el parecido visual es bajo.

## Hallazgo arquitectónico no anticipado

`VotacionPage`/`ComprobantePage` se montan vía `Enrutador` dentro de `AuthGuard > AppShell`
(`apps/frontend/src/app/App.tsx` — solo `RUTAS_SIN_SHELL = ['proyeccion']` se salta el shell).
`AppShell` renderiza un header superior `bg-primary` ("Rol: X" + "Cerrar sesión") más un sidebar
izquierdo colapsable `NavegacionPrincipal`, dirigido por `MENU_POR_ROL[rol]`. Los votantes
(`estudiante`/`docente`) usan el mismo `RolSesion` y el mismo shell que el staff. Ese sidebar fue
un rediseño explícito y reciente, ya aprobado por el usuario (#25 `menu-navegacion-post-login`),
que reemplazó un header horizontal anterior. Las capturas de referencia muestran un paradigma de
navegación completamente distinto (header superior + tabs, sin sidebar) — reproducirlo literal
significa revertir #25 para este flujo puntual.

## Tokens del sistema de diseño ya reutilizables

`DESIGN-SYSTEM.md` confirma: `bg-primary` #000066, `bg-secondary` #b41d11 (rojo, uso moderado),
`tertiary-fixed` (teal/éxito), `rounded-card`, `shadow-elevation`, `border-border-gray`, la escala
tipográfica completa, y el ya implementado "Voting Progress Indicator" (`BarraProgresoVotacion`),
que ya se parece bastante a las barras de la referencia — riesgo bajo, se reusa tal cual.

## Áreas afectadas

- `apps/frontend/src/votos/piezas/PasoInformacionProceso.tsx` — falta badge, imagen hero con texto
  superpuesto, tarjetas de reglas con ícono; hoy solo hay un logo chico centrado.
- `apps/frontend/src/votos/piezas/PasoBoleta.tsx` — falta el banner de instrucciones (caja azul
  oscura).
- `apps/frontend/src/votos/piezas/TarjetaLista.tsx`, `TarjetaCandidato.tsx`, `TarjetaOpcion.tsx` —
  las 3 usan el patrón "toda la tarjeta es el `<label>` del radio"; la referencia muestra foto
  grande arriba + cinta "Lista N°" + botón "Ver Propuesta Completa" (outline) + botón sólido
  "Seleccionar Candidato" separado — un modelo de interacción distinto (botón explícito, no click
  implícito en la tarjeta), con implicancias de accesibilidad.
- `apps/frontend/src/votos/piezas/TarjetaVotoBlanco.tsx` — necesita ícono circular + botón
  dedicado "Votar en Blanco" en vez de la fila con borde punteado actual.
- `apps/frontend/src/votos/piezas/PanelComprobante.tsx` — `design.md` (del change #31) excluyó
  explícitamente "Período Lectivo"/"Estado del Sistema: Sincronizado" por "sin respaldo real en
  `ComprobanteDto`", pero tanto la referencia como el alcance original de #31 ("comprobante con
  hash/fecha/periodo lectivo") sí los piden — contradicción real de spec, requiere revisar el DTO
  del backend, no es solo un ajuste de estilo. También falta el botón "Cerrar Sesión" junto a
  "Volver al Inicio".
- `apps/frontend/src/votos/ComprobantePage.tsx` — reusa `PanelComprobante` sin cambios; cualquier
  reescritura debe preservar tanto el camino post-voto como el de relectura autenticada
  (`comprobante-autenticado`), incluido el badge `yaRegistrado`.
- `apps/frontend/src/app/AppShell.tsx`, `NavegacionPrincipal.tsx`, `menu-por-rol.ts` — el conflicto
  sidebar-vs-top-nav descrito arriba; la decisión abierta más grande para la propuesta.

## Enfoques considerados

1. **Reescritura completa incluyendo top-nav nueva que reemplace el sidebar en las rutas de
   votación/comprobante.** Máxima fidelidad, resuelve la contradicción de los campos del
   comprobante, pero revierte la decisión de #25 para un solo flujo, blast radius mayor
   (`PanelComprobante` compartido), probablemente necesita un cambio de DTO en el backend, y
   probablemente excede el presupuesto de 400 líneas por PR (necesitaría encadenar más PRs).
   Esfuerzo: Alto.
2. **Fidelidad incremental dentro del `AppShell`/sidebar existente** — reescribir los 4
   componentes de tarjeta (foto arriba + cinta + doble botón), agregar badge/hero/íconos al Paso
   1, banner al Paso 2, corregir campos/botones del comprobante en el Paso 3 — todo independiente
   de la navegación, sin regresión arquitectónica, diff más chico y revisable. Deja el
   desajuste de navegación como una desviación aceptada. Esfuerzo: Medio. **Recomendado.**
3. **Mantener el sidebar, agregar una fila de tabs secundaria dentro de `VotacionPage`.** Fidelidad
   parcial de navegación, pero los tabs de la referencia (Candidatos/Padrones/Resultados) no
   mapean a rutas reales accesibles para el votante hoy → probablemente UI muerta. No vale la pena
   construirla.

## Recomendación

Enfoque 2, con el trade-off sidebar-vs-top-nav explícitamente puesto a decisión del usuario
antes/en la propuesta, y una verificación del backend (`ComprobanteDto` — ¿ya trae período
lectivo/estado de sincronización?) antes de definir el alcance de los campos del Paso 3 como
puramente presentacionales.

## Riesgos

- El `ComprobanteDto` del backend puede no traer período lectivo/estado de sincronización — eso
  arrastraría un cambio de contrato de backend, no solo de estilo de frontend.
- `PanelComprobante` es compartido entre dos flujos; la reescritura no debe romper el camino de
  relectura autenticada.
- La reescritura de las tarjetas cambia el modelo de interacción ARIA del radiogroup (click
  implícito en el label → botón explícito) — necesita re-verificación de accesibilidad y reescribir
  tests (`TarjetaCandidato.spec.tsx`, `TarjetaOpcion.spec.tsx`, `PasoBoleta.spec.tsx`).
- El branding "San Alfonso" de las capturas no debe filtrarse a la implementación — debe seguir
  parametrizado (`urlLogo()`) / genérico SEEI.
- La decisión de arquitectura de navegación (sidebar vs. top-nav de la referencia) es real, no
  cosmética — debería ser una decisión explícita del usuario, no elegida en silencio.
- El enfoque 1 probablemente excede el presupuesto de 400 líneas por PR y necesita PRs encadenados.

## Lista para propuesta

Sí — con una decisión explícita pendiente antes/en la propuesta (sidebar vs. top-nav a medida para
votación) y una verificación pendiente (si `ComprobanteDto` ya soporta período lectivo/estado del
sistema).
