# Exploration: rediseno-boleta-votacion (backlog #31)

## Estado actual

Backlog #14 "vote-casting" (archivado en `openspec/changes/archive/2026-08-14-vote-casting/`) ya
implementa el flujo de 3 pasos funcionalmente. `VotacionPage.tsx`
(`apps/frontend/src/votos/VotacionPage.tsx`) orquesta una máquina de estados
(`cargando|papeleta|enviando|exito|ya-votaste|sin-padron|cerrada|sin-conexion|error`) sobre
`GET /votos/papeleta/:derechoVotoId`.

Piezas presentacionales puras actuales (todas minimalistas, sin foto/tarjetas):

- **`PasoInformacionProceso.tsx`**: props `{proceso:{nombre,descripcion,fecha_cierre_prevista},
  yaVoto, onContinuar}`. Solo texto + botón "Continuar" (deshabilitado si `yaVoto`). Sin barra de
  progreso, sin imagen de portada, sin las 3 tarjetas de reglas (voto secreto/una sola
  vez/irreversible).
- **`PasoBoleta.tsx`**: props `{opciones:{id,etiqueta}[], seleccion, onSeleccionar,
  onContinuar}`. Radio group vertical de labels, no tarjetas con foto. "Voto en blanco" es un
  radio más con borde discontinuo, no un card con ícono de prohibido. Sin barra "% Completado",
  sin footer "Volver/Siguiente".
- **`PasoConfirmacion.tsx`**: props `{resumenSeleccion:string, enviando, mensajeError?,
  onConfirmar, onVolver}`. Checkbox de consentimiento + botón "Confirmar voto"/"Registrando…". No
  es la pantalla de comprobante final — solo el paso previo a enviar.
- **`PanelComprobante.tsx`**: props `{comprobante:{codigo_comprobante, hora_servidor,
  eleccion_resumen}}`. Muestra comprobante, hora, elección; línea fija "se envió copia por
  correo". No tiene: ícono de check grande, badge "Ya has votado", periodo lectivo, "estado del
  sistema: Sincronizado". Reusada también por `ComprobantePage.tsx` (relectura autenticada vía
  enlace de correo, #15).
- **`PantallaRechazo.tsx`**: pieza única parametrizada por `variante`
  (`sin-padron|cerrada|ya-votaste|sin-conexion`), con ícono emoji + título + explicación + acción
  condicional. `ya-votaste` ya muestra un mini-comprobante (código + hora). Este componente NO
  forma parte de los 3 pasos normales — es la vía de rechazo (D9/D14 del design original).

Tests que cubren el estado actual: `PasoBoleta.spec.tsx` (17.1-17.2, opciones `{id,etiqueta}`
planas), `VotacionPage.spec.tsx` (18.3-18.5, 16.5, 22.1, 3.2 — recorre pasos, arma payload, maneja
rechazos), `papeleta.service.spec.ts` (3.1-3.3, backend, `PrismaService` mockeado),
`votos.controller.spec.ts` (10.3, 11.12, 1.3 — no cubre directamente el handler `papeleta()`,
solo `emitir()`/`misDerechos()`).

### Backend — `PapeletaDto`

`apps/backend/src/votos/dto/papeleta.dto.ts`:

- `PapeletaProcesoDto`: `{id, nombre, descripcion, fecha_cierre_prevista, tipo}` — SIN imagen de
  portada.
- `PapeletaOpcionDto`: SOLO `{id, etiqueta}` — sin foto, cargo, lista, `plan_trabajo_presente`.
- `PapeletaComprobanteDto`: `{codigo_comprobante, hora_servidor}`.
- `PapeletaDto`: `{proceso, en_calidad_de, opciones, ya_voto, comprobante}`.

`PapeletaService.obtenerOpciones()` (`papeleta.service.ts:54-73`) arma `opciones` según `tipo`:

- `municipio` → `Lista` activa: hoy solo `{id: l.id, etiqueta: l.nombre}` — el modelo `Lista`
  (`schema.prisma:236`) YA tiene `simbolo`, `lema`, `propuesta`,
  `plan_trabajo`/`plan_trabajo_mime`/`plan_trabajo_nombre`, pero el mapeo no los expone.
- `consulta` → `OpcionConsulta`: `{id, etiqueta}` — el modelo (`schema.prisma:275`) solo tiene
  `etiqueta`/`descripcion`, sin foto ni candidato/lista asociados.
- `representante_aula`/`padres` → `Candidato` activo: hoy `{id: c.id, etiqueta: c.nombres}` — el
  modelo `Candidato` (`schema.prisma:257`) YA tiene `grado`, `aula`, `cargo`, `foto`/`foto_mime`,
  pero solo se expone `nombres`.

`ComprobanteDto` (`apps/backend/src/votos/dto/comprobante.dto.ts`):
`{codigo_comprobante, hora_servidor, proceso:{id,nombre}, en_calidad_de, eleccion_resumen}`. NO
tiene "periodo lectivo" ni "estado del sistema". `ProcesoElectoral` (`schema.prisma:205`) NO
tiene `anio_escolar_id` — el año escolar solo se relaciona indirectamente vía
`DerechoVoto.aula_snapshot → Aula.anio_escolar_id` (o `Matricula`), nunca por el proceso mismo.
"Sincronizado" no tiene backing real: el sistema no modela ningún estado offline/pendiente de
sincronización (arquitectura monolito + Postgres, sin cola para el voto en sí — la cola BullMQ es
solo para el outbox de correo/#15/#18). Sería puramente cosmético salvo que se decida mapearlo a
algo real (p. ej. "el voto ya está persistido en la base transaccional" vs. mostrar el estado del
`JobCorreo`).

## Gaps de datos identificados

1. **Foto de candidato**: `GET /candidatos/:id/foto` (`candidatos.controller.ts:117-137`) YA
   sirve el binario con `nosniff`+CSP, pero el controlador entero está gateado por
   `@UseGuards(AuthGuard, RolesGuard)` + `@Roles('administrador','director','comite')`
   (`candidatos.controller.ts:22-24`, línea de clase). Los votantes tienen rol
   `estudiante`/`padre` — **NO pueden llamar este endpoint hoy**. Mismo problema en
   `ListasController` (`@Roles('administrador','director','comite')`, `listas.controller.ts:60`)
   para `GET /listas/:id/plan-trabajo`. El patrón "logo público" (`ConfiguracionController
   .obtenerLogo`) tampoco es público: también está bajo `@Roles('administrador','director')` a
   nivel de clase (`configuracion.controller.ts:125-126`). No existe hoy NINGÚN endpoint de
   imagen/archivo binario accesible para un votante autenticado sin rol administrativo.
2. **Cargo + lista/plan de trabajo**: `Candidato.cargo` existe en schema pero no se expone en
   `PapeletaOpcionDto`. Para `tipo==='municipio'`, la "lista" del candidato en la captura de
   referencia correspondería más bien a que la opción votable ES la `Lista` (voto por lista
   cerrada, D1 de #12) — no hay "candidato individual" votable en `municipio`, se vota por lista
   completa. Hay que decidir en el proposal si se muestra el/los candidato(s) cabeza de la lista
   dentro de la tarjeta de lista, o si la tarjeta de "municipio" simplemente es la lista (nombre,
   símbolo, lema, propuesta corta) sin foto de persona.
3. **`plan_trabajo_presente`**: derivable trivialmente en `PapeletaService`
   (`l.plan_trabajo !== null`) sin exponer bytes — igual que `ListaRespuestaDto` ya hace. El
   endpoint `GET /listas/:id/plan-trabajo` existe pero con el mismo problema de rol que el punto 1.
4. **`consulta`/`representante_aula`/`padres` sin foto**: `OpcionConsulta` no tiene candidato ni
   foto — la tarjeta de "Ver Propuesta Completa" no aplica ahí (no hay plan de trabajo, solo
   `descripcion` opcional). `representante_aula`/`padres` votan por `Candidato` sin `lista_id`
   (según D1 de #12, "candidato sin lista asociada") — sí tienen foto/cargo pero no lista.

## Componente de progreso reutilizable — patrón ya existente

`ProcesoWizardPage.tsx` (`apps/frontend/src/procesos/`) ya usa `PasoIndicador.tsx`
(`apps/frontend/src/procesos/PasoIndicador.tsx`) — un stepper de 4 nodos con etiquetas propias
(`['Datos','Público','Padrón','Revisión']`), círculos numerados/con check, línea de progreso entre
nodos, controlado 100% por `pasoActual` desde el padre (sin estado propio). El propio
`DESIGN-SYSTEM.md` (raíz, sección "Components → Voting Progress Indicator", línea 182-183)
especifica explícitamente: "A linear progress bar at the top of the voting flow using the Primary
Blue" — es decir, el sistema de diseño YA anticipa este patrón para el flujo de votación, distinto
del stepper de 4 nodos con etiquetas del wizard de procesos. Se recomienda un componente nuevo
(`BarraProgresoVotacion` o similar) inspirado en el mismo criterio de "presentacional puro
controlado por el padre" de `PasoIndicador`, pero como barra lineal (no stepper con nombres) ya
que en votación los pasos no tienen nombre propio en las capturas ("Paso 1 de 3" / "%
Completado"), evitando reimplementar la barra en cada uno de los 3 pasos.

## DESIGN-SYSTEM.md — hallazgo relevante

El front-matter YAML de `DESIGN-SYSTEM.md` tiene `name: San Alfonso Academic Voting System` —
mismo nombre de marca que las capturas de referencia que el usuario pidió NO usar. Sin embargo la
paleta (`institution-blue #000066`, `academic-red #990000`, `surface-white`, `border-gray`),
tipografía (Hanken Grotesk, escalas `headline-lg`/`body-md`/`label-md`/`caption`), radios
(`rounded-card`/`rounded-control`), sombra (`0px 4px 20px rgba(0,0,102,0.08)`) y componentes ya
documentados (Botones primario/secundario/terciario, "Candidate Cards" con borde que engrosa y
check al seleccionar, Chips/Badges de estado, "Voting Progress Indicator") son
genéricos/institucionales, no específicos de "San Alfonso" — son directamente reusables para SEEI.
El `name` del front-matter es cosmético/heredado y no debería filtrarse a la UI (verificar que
ningún componente lo renderice literalmente).

## Riesgos y preguntas abiertas para `sdd-propose`

1. **Autorización de binarios para votantes** (bloqueante): ni `/candidatos/:id/foto` ni
   `/listas/:id/plan-trabajo` son alcanzables por roles `estudiante`/`padre` hoy. Hace falta
   decidir: (a) nuevos endpoints de solo-lectura bajo `/votos/...` con autorización "el archivo
   pertenece a una opción de la papeleta activa de este derecho de voto" (mismo criterio de
   pertenencia que `PapeletaService`/`ComprobanteService`, D9/D13), o (b) relajar el `RolesGuard`
   existente condicionalmente. La opción (a) es más consistente con el principio de "lectura de
   UX separada de la escritura/administración" que ya sigue `PapeletaService`.
2. **`derechoVotoId` con `tipo` no-`municipio`**: el diseño de tarjeta "foto + nombre +
   facultad/cargo + propuesta + Ver Propuesta Completa" de la captura 2 asume candidato con foto y
   plan de trabajo — no aplica igual a `consulta` (sin foto, sin candidato, con `descripcion`
   opcional) ni cabalmente a `representante_aula`/`padres` (con foto/cargo pero sin lista/plan de
   trabajo). El proposal debe definir 2-3 variantes de tarjeta (candidato-con-lista para
   `municipio`, candidato-sin-lista para `representante_aula`/`padres`, opción-simple-con-ícono
   para `consulta`) en vez de una sola forma universal.
3. **Voto en blanco como tarjeta**: en las 4 variantes debe seguir siendo "una tarjeta más de la
   lista, con marca visual distinta" (comentario de diseño ya existente en `PasoBoleta.tsx` D14:
   "nunca el estado inicial ni el resultado de no elegir nada" — el rediseño NO debe reintroducir
   ambigüedad en esa semántica).
4. **"Periodo lectivo" en el comprobante**: no hay backing real en `ProcesoElectoral`; derivarlo
   requeriría atravesar `DerechoVoto.aula_snapshot → Aula.anio_escolar_id`, lo cual es información
   del votante, no necesariamente "el periodo del proceso". Alternativa: mostrar el `AnioEscolar`
   marcado `activo:true` en el momento del voto (que puede no coincidir con el aula_snapshot si
   cambió entre la apertura y el voto). Definir en proposal cuál es la fuente de verdad, o si se
   omite el campo por no tener sustento en el dominio.
5. **"Estado del sistema: Sincronizado"**: sin concepto real detrás — es cosmético en la
   referencia (probablemente para inspirar confianza) pero el sistema no tiene estado offline para
   el voto mismo. Recomendable no fabricar un estado ficticio; si se incluye, documentar
   explícitamente que es un indicador de "voto persistido correctamente en el servidor" (ya
   garantizado por el 200/201 de la respuesta), no un estado de sincronización real distribuido.
6. **Impacto en tests existentes**: `PasoBoleta.spec.tsx` asume `opciones:{id,etiqueta}[]` planas
   y radio buttons — cambiar a tarjetas con foto/cargo requiere reescribir aserciones de rol
   (`radiogroup`/`radio` vs. tarjetas con botón "Seleccionar Candidato") y fixtures de opciones
   enriquecidas. `VotacionPage.spec.tsx` usa fixtures de `PapeletaDto` con opciones mínimas — hay
   que enriquecerlas sin romper los casos 18.3-18.5/16.5/22.1 que no dependen de esos campos.
   `papeleta.service.spec.ts` (3.1) tiene aserciones exactas `toEqual({id,etiqueta})` sobre
   `opciones` — cualquier campo nuevo en `PapeletaOpcionDto` rompe esos `toEqual` literalmente
   (hay que actualizarlos, no es opcional). `votos.controller.spec.ts` no testea `papeleta()`
   directamente hoy — sin impacto directo pero es una oportunidad para agregar cobertura si el
   proposal toca el controller (p. ej. nuevos endpoints de foto/plan-trabajo).
7. **Idempotencia/UNIQUE/validación de derecho** (backlog #14): sin cambios — este rediseño es
   estrictamente presentacional + aditivo de datos de lectura (`PapeletaOpcionDto`,
   `ComprobanteDto`), no toca `VotosService.emitir()` ni sus 19 tests unitarios ni la transacción
   D5/D7.

## Ready for Proposal

Sí — hay suficiente terreno mapeado: los 4 gaps de datos (foto, cargo, lista/plan_trabajo_presente,
"sin candidato" para consulta), el riesgo bloqueante de autorización de binarios para votantes, la
ausencia de "periodo lectivo" real, y el patrón de progreso reutilizable ya existen documentados.
El proposal debe decidir explícitamente:

- (a) el contrato ampliado de `PapeletaOpcionDto` por tipo de proceso,
- (b) la estrategia de autorización para foto/plan de trabajo desde el flujo de votación,
- (c) si "periodo lectivo" y "Sincronizado" se incluyen con qué semántica real o se omiten, y
- (d) el diseño de componente de barra de progreso lineal compartida entre los 3 pasos.
