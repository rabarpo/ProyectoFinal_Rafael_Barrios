# Diseño: dashboard-panel-jornada (Backlog #20)

## Enfoque técnico

Módulo backend propio `apps/backend/src/panel-jornada/` (controlador + servicio + DTOs + caché +
constantes), hermano de `procesos/`, con `@UseGuards(AuthGuard, RolesGuard)` y
`@Roles('administrador','director','comite')` a nivel de clase — patrón literal de
`ActasController`. Cinco endpoints de lectura, todos de agregación, sin cambios de schema. El
cálculo de participación reutiliza `calcularParticipacion`/`calcularEscrutinio` de
`procesos/escrutinio.ts` (funciones libres sobre `tx`, ya compartidas con el worker de #17): cero
cambios a `resultados-en-vivo` (#16). Frontend: módulo `apps/frontend/src/panel-jornada/` con hook
de sondeo genérico propio, página contenedor y vista de proyección fuera del `AppShell`.

## Decisiones de arquitectura

| # | Decisión | Alternativas rechazadas | Fundamento |
|---|---|---|---|
| D1 | Módulo `panel-jornada/` propio, no métodos en `procesos/` | Extender `ProcesosController` | `ProcesosController` ya lleva `@Roles` propio; el panel es supervisión operativa, no gestión del recurso. Mismo criterio que `ActasController`/`ResultadosController` |
| D2 | 5 endpoints separados bajo `/panel-jornada` | Un agregador único | Mezcla datos institucionales (sin proceso) con datos por proceso; TTL y costo por agregación son distintos (ver D5). Coherente con "Enfoque 2" de la propuesta |
| D3 | Avance por aula sobre `DerechoVoto.aula_snapshot` | `Matricula` + `Aula` en vivo | El padrón está **congelado** (ADR-0010); `Matricula` puede cambiar durante la jornada y produciría denominadores incoherentes con `padron_total`. `aula_snapshot` es espejo plano de `ProcesoAula.aula_id` |
| D4 | Serie horaria sobre `Voto.hora_servidor` | `Voto.creado_en` (citado en `exploration.md`) | **`Voto.creado_en` no existe** en `schema.prisma`; el campo real es `hora_servidor @db.Timestamptz(3)`. Corrección de la exploración |
| D5 | Caché Redis **por agregación**, no por endpoint | Una clave por endpoint | `proyeccion` compone las mismas tres agregaciones que el dashboard; cachear por agregación evita recalcular y evita una quinta clave que se desincronice |
| D6 | El panel **respeta** `ocultar_resultados` para los resultados rápidos | Excepción tipo `ActasController` (desglose siempre) | El acta es artefacto probatorio post-cierre; el panel es **en vivo durante la jornada** — replicar la excepción reabre la fuga que cerró #16. Modo oculto nunca invoca `calcularEscrutinio()` |
| D7 | "Aula rezagada" = umbral **relativo** en puntos porcentuales | Umbral absoluto (`< 50 %`) | A media mañana el global puede ser 20 %: un absoluto marcaría todas las aulas. Evaluado en el **servidor** (`rezagada: boolean` en el payload), nunca en el cliente (ADR-0005) |
| D8 | Proyección = endpoint propio que nunca llama `calcularEscrutinio` | Reusar `/resumen` y filtrar en cliente | La ausencia de desglose es **estructural**, no un filtro: el código de proyección no tiene camino de llamada hacia el desglose (idioma de `calcularParticipacion` vs. `calcularEscrutinio`) |
| D9 | `usePanelSondeo` genérico **local** al módulo nuevo | Extraer `useSondeo` común y reescribir `useResultadosEnVivo` | La propuesta excluye tocar #16. El hook nuevo es genérico (`queryKey`, `fetcher`, `intervaloMs`); una migración posterior de #16 hacia él es un change aparte |
| D10 | `/proyeccion/:procesoId` se monta **fuera** de `AppShell` | Overlay `fixed inset-0` sobre el shell | El overlay deja header/sidebar en el DOM y enfocables por teclado. `App.tsx` elige el layout según `ruta.nombre` |
| D11 | Errores explícitos: `404` proceso inexistente, `409 ESTADO_INVALIDO` en `borrador` | `403` opaco de #16 | Estos 3 roles ya enumeran procesos por `GET /procesos`: el 403 opaco no protege nada y degrada el diagnóstico |

## Endpoints

Prefijo `@Controller('panel-jornada')`, `:id` con `ParseUUIDPipe`. Todos `GET`, sin body.

| Ruta | Respuesta (campos) | Consulta Prisma | Caché / TTL |
|---|---|---|---|
| `/institucion` | `estudiantes:int`, `vinculos_apoderado:int`, `hora_servidor:string` | `usuario.count({where:{rol:'estudiante',estado:'activo'}})` + `apoderado.count()` (filas crudas, sin dedup por DNI) | `panel:institucion` · 300 s |
| `/procesos/:id/resumen` | `proceso_id`, `estado`, `padron_total`, `votos_emitidos`, `correos_fallidos`, `estado_visibilidad:'visible'\|'oculto'`, `hora_servidor`, `dimension?`, `desglose?[]`, `blancos?` | `calcularParticipacion(tx,id)`; `jobCorreo.count({where:{proceso_id:id,estado:'fallido'}})`; si `!ocultar_resultados` → `calcularEscrutinio(tx,id,tipo)`, mapeo campo por campo sin `spread` (`baja_en` nunca sale) | `panel:resumen:{id}` · 8 s |
| `/procesos/:id/votos-por-hora` | `hora_servidor`, `franjas:[{ hora_inicio:ISO, votos:int }]` | `$queryRaw` parametrizado: `SELECT date_trunc('hour', hora_servidor) AS hora, count(*)::int AS votos FROM "Voto" WHERE proceso_id = ${id}::uuid GROUP BY 1 ORDER BY 1`; el servicio rellena las franjas vacías desde `date_trunc('hour', apertura_real)` hasta `min(now, cierre_real)` | `panel:votos-hora:{id}` · 60 s |
| `/procesos/:id/avance-aulas` | `hora_servidor`, `participacion_global_pp:number`, `umbral_rezago_pp:number`, `aulas:[{ aula_id, etiqueta, padron, votos, porcentaje, rezagada:boolean }]` | `derechoVoto.groupBy({by:['aula_snapshot'],where:{proceso_id:id},_count:{_all:true}})` (padrón) + el mismo `groupBy` con `where.votos={some:{}}` (votaron; `@@unique([proceso_id,derecho_voto_id])` garantiza ≤1 voto por derecho) + `aula.findMany({where:{id:{in:ids}},select:{id,turno,grado:{select:{nombre}},seccion:{select:{nombre}}}})` para la etiqueta | `panel:avance-aulas:{id}` · 30 s |
| `/procesos/:id/proyeccion` | `hora_servidor`, `padron_total`, `votos_emitidos`, `franjas[]`, `aulas[]` — **sin** `desglose`/`blancos`/`dimension` | Compone `calcularParticipacion` + las funciones de votos-por-hora y avance-aulas. **Nunca** importa `calcularEscrutinio` | Sin clave propia: reusa las 3 claves anteriores |

`Apoderado` no tiene columna de estado ni `proceso_id`: `vinculos_apoderado` es institucional, no por
proceso; la UI lo etiqueta "vínculos apoderado–estudiante" (mitigación de riesgo de la propuesta).
Los "procesos activos" siguen resolviéndose con `GET /procesos?estado=abierto` (`procesos-api.ts
listar({estado:'abierto'})`), sin tocar `ProcesosController`.

### Umbral de rezago

`UMBRAL_REZAGO_PP = Number(process.env.PANEL_JORNADA_UMBRAL_REZAGO_PP ?? 15)` en
`panel-jornada.constantes.ts`. Regla: `rezagada = padron > 0 && porcentaje <=
participacion_global_pp - UMBRAL_REZAGO_PP`. Aulas con `padron === 0` nunca son rezagadas (evita
división por cero y ruido). Nunca se emite desglose por candidato a nivel de aula — sólo
participación (mitigación del riesgo de inferencia en aulas pequeñas).

### Caché

`panel-jornada-cache.ts` es copia parametrizada de `resultados-cache.ts` (envoltorio
`{ clave_scope, payload }` con autochequeo anticontaminación; JSON corrupto, clave ajena o error de
Redis degradan a MISS, nunca a 500). Prefijo `panel:` disjunto de `resultados:`/`session:`/
`recovery:`. TTLs por env: `PANEL_JORNADA_TTL_INSTITUCION_SECONDS` (300),
`_RESUMEN_` (8, alineado con `RESULTADOS_CACHE_TTL_SECONDS`), `_VOTOS_HORA_` (60), `_AVANCE_AULAS_`
(30). Cada agregación corre en `$transaction(..., { isolationLevel: 'RepeatableRead' })` como #16.

## Flujo de datos

```
Navegador                  PanelJornadaController          Redis            Postgres
   │  GET /panel-jornada/procesos/:id/resumen
   ├──────────────────────────►│
   │            AuthGuard → RolesGuard (administrador|director|comite)
   │                           │  get panel:resumen:{id} ──►│
   │                           │◄── HIT ────────────────────│
   │◄──────── 200 ─────────────┤
   │                           │  MISS → $transaction(RepeatableRead) ─────►│
   │                           │    calcularParticipacion + jobCorreo.count │
   │                           │    (+ calcularEscrutinio sólo si visible)  │
   │                           │  setex(panel:resumen:{id}, 8 s) ──►│
   │◄──────── 200 ─────────────┤
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/src/panel-jornada/panel-jornada.controller.ts` | Crear | 5 rutas `GET`, `@Roles('administrador','director','comite')`, `@ApiTags/@ApiParam/@ApiResponse` (necesarios para el contrato generado) |
| `apps/backend/src/panel-jornada/panel-jornada.service.ts` | Crear | Una función pública por agregación; el resumen valida existencia (404) y `estado !== 'borrador'` (409) |
| `apps/backend/src/panel-jornada/panel-jornada-cache.ts` | Crear | Envoltorio genérico + `clavePanel(scope, id?)` + TTLs |
| `apps/backend/src/panel-jornada/panel-jornada.constantes.ts` | Crear | `UMBRAL_REZAGO_PP` y TTLs por env |
| `apps/backend/src/panel-jornada/dto/*.dto.ts` | Crear | `ResumenJornadaDto`, `InstitucionDto`, `VotosPorHoraDto`, `AvanceAulasDto`, `ProyeccionDto` con `@ApiProperty` |
| `apps/backend/src/panel-jornada/panel-jornada.module.ts` | Crear | Wiring espejo de `procesos.module.ts` (`PrismaService` + `REDIS_CLIENT`) |
| `apps/backend/src/app.module.ts` | Modificar | Importa `PanelJornadaModule` |
| `packages/contracts/src/generated/api.ts` | Regenerar | Dependencia de orden: DTOs backend → regeneración → wrappers frontend |
| `apps/frontend/src/panel-jornada/panel-jornada-api.ts` | Crear | Wrappers tipados sobre `createSeeiClient`, estilo `resultados-api.ts` |
| `apps/frontend/src/panel-jornada/usePanelSondeo.ts` | Crear | Hook genérico de sondeo (ver abajo) |
| `apps/frontend/src/panel-jornada/usePanelJornada.ts` | Crear | `useInstitucion`, `useResumenJornada`, `useVotosPorHora`, `useAvanceAulas`, `useProyeccion` sobre `usePanelSondeo` |
| `apps/frontend/src/panel-jornada/PanelJornadaPage.tsx` | Crear | Contenedor: selector de proceso abierto (estado de componente) + piezas |
| `apps/frontend/src/panel-jornada/ProyeccionPage.tsx` | Crear | Contenedor de proyección, sin controles interactivos |
| `apps/frontend/src/panel-jornada/piezas/{TarjetasResumen,GraficoVotosPorHora,TablaAvanceAulas,SelectorProcesoActivo}.tsx` | Crear | Presentacionales puras, sin hooks de datos (idioma de `resultados/piezas/`) |
| `apps/frontend/src/app/rutas.ts` | Modificar | `{ nombre:'panel-jornada' }` (plano, `/panel-jornada`) y `{ nombre:'proyeccion'; procesoId }` (`/proyeccion/:procesoId`, con id en URL porque la pantalla de kiosco debe sobrevivir a un recargo) |
| `apps/frontend/src/app/Enrutador.tsx` | Modificar | Dos `case` nuevos |
| `apps/frontend/src/app/menu-por-rol.ts` | Modificar | Ítem `PANEL_JORNADA` en `administrador`/`director`/`comite`. **Sin** ítem de proyección: requiere `procesoId` que el menú no tiene (mismo criterio ya documentado para "Candidatos") |
| `apps/frontend/src/app/App.tsx` | Modificar | `RUTAS_SIN_SHELL = ['proyeccion']`: monta `<Enrutador/>` desnudo dentro de `AuthGuard > QueryProvider` (D10) |

## Contratos / interfaces

```ts
// usePanelSondeo.ts — genérico, parametrizable; NO refactoriza useResultadosEnVivo (D9).
export const INTERVALO_PANEL_MS = 15_000;      // dashboard: ~2x el TTL de 8 s del resumen
export const INTERVALO_PROYECCION_MS = 30_000; // proyección: alineado al TTL de avance-aulas

export function usePanelSondeo<T>(
  queryKey: readonly unknown[],
  fetcher: (signal?: AbortSignal) => Promise<T>,
  intervaloMs: number = INTERVALO_PANEL_MS,
) {
  return useQuery({ queryKey, queryFn: ({ signal }) => fetcher(signal), refetchInterval: intervaloMs });
}
```

`retry: 0` viene del `QueryClient` global (#16 D9) — un `403` aflora al primer fallo, sin reintento;
`refetchIntervalInBackground` queda en su default `false`.

## Estrategia de pruebas

| Capa | Qué probar | Cómo |
|---|---|---|
| Unit (backend) | Umbral de rezago (límite exacto, `padron=0`, global 0 %); relleno de franjas vacías; envoltorio de caché (JSON corrupto / clave ajena → MISS) | Jest puro, funciones sin Redis (idioma de `resultados-cache.spec.ts`/`escrutinio.spec.ts`) |
| Unit (servicio) | `ocultar_resultados=true` ⇒ `calcularEscrutinio` **no** se invoca (espía); `proyeccion` nunca devuelve `desglose`; `borrador` ⇒ 409; inexistente ⇒ 404 | Jest con `PrismaService`/Redis mockeados (idioma de `resultados.service.spec.ts`) |
| Integración | Los 5 endpoints con `docente`/`estudiante` ⇒ 403; sin cookie ⇒ 401; `:id` no-UUID ⇒ 400 | Supertest sobre el módulo Nest, patrón de `roles.guard.spec.ts` |
| Frontend | `usePanelSondeo` respeta `intervaloMs`; `ProyeccionPage` no renderiza ningún control; `parsearRuta`/`rutaAPath` ida y vuelta para las 2 rutas nuevas; `MENU_POR_ROL` no expone el ítem a `docente`/`estudiante` | Vitest + Testing Library (idioma de `useResultadosEnVivo.spec.tsx`, `Enrutador.spec.tsx`) |

## Threat Matrix

| Boundary | Aplicabilidad | Respuesta de diseño | Pruebas RED |
|---|---|---|---|
| Documentation-like paths | N/A: el change no clasifica ni ejecuta archivos | — | — |
| Git repository selection | N/A: sin automatización de VCS | — | — |
| Commit state | N/A: sin automatización de VCS | — | — |
| Push state | N/A: sin automatización de VCS | — | — |
| PR commands | N/A: sin automatización de PR | — | — |

Filas específicas del repo (convención "Enrutamiento (cliente)" ya usada en `rutas.ts`):

| Caso adversario | Respuesta de diseño | Prueba RED |
|---|---|---|
| `/proyeccion/../../etc/passwd`, `/proyeccion` sin id, `/panel-jornada/algo` | `parsearRuta` total ⇒ `no-encontrada`; nunca lanza | `rutas.spec.ts` |
| `procesoId` arbitrario en la URL de proyección | El servidor valida con `ParseUUIDPipe` + `@Roles`; el cliente nunca autoriza | Integración 400/403 |
| Rol no autorizado navega a `/panel-jornada` a mano | `MENU_POR_ROL` es sólo presentación; los 5 endpoints responden 403 | Integración + `Enrutador.spec.tsx` |
| Fuga de desglose por la puerta de proyección | `ProyeccionDto` no tiene campo de desglose y el servicio no importa `calcularEscrutinio` | Unit de servicio (espía) |

## Migración / despliegue

Sin migración: no hay cambios de schema (D3/D4 usan columnas existentes). Sólo lectura, `git revert`
limpio. Variables de entorno nuevas, todas con default en código: `PANEL_JORNADA_UMBRAL_REZAGO_PP`,
`PANEL_JORNADA_TTL_*_SECONDS`. Orden de merge obligatorio: DTOs backend → regeneración de
`packages/contracts` → wrappers/hooks frontend.

## Preguntas abiertas

- [ ] Ninguna que bloquee la implementación.
