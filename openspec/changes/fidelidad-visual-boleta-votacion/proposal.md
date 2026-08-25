# Proposal: Fidelidad visual de la boleta de votación contra las capturas de referencia

## Intent

El backlog #31 (`rediseno-boleta-votacion`) ya se implementó y archivó en 4 PRs, pero se construyó
a partir de la descripción textual de `design.md` sin comparar nunca contra las 3 capturas de
referencia reales del usuario (`paso01.jpg`, `paso02.jpg`, `paso03.jpg`). Al compararlo recién
ahora, el parecido visual es bajo: falta jerarquía visual en el Paso 1 (badge/hero/reglas con
ícono), falta el banner de instrucciones del Paso 2, las tarjetas de opción no siguen el patrón
"foto grande + cinta + doble botón" de la referencia, y el comprobante del Paso 3 omite dos campos
que la referencia sí muestra. El objetivo de este change es cerrar esa brecha de fidelidad visual
dentro del `AppShell`/sidebar ya aprobado (#25), sin tocar ninguna regla de negocio de emisión de
voto.

## Scope

### In Scope

- **Paso 1** (`PasoInformacionProceso.tsx`): badge de estado del proceso, imagen hero grande con
  texto superpuesto (reemplaza el logo chico centrado actual), tarjetas de reglas con ícono, footer.
- **Paso 2** (`PasoBoleta.tsx` + `TarjetaLista.tsx`/`TarjetaCandidato.tsx`/`TarjetaOpcion.tsx`/
  `TarjetaVotoBlanco.tsx`): banner de instrucciones (caja azul oscura); reescritura de las 4
  tarjetas al modelo "foto grande arriba + cinta de lista/badge + botón outline 'Ver Propuesta
  Completa' + botón sólido explícito de selección", reemplazando el patrón actual de
  tarjeta-como-`<label>`-de-radio completo. Este cambio de modelo de interacción (click implícito
  en el label → botón explícito) debe preservar la semántica ARIA de `radiogroup`/`radio` — el
  botón de selección pasa a disparar el mismo cambio de estado que hoy dispara el click en la
  tarjeta, sin que "Ver Propuesta Completa" interfiera con la navegación por teclado del grupo.
  `TarjetaVotoBlanco` pasa de fila con borde punteado a tarjeta con ícono circular + botón dedicado
  "Votar en Blanco".
- **Paso 3** (`PanelComprobante.tsx`): agregar "Período Lectivo" (nombre del `AnioEscolar` activo,
  ver Approach) y un indicador estático "Estado del Sistema: Sincronizado" (decorativo, sin fuente
  de verdad dinámica real — ver Riesgos); agregar botón "Cerrar Sesión" junto a "Volver al Inicio".
- **Backend**: agregar `periodo_lectivo` a `ComprobanteDto`, poblado por `VotosService`/
  `ComprobanteService` a partir del `AnioEscolar` con `activo = true` (campo ya existente en el
  schema, sin relación con el ciclo de vida del voto ni con `Voto`/`DerechoVoto`).
- Actualización de tests existentes afectados por el cambio de modelo de interacción y de DTO
  (`TarjetaCandidato.spec.tsx`, `TarjetaOpcion.spec.tsx`, `TarjetaLista.spec.tsx`,
  `TarjetaVotoBlanco.spec.tsx`, `PasoBoleta.spec.tsx`, `PasoInformacionProceso.spec.tsx`,
  `PanelComprobante.spec.tsx`, `comprobante.service.spec.ts`, `votos.service.spec.ts`).

### Out of Scope

- Cualquier cambio a `AppShell.tsx`, `NavegacionPrincipal.tsx` o `menu-por-rol.ts` — el sidebar
  colapsable ya aprobado en #25 se mantiene tal cual para el flujo de votación/comprobante. La
  navegación de header+tabs de las capturas de referencia NO se reproduce; queda documentada como
  desviación aceptada (ver Riesgos).
- Cualquier cambio a `VotosService.emitir()`, idempotencia, restricción `UNIQUE` o validación del
  derecho al voto (backlog #14, cerrado e intocable). El campo `periodo_lectivo` es puramente
  aditivo y de solo lectura; no participa en ninguna validación de emisión.
- "Estado del Sistema: Sincronizado" como indicador dinámico real (requeriría un mecanismo de
  sincronización/offline que no existe en el dominio hoy) — queda como elemento estático/decorativo,
  a definir el criterio exacto en `sdd-design`.
- Rediseño de `PantallaRechazo` (vía de rechazo, fuera de los 3 pasos normales).
- Cambios al modelo de datos (`schema.prisma`) — `AnioEscolar.activo` ya existe.
- Branding: seguir usando exclusivamente tokens/paleta SEEI genéricos; el nombre "San Alfonso" del
  front-matter de `DESIGN-SYSTEM.md` no debe filtrarse a ningún componente ni copy (ya era un riesgo
  vigilado en #31, se mantiene la misma guardia).

## Capabilities

### Modified Capabilities

- `vote-casting`: `ComprobanteDto` gana el campo opcional `periodo_lectivo`; `PasoInformacionProceso`,
  `PasoBoleta` y las 4 tarjetas del Paso 2 cambian de layout visual y, en el caso de las tarjetas,
  de modelo de interacción (botón explícito de selección en vez de click en toda la tarjeta).
- `comprobante-autenticado`: `PanelComprobante` (reusado por `ComprobantePage` en ambos caminos —
  post-voto y relectura autenticada) agrega período lectivo, indicador de sincronización estático y
  botón "Cerrar Sesión", sin romper el badge `yaRegistrado` existente.

## Approach

1. **Backend — período lectivo**: agregar `periodo_lectivo?: string` a `ComprobanteDto`
   (`apps/backend/src/votos/dto/comprobante.dto.ts`). `VotosService.construirComprobante()` y
   `ComprobanteService.obtener()` lo pueblan con el `nombre` del `AnioEscolar` que tenga
   `activo = true` (lectura simple, sin join con `Voto`/`DerechoVoto`/`ProcesoElectoral` — el campo
   no depende del voto en sí, depende del año escolar vigente al momento de consultar). Si no hay
   ningún `AnioEscolar` activo (estado de configuración inconsistente, no debería ocurrir en
   operación normal), el campo se omite (`undefined`) en vez de fallar la respuesta del comprobante.
2. **Backend — estado de sincronización**: no se agrega ningún campo nuevo al DTO para esto; se
   deja como responsabilidad exclusivamente presentacional del frontend (badge estático "Sincronizado"
   sin condicional de datos), documentado explícitamente en `design.md` como decisión de producto,
   no como omisión accidental.
3. **Frontend — Paso 1**: `PasoInformacionProceso` agrega badge de estado (reutiliza el mismo texto/
   color que ya usa el badge de estado de proceso en otras pantallas administrativas si existe un
   token compartido), imagen hero grande con texto superpuesto (reemplaza el logo actual — misma
   fuente `GET /configuracion/logo` ya usada, sin campo nuevo), tarjetas de reglas con ícono, footer.
4. **Frontend — Paso 2**: banner de instrucciones (caja azul oscura, estático) sobre la grilla de
   tarjetas. Reescritura de `TarjetaLista`/`TarjetaCandidato`/`TarjetaOpcion` al patrón "foto arriba +
   cinta + botón outline 'Ver Propuesta Completa' + botón sólido de selección". El `radiogroup` que
   hoy envuelve las tarjetas se mantiene; el botón sólido de selección asume el rol de `radio`
   (o dispara el mismo `onChange` que hoy dispara el click del `<label>`), y "Ver Propuesta Completa"
   quda fuera del elemento `radio` para no interferir con la navegación de flechas del grupo — la
   forma exacta (mover `role="radio"` al botón vs. mantenerlo en un contenedor y usar
   `aria-activedescendant`) se decide en `sdd-design` con criterio de accesibilidad, no de estilo.
   `TarjetaVotoBlanco` pasa a ícono circular + botón dedicado "Votar en Blanco".
5. **Frontend — Paso 3**: `PanelComprobante` agrega "Período Lectivo" (solo si `periodo_lectivo`
   viene definido en el DTO — renderizado condicional, igual criterio que el resto de campos
   opcionales del comprobante), indicador estático "Estado del Sistema: Sincronizado", y botón
   "Cerrar Sesión" junto a "Volver al Inicio" (mismo mecanismo de logout ya usado por `AppShell`).
6. **Branding**: repetir el checklist de #31 — grep de "San Alfonso" en componentes/copy nuevos
   antes de cerrar el change.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/src/votos/dto/comprobante.dto.ts` | Modified | Campo opcional `periodo_lectivo` |
| `apps/backend/src/votos/votos.service.ts` | Modified | `construirComprobante()` puebla `periodo_lectivo` desde `AnioEscolar.activo` |
| `apps/backend/src/votos/comprobante.service.ts` | Modified | Camino de relectura autenticada usa el mismo `construirComprobante()`, sin lógica propia nueva |
| `apps/backend/src/votos/votos.service.spec.ts` | Modified | Cobertura de `periodo_lectivo` presente/ausente |
| `apps/backend/src/votos/comprobante.service.spec.ts` | Modified | Cobertura del campo en el camino de relectura |
| `apps/frontend/src/votos/piezas/PasoInformacionProceso.tsx` | Modified | Badge, hero, tarjetas de reglas con ícono, footer |
| `apps/frontend/src/votos/piezas/PasoBoleta.tsx` | Modified | Banner de instrucciones |
| `apps/frontend/src/votos/piezas/TarjetaLista.tsx` | Modified | Patrón foto+cinta+doble botón |
| `apps/frontend/src/votos/piezas/TarjetaCandidato.tsx` | Modified | Patrón foto+cinta+doble botón |
| `apps/frontend/src/votos/piezas/TarjetaOpcion.tsx` | Modified | Patrón foto+cinta+doble botón |
| `apps/frontend/src/votos/piezas/TarjetaVotoBlanco.tsx` | Modified | Ícono circular + botón dedicado |
| `apps/frontend/src/votos/piezas/PanelComprobante.tsx` | Modified | Período lectivo, indicador estático, botón "Cerrar Sesión" |
| Specs de los componentes de arriba (`*.spec.tsx`) | Modified | Ajuste de roles/queries por el nuevo modelo de interacción y campos |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Cambio de modelo de interacción ARIA (click implícito en `<label>` → botón explícito) rompe la semántica de `radiogroup`/navegación por teclado | Medium | `sdd-design` fija explícitamente la forma exacta (`role="radio"` en el botón vs. `aria-activedescendant`) antes de tocar código; re-verificación de accesibilidad y reescritura de specs en la misma PR |
| Desajuste de navegación (sidebar actual vs. header+tabs de la referencia) queda como brecha visual permanente frente a las capturas | Alto (aceptado) | Decisión explícita ya tomada por el usuario: se mantiene #25 tal cual, documentado como desviación aceptada, no como pendiente |
| "Estado del Sistema: Sincronizado" sin fuente de verdad real puede leerse como informar un estado que no se verifica | Low | Documentado en `design.md` como indicador estático/decorativo, decisión de producto explícita, no un dato verificado |
| `AnioEscolar` sin ningún registro `activo = true` en el momento de construir el comprobante | Low | `periodo_lectivo` se omite (`undefined`), `PanelComprobante` lo renderiza condicionalmente — no rompe el resto del comprobante |
| `PanelComprobante` es compartido entre el camino post-voto y la relectura autenticada (`ComprobantePage`) | Medium | Ambos caminos pasan por `construirComprobante()`/`ComprobanteService.obtener()`, que se actualizan juntos; badge `yaRegistrado` existente se preserva sin cambios |
| Filtración del nombre "San Alfonso" a componentes o copy nuevos | Low | Checklist de revisión (grep) antes de cerrar el change, igual que en #31 |

## Rollback Plan

Todos los cambios son aditivos y retrocompatibles: `periodo_lectivo` es un campo opcional nuevo en
un DTO existente, sin cambios de schema ni de lógica de `emitir()`. Revertir es seguro con `git
revert` de los commits del change: los componentes anteriores (tarjetas como `<label>`, comprobante
sin período lectivo) vuelven a estar activos sin necesidad de migración de base de datos.

## Dependencies

- Depende del estado ya archivado de `rediseno-boleta-votacion` (2026-08-24), que este change
  corrige/completa, y transitivamente de `vote-casting` (#14) y `comprobante-autenticado` (#15).
- Ninguna dependencia externa nueva.

## Success Criteria

- [ ] Paso 1 muestra badge de estado, imagen hero con texto superpuesto, tarjetas de reglas con
      ícono y footer, sin el nombre "San Alfonso" en ningún componente o copy.
- [ ] Paso 2 muestra el banner de instrucciones y las 4 tarjetas siguen el patrón "foto + cinta +
      botón outline 'Ver Propuesta Completa' + botón sólido de selección", preservando la semántica
      de `radiogroup`/navegación por teclado verificada con tests de accesibilidad.
- [ ] Paso 3 muestra "Período Lectivo" (cuando `AnioEscolar.activo` existe), el indicador estático
      "Estado del Sistema: Sincronizado", y el botón "Cerrar Sesión" junto a "Volver al Inicio".
- [ ] `ComprobantePage` sigue funcionando en ambos caminos (post-voto y relectura autenticada), con
      el badge `yaRegistrado` intacto.
- [ ] Ningún cambio en `VotosService.emitir()`, idempotencia, `UNIQUE` o validación de derecho al
      voto; toda la suite existente de esas pruebas sigue pasando sin modificación.
- [ ] El sidebar/`AppShell` actual se mantiene sin cambios en rutas de votación/comprobante.

## Proposal question round

No se realizó una ronda de preguntas interactiva en esta fase: el usuario ya entregó, junto con el
encargo, las decisiones de producto explícitas que resuelven los puntos abiertos que había dejado
la exploración —

1. **Sidebar vs. top-nav**: se mantiene el sidebar actual (#25); no se construye la navegación de
   header+tabs de la referencia. Cerrado, no es una pregunta abierta.
2. **Contradicción del comprobante**: se confirmó que el DTO hoy solo tiene `codigo_comprobante` y
   `hora_servidor` — "Período Lectivo" se agrega con una fuente de verdad real ya existente
   (`AnioEscolar.activo`), sin tocar reglas de vote-casting. "Estado del Sistema: Sincronizado"
   queda como indicador estático/decorativo a falta de una fuente de verdad real — a confirmar el
   criterio exacto (¿se oculta si no hay forma de verificarlo, o se muestra siempre como adorno de
   confianza?) en `sdd-design`.

Un punto queda abierto para que el usuario lo revise antes o durante `sdd-design`, por no ser una
decisión puramente técnica sino de producto:

1. ¿"Estado del Sistema: Sincronizado" debe mostrarse siempre como elemento decorativo de
   confianza, o preferirías que el change agregue primero un mecanismo mínimo real (aunque sea un
   simple `ok: true` de conectividad) antes de mostrar la palabra "Sincronizado" al votante? La
   propuesta asume la primera opción (decorativo) para no ampliar el alcance de backend más allá de
   lo necesario — corregir si la asunción no es aceptable.
