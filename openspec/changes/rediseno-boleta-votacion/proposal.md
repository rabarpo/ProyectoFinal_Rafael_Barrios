# Proposal: Rediseño visual de la boleta de votación (3 pasos)

## Intent

El flujo de votación de 3 pasos (backlog #14) funciona pero es minimalista: sin foto de
candidato, sin tarjetas de lista con símbolo/lema/propuesta, sin barra de progreso, sin
comprobante con jerarquía visual. El backlog #31 pide adoptar el sistema de diseño SEEI
(paleta, tipografía, patrón "Candidate Cards" ya documentado en `DESIGN-SYSTEM.md`) en los 3
pasos, para que la experiencia de votar se sienta confiable y clara en el momento de mayor
tensión del flujo (emitir un voto irreversible). Este change es únicamente de datos de lectura
enriquecidos + presentación; no toca la lógica de emisión del voto.

## Scope

### In Scope
- **Paso 1** (`PasoInformacionProceso`): barra de progreso lineal "Paso 1 de 3" (componente
  nuevo, reutilizado en los 3 pasos), imagen de portada institucional (el logo ya configurado en
  Configuración General, #10 — sin campo nuevo en `ProcesoElectoral`), 3 tarjetas de reglas (voto
  secreto / una sola vez / irreversible), botón "Comenzar Votación".
- **Paso 2** (`PasoBoleta`): 3 variantes de tarjeta según `tipo` de proceso — lista (`municipio`,
  con foto del candidato cabeza de lista), candidato (`representante_aula`/`padres`), opción
  simple (`consulta`) — más tarjeta de "Voto en Blanco" siempre presente. Barra "% Completado",
  footer "Volver al paso anterior"/"Siguiente Paso".
- **Paso 3** (`PanelComprobante`): ícono de check, "¡Voto emitido correctamente!", badge
  condicional "Ya has votado", detalles reales (fecha/hora, código de comprobante, resumen de
  elección) — sin periodo lectivo ni estado de sincronización.
- **Backend**: `PapeletaOpcionDto` enriquecido por tipo (foto/cargo/lista/plan de trabajo según
  corresponda; para `municipio` incluye además `candidato_id`+foto del candidato cabeza de lista);
  dos endpoints nuevos de solo lectura bajo `/votos/...` para servir foto de candidato y plan de
  trabajo de lista, autorizados por pertenencia a la papeleta del `derechoVotoId` del votante
  autenticado.
- Actualización de tests existentes (`PasoBoleta.spec.tsx`, `VotacionPage.spec.tsx`,
  `papeleta.service.spec.ts`) para reflejar los DTOs enriquecidos.

### Out of Scope
- `VotosService.emitir()`, idempotencia, restricción `UNIQUE`, validación de derecho al voto
  (backlog #14, cerrado e intocable).
- Relajar `RolesGuard` de `/candidatos` o `/listas` existentes — se usan endpoints nuevos y
  distintos (datos ligados a un proceso/derecho de voto). Excepción puntual: `GET
  /configuracion/logo` sí se relaja a nivel de método (ver Affected Areas/Risks) por ser un dato
  institucional público sin relación con ningún voto — no es lo mismo que relajar el acceso a
  foto de candidato o plan de trabajo.
- "Periodo lectivo" y "estado de sincronización" en el comprobante — sin backing real en el
  dominio, se omiten (ver Riesgos).
- Renombrar o alterar `PantallaRechazo` (vía de rechazo, no forma parte de los 3 pasos normales).
- Cambios al modelo de datos (`schema.prisma`) — los campos ya existen en `Lista`/`Candidato`.

## Capabilities

### New Capabilities
- `acceso-archivos-boleta`: endpoints de solo lectura `GET
  /votos/papeleta/:derechoVotoId/opciones/:id/foto` y `GET
  /votos/papeleta/:derechoVotoId/opciones/:id/plan-trabajo`, autorizados por pertenencia (el
  `:id` debe ser una opción que aparece en la papeleta de ese `derechoVotoId`), con el mismo
  criterio D9/D13 de `PapeletaService`/`ComprobanteService` (403 idéntico para ajeno/inexistente).

### Modified Capabilities
- `vote-casting`: `PapeletaOpcionDto` gana campos por tipo de proceso (foto/cargo para
  candidato; símbolo/lema/propuesta/`plan_trabajo_presente` para lista); los 3 componentes
  presentacionales (`PasoInformacionProceso`, `PasoBoleta`, `PanelComprobante`) adoptan el nuevo
  layout visual y un componente de barra de progreso compartido.
- `comprobante-autenticado`: `PanelComprobante` (reusado por `ComprobantePage`) cambia de layout
  visual (ícono de check, badge "Ya has votado") sin agregar campos nuevos al `ComprobanteDto`.
- `configuracion-institucional`: `GET /configuracion/logo` pasa de `@Roles('administrador',
  'director')` a accesible por cualquier usuario autenticado (override a nivel de método); el
  resto del módulo (`GET/PUT /configuracion`, comité, etc.) no cambia.
- `sistema-diseno-visual`: se instancia el "Voting Progress Indicator" ya anticipado en
  `DESIGN-SYSTEM.md` como componente reutilizable concreto.

## Approach

1. **Backend — DTOs enriquecidos**: extender `PapeletaOpcionDto` con campos opcionales según
   `tipo` (unión discriminada o campos opcionales homogéneos, a definir en `sdd-design`).
   `PapeletaService.obtenerOpciones()` mapea `simbolo/lema/propuesta/plan_trabajo_presente` para
   `Lista`, `foto`(bool)/`cargo` para `Candidato`, y `descripcion` para `OpcionConsulta`.
   `plan_trabajo_presente` se deriva (`!== null`) sin exponer bytes, igual que
   `ListaRespuestaDto`.
2. **Backend — autorización de binarios**: nuevo `VotosArchivosController` (o método en
   `VotosController`) bajo `/votos/papeleta/:derechoVotoId/opciones/:id/{foto|plan-trabajo}`.
   Reutiliza el `AuthGuard` de sesión + el mismo criterio de pertenencia que ya usa
   `PapeletaService`: el `derechoVotoId` pertenece al usuario autenticado, y `:id` está entre las
   opciones de esa papeleta — 403 idéntico para "ajeno" e "inexistente" (sin oráculo de
   enumeración). Sirve el binario existente (`Candidato.foto`/`Lista.plan_trabajo`) con los mismos
   headers de seguridad (`nosniff`+CSP) que ya usa `CandidatosController`/`ListasController`.
3. **Frontend — componente de progreso**: `BarraProgresoVotacion`, presentacional puro
   (props `pasoActual`, `totalPasos`), inspirado en `PasoIndicador.tsx` pero como barra lineal sin
   etiquetas por paso, usado en los 3 pasos.
4. **Frontend — tarjetas de Paso 2**: 3 componentes de tarjeta (`TarjetaLista`,
   `TarjetaCandidato`, `TarjetaOpcion`) más `TarjetaVotoBlanco`, todas con el patrón "Candidate
   Cards" del design system (borde que engrosa + check al seleccionar). `PasoBoleta` decide la
   variante según un campo de tipo que viaje en `PapeletaDto.proceso.tipo`.
5. **Frontend — Paso 1 y 3**: `PasoInformacionProceso` agrega imagen institucional (logo de
   Configuración General, `GET /configuracion/logo` ya existente — sin campo nuevo en
   `ProcesoElectoral`) + 3 tarjetas de reglas estáticas; `PanelComprobante` agrega ícono de check y
   badge condicional sin nuevos campos de datos.
6. **`municipio` — candidato cabeza de lista**: `Candidato` no tiene un campo "principal"/orden
   explícito en el schema (fuera de alcance agregarlo). `PapeletaService` elige, de forma
   determinística, el primer `Candidato` activo de esa `Lista` por `nombres asc` (mismo orden que
   ya usa `CandidatosService.listar()`) — es una convención de desempate estable, NO una
   designación real de "cabeza de lista" en el dominio; documentarlo así en `design.md` para que no
   se lea como una garantía de negocio.
7. **Branding**: verificar que el `name: San Alfonso Academic Voting System` del front-matter de
   `DESIGN-SYSTEM.md` no se filtre a ningún componente ni copy; usar únicamente paleta/tipografía/
   tokens (genéricos, ya reusables).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/src/votos/dto/papeleta.dto.ts` | Modified | `PapeletaOpcionDto` enriquecido por tipo |
| `apps/backend/src/votos/papeleta.service.ts` | Modified | Mapeo de campos nuevos por `tipo` |
| `apps/backend/src/votos/votos.controller.ts` | Modified | 2 endpoints nuevos de archivo (foto/plan de trabajo) |
| `apps/backend/src/votos/votos.controller.spec.ts` | Modified | Cobertura de los 2 endpoints nuevos (403 ajeno/inexistente) |
| `apps/backend/src/votos/papeleta.service.spec.ts` | Modified | Actualizar `toEqual` de `opciones` |
| `apps/backend/src/configuracion/configuracion.controller.ts` | Modified | `GET /configuracion/logo` pasa de `@Roles('administrador','director')` a accesible por cualquier usuario autenticado vía `@SinRestriccionDeRol()` (ver `design.md` D4 — `@UseGuards` a nivel de método NO revierte el `@Roles` de clase en este `RolesGuard`) — ver Risks |
| `apps/frontend/src/votos/PasoInformacionProceso.tsx` | Modified | Barra de progreso, portada, tarjetas de reglas |
| `apps/frontend/src/votos/PasoBoleta.tsx` | Modified | Grilla de tarjetas por variante, % completado, footer |
| `apps/frontend/src/votos/PasoBoleta.spec.tsx` | Modified | Nuevas fixtures/roles de tarjeta |
| `apps/frontend/src/votos/PanelComprobante.tsx` | Modified | Ícono de check, badge "Ya has votado" |
| `apps/frontend/src/votos/VotacionPage.tsx` / `.spec.tsx` | Modified | Fixtures de `PapeletaDto` enriquecidas |
| `apps/frontend/src/votos/BarraProgresoVotacion.tsx` | New | Componente de progreso lineal compartido |
| `apps/frontend/src/votos/Tarjeta{Lista,Candidato,Opcion,VotoBlanco}.tsx` | New | Variantes de tarjeta del Paso 2 |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Nuevo endpoint de archivo introduce un oráculo de enumeración distinto al de `PapeletaService` | Medium | Reusar exactamente el mismo criterio de pertenencia y el mismo código/mensaje 403 para ajeno e inexistente (D9/D13) |
| `GET /configuracion/logo` tiene el mismo gap de autorización que `/candidatos/:id/foto`/`/listas/:id/plan-trabajo` (descubierto al revisar la decisión de imagen institucional del Paso 1): gateado a `@Roles('administrador','director')`, inalcanzable por votantes | Medium (bloqueante si no se resuelve) | A diferencia de foto de candidato/plan de trabajo (datos ligados a un proceso/derecho de voto concreto, con posible sensibilidad electoral), el logo institucional es un dato público no sensible sin relación con ningún voto — se relaja el guard de ese único método a "cualquier usuario autenticado" vía el decorador `@SinRestriccionDeRol()` (`design.md` D4) en vez de crear un endpoint espejo bajo `/votos/...`; el resto de `ConfiguracionController` mantiene `@Roles('administrador','director')` sin cambios |
| Romper tests existentes con `toEqual` literal sobre `opciones` | High (conocido) | Actualizar fixtures en la misma PR; ningún cambio en la lógica de `emitir()` |
| Confusión de UX si se omite "periodo lectivo"/"Sincronizado" respecto a la captura de referencia | Low | Documentado como decisión de producto: solo datos reales del dominio, sin campos fabricados |
| Filtración del nombre "San Alfonso" del front-matter de `DESIGN-SYSTEM.md` a la UI | Low | Checklist de revisión: grep de "San Alfonso" en componentes/copy antes de cerrar el change |
| Servir binarios (`foto`/`plan_trabajo`) por HTTP a un votante sin protección adicional de rol admin | Medium | Guard de sesión + verificación de pertenencia por request, mismos headers `nosniff`+CSP que los endpoints admin existentes |

## Rollback Plan

Todos los cambios son aditivos y retrocompatibles a nivel de datos (campos nuevos opcionales en
DTOs existentes, dos endpoints nuevos). Revertir es seguro con `git revert` del/los commits del
change: los componentes anteriores (`PasoBoleta`/`PanelComprobante`/`PasoInformacionProceso`
minimalistas) y el `PapeletaOpcionDto` de 2 campos vuelven a estar activos sin necesidad de
migración de base de datos (no hay cambios de schema). Los endpoints nuevos de archivo pueden
desactivarse individualmente sin afectar `emitir()`/`papeleta()`/`comprobante()`.

## Dependencies

- Ninguna externa. Depende del estado ya archivado de backlog #14 (`vote-casting`) y #15
  (`comprobante-autenticado`), ambos disponibles en `openspec/specs/`.

## Success Criteria

- [ ] Los 3 pasos usan la paleta/tipografía/radios del design system SEEI, sin el nombre "San
      Alfonso" en ningún componente o copy.
- [ ] `PasoBoleta` renderiza la variante de tarjeta correcta según `tipo` de proceso (incluida la
      foto del candidato cabeza de lista en `municipio`), con "Voto en Blanco" siempre presente
      como tarjeta adicional (nunca estado inicial).
- [ ] Paso 1 muestra la imagen institucional de Configuración General; ningún campo nuevo se
      agrega a `ProcesoElectoral` para portada.
- [ ] Los 2 endpoints nuevos de archivo devuelven 403 idéntico para una opción ajena a la papeleta
      del `derechoVotoId` y para un `id` inexistente.
- [ ] El comprobante rediseñado no muestra "periodo lectivo" ni "estado de sincronización".
- [ ] Toda la suite de tests existente (`PasoBoleta`, `VotacionPage`, `papeleta.service`,
      `votos.controller`) pasa actualizada, sin tocar los 19 tests de `VotosService.emitir()`.

## Proposal question round

No se realizó una ronda de preguntas interactiva de esta fase: el usuario ya entregó, junto con el
encargo, las decisiones de producto explícitas listadas abajo, y una descripción detallada de las
3 capturas de referencia con las variantes de tarjeta ya definidas.

Decisiones ya confirmadas por el usuario:

1. **Autorización de binarios**: endpoints nuevos bajo `/votos/...` con autorización por
   pertenencia (no se relaja el `RolesGuard` de `/candidatos`/`/listas`).
2. **Comprobante**: sin "periodo lectivo" ni "estado de sincronización" — solo datos reales.
3. **`municipio` — candidato cabeza de lista**: SÍ se muestra la foto del candidato cabeza de
   lista dentro de la tarjeta de Lista (revierte la asunción inicial de este documento). Ver
   Approach punto 6 para la convención de desempate (orden `nombres asc`, sin campo de schema
   nuevo).
4. **Imagen del Paso 1**: se usa la imagen institucional ya configurada en Configuración General
   (#10, `GET /configuracion/logo`) — sin campo de portada nuevo en `ProcesoElectoral`.

Queda 1 punto abierto para `sdd-design` (decisión técnica, no de producto):

1. **Forma del DTO `PapeletaOpcionDto` enriquecido**: ¿unión discriminada por `tipo` o un único
   tipo con todos los campos opcionales? Impacta el contrato OpenAPI y los tipos de cliente
   generados (ADR-0004). `sdd-design` decide con criterio técnico (consistencia con el resto de
   DTOs del módulo, que hoy usan campos opcionales homogéneos sin uniones discriminadas — ver
   `SegmentacionDto`).
