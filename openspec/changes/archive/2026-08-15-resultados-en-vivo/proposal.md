# Propuesta: resultados-en-vivo (Backlog #16 — Resultados en vivo)

## Intención

Hoy no existe ningún endpoint que exponga participación o conteos durante la jornada electoral: el
único "en vivo" real del repo es `usePadronEnVivo.ts` (#11), que muestra el padrón antes de la
apertura, no resultados de votación. `ProcesoElectoral.ocultar_resultados` existe en el schema desde
#2 y quedó congelado e inmutable por #13, pero ningún código lo lee todavía. TECH-DESIGN.md (Flujo
4) exige que, durante un proceso `abierto`, cualquier rol de votante autenticado pueda consultar al
menos la participación, con polling corto (ADR-0005), y que el comité vea además si los resultados
están ocultos. Sin este change, la jornada electoral no tiene ninguna superficie de lectura en vivo
más allá del padrón previo a la apertura, y el criterio de éxito 9 del PRD ("resultados en tiempo
real") queda sin implementar. Este change entrega ese endpoint y su primer consumo real en el
frontend, incluidas las dos dependencias nuevas (React Query, librería de gráficos) que ADR-0005
da por decididas pero que ningún change anterior instaló.

## Decisiones del proposal — resuelven las 5 preguntas abiertas de la exploración

La sesión corre en modo automático (sin ronda de preguntas al usuario). Las cinco preguntas que
`exploration.md` (sección 10) dejó abiertas se resuelven aquí, con criterio explícito y trazable a
las fuentes ya leídas.

### 1. Forma exacta de la respuesta cuando `ocultar_resultados = true`

**Decisión:** el payload en modo oculto contiene únicamente:

```json
{
  "proceso_id": "...",
  "estado_visibilidad": "oculto",
  "participacion": { "votos_emitidos": 812, "padron_total": 1000 },
  "hora_servidor": "2026-08-15T14:32:07.123Z"
}
```

Sin ningún desglose adicional: ni por aula, ni por candidato/lista/opción, ni un porcentaje
pre-calculado que el cliente no pueda derivar de los dos números crudos. `TECH-DESIGN.md` solo
prohíbe literalmente "conteos por candidato", pero un desglose por aula puede filtrar preferencia
indirectamente en aulas pequeñas (p. ej. un aula de 12 estudiantes donde solo 3 votaron ya reduce
el universo de sospechosos de una intención). El principio rector de ADR-0005 — "toda la verdad
vive en el servidor, el cliente nunca decide qué ocultar" — se traduce aquí en la regla más
conservadora posible: cuando está oculto, el servidor no calcula ni transporta ningún dato agregado
por debajo del nivel de proceso completo. `votos_emitidos` se deriva de `count(Voto)` para ese
`proceso_id`; `padron_total` de `count(DerechoVoto)` para ese `proceso_id` (nunca de
`Matricula`/`Usuario` en vivo, por el mismo argumento de padrón congelado que `exploration.md`
sección 1 ya estableció). El porcentaje de participación se calcula en el cliente a partir de esos
dos enteros — no es un campo del servidor, porque no aporta información nueva y evita fijar en el
contrato la forma de redondeo.

### 2. Audiencia y campo adicional para comité

**Decisión:** se confirma la audiencia amplia de TECH-DESIGN.md sobre la lectura ambigua de
`BACKLOG.md`: `GET /procesos/:id/resultados` usa `@UseGuards(AuthGuard)` únicamente, sin
`@Roles()` — mismo patrón que `votos.controller.ts` (precedente literal, `exploration.md` sección
4). Cualquier cuenta con al menos un `DerechoVoto` en ese proceso puede leer la respuesta.

No se crea un endpoint distinto para el comité. La misma respuesta incluye un campo booleano
adicional, presente siempre pero solo relevante en modo oculto:

```json
"resultados_ocultos_por_configuracion": true
```

Este campo es idéntico para todos los roles (no es información sensible: ya se infiere de
`estado_visibilidad`), y no se traduce en un desglose adicional para comité — el propio
TECH-DESIGN.md dice que el comité ve "el estado oculto", no conteos adicionales durante la jornada
`abierta`. Justificación de no separar endpoints: un segundo endpoint gateado por rol duplicaría la
lógica de agregación y el mecanismo de caché (decisión 3) para un beneficio nulo, ya que el propio
criterio de aceptación no le da al comité ningún dato extra que oculto no exponga.

### 3. Mecanismo de caché corta (5-10 s)

**Decisión:** reutilizar el `REDIS_CLIENT` (`apps/backend/src/redis/redis.provider.ts`, `ioredis`)
ya activo en el backend, con `SETEX resultados:{proceso_id} 8 <json>` (TTL de 8 s, punto medio del
rango 5-10 s que exige ADR-0005) y lectura `GET` antes de golpear Postgres.

Se descarta caché in-memory (`Map`/TTL en proceso Node) a pesar de ser la opción más simple, por
una razón concreta y verificable en el propio repo, no una preferencia genérica: Redis **ya es**
infraestructura compartida y activa del backend — `session.service.ts` lo usa como fuente única de
verdad de sesiones (`REDIS_CLIENT`), lo que implica que el diseño del sistema ya asume que el
backend puede correr como más de una instancia detrás de un balanceador (de lo contrario no habría
necesidad de externalizar sesiones fuera del proceso). Una caché in-memory por instancia sería
incoherente con esa premisa: cada instancia tendría su propio TTL y su propia primera lectura fría
a Postgres, multiplicando exactamente la carga que ADR-0005 pide evitar en el pico de cierre. Usar
Redis es además costo marginal cero — no agrega una dependencia nueva, ioredis ya está instalado en
`apps/backend/package.json` y el provider ya existe. Se descarta cabeceras HTTP de caché (`Cache-
Control`/ETag) porque el endpoint es autenticado por sesión (no cacheable de forma segura en un
proxy/CDN compartido sin filtrar entre usuarios) y porque no hay ningún proxy de caché HTTP en la
arquitectura actual del repo (Nest sirve directo).

Diseño de la clave: `resultados:{proceso_id}` (sin variar por usuario — el payload es idéntico para
todos los votantes, y el flag de comité, al no cambiar el JSON entre roles, no rompe el cacheo
compartido). Invalidación: ninguna activa; el TTL corto es la única garantía de frescura (consistente
con "toda la verdad vive en el servidor, con leve retraso aceptado", no con invalidación por evento).

### 4. Librería de gráficos (barras y pastel)

**Decisión:** `recharts`.

Contexto de versiones relevante (`apps/frontend/package.json`): React `^18.3.1`, Vite `^6.0.7`,
Tailwind `^4.1.10`, sin ninguna librería de gráficos instalada hoy. Comparación con las alternativas
obvias:

| Opción | Por qué se descarta / por qué se elige |
|---|---|
| **recharts** (elegida) | Componentes React declarativos sobre SVG — no maneja un `<canvas>` imperativo por fuera del ciclo de vida de React, que es justo el tipo de fricción que un polling de 10-30 s (re-render frecuente) expone con librerías basadas en canvas. Soporta React 18 sin parches. Provee `BarChart` y `PieChart` listos, sin curva de configuración adicional para el caso simple de este change (pocas categorías: candidatos/listas/opciones de un proceso escolar, nunca miles de puntos). Ampliamente usada, con precedente de mantenimiento activo. |
| `chart.js` + `react-chartjs-2` | Basado en `<canvas>`: react-chartjs-2 es un wrapper fino que igual expone problemas de reconciliación con actualizaciones frecuentes de datos (re-crear/objetos mutables de Chart.js) y estiliza peor con clases Tailwind al no ser SVG inspeccionable/estilable por CSS. Dos paquetes en vez de uno. |
| `victory` | Pensada también para React Native (superficie más amplia de la necesaria); paquete históricamente más pesado para el caso de uso simple de dos tipos de gráfico. |
| `nivo` | Requiere múltiples paquetes por tipo de gráfico (`@nivo/bar`, `@nivo/pie`) con dependencias `d3-*` propias; mayor peso de bundle y superficie de API para un requerimiento acotado a dos gráficos simples. |

`recharts` es la opción de menor fricción de integración con el stack ya elegido (SVG + React
puro, sin canvas, sin múltiples paquetes) para exactamente los dos tipos de gráfico que pide #16.

### 5. `usePadronEnVivo.ts` queda intacto

**Decisión confirmada explícitamente:** este change no toca `apps/frontend/src/procesos/
usePadronEnVivo.ts`. Ese hook resuelve un problema distinto (padrón en construcción, antes de la
apertura) con un patrón manual deliberado (`useEffect` + `AbortController` + secuencia + debounce)
que ya tiene sus propios tests. #16 introduce React Query como el mecanismo de estado del servidor
para su propio hook nuevo de resultados (`useResultadosEnVivo` o equivalente), sin migrar código
existente que funciona. Migrar `usePadronEnVivo.ts` a React Query queda fuera de alcance de este
change; si se decide en el futuro, es un change de mantenimiento propio, no un efecto colateral de
#16.

## Alcance

### Dentro de alcance

- `GET /procesos/:id/resultados`: nuevo endpoint bajo el módulo `procesos/`, `AuthGuard`-only (sin
  `@Roles()`), que respeta `ocultar_resultados` y siempre incluye `hora_servidor` (mismo patrón de
  sellado que `ComprobanteDto`).
- Payload en modo visible (`ocultar_resultados = false`): participación (igual que en modo oculto)
  más desglose por candidato/lista/opción vía `groupBy()` sobre `Voto`, reutilizando el idioma de
  agregación ya usado en `opciones.service.ts`/`listas.service.ts`/`candidatos.service.ts`. Nulos
  siempre en 0 (ADR-0008); abstenciones = `padron_total - votos_emitidos`.
- Payload en modo oculto: solo participación (ver decisión 1), más el flag
  `resultados_ocultos_por_configuracion` (ver decisión 2).
- Caché corta en Redis (`SETEX`, TTL 8 s) reutilizando `REDIS_CLIENT` (ver decisión 3).
- Instalación y configuración mínima de `@tanstack/react-query` en el frontend
  (`QueryClientProvider` en el punto de entrada de la app), como primer consumidor real de esa
  decisión de ADR-0005.
- Instalación de `recharts` (ver decisión 4) y componentes de gráfico de barras/pastel para el
  desglose por candidato/lista/opción en modo visible.
- Hook nuevo `useResultadosEnVivo` (o equivalente) sobre React Query, con `refetchInterval`
  configurable dentro del rango 10-30 s de ADR-0005.
- Vista frontend de resultados en vivo: participación siempre visible; gráficos de barras/pastel
  solo cuando `estado_visibilidad = "visible"`; mensaje de "resultados ocultos hasta el cierre"
  cuando no.

### Fuera de alcance

- Migración de `usePadronEnVivo.ts` a React Query (ver decisión 5) — permanece intacto.
- Cálculo final/definitivo, actas, empates y su resolución — Backlog **#17** (Cierre, escrutinio y
  actas). Este change cubre únicamente la vista en vivo durante la jornada `abierta`; la misma
  consulta probablemente se reutiliza después del cierre, pero esa reutilización es decisión de
  `#17`, no de este change.
- Modo proyección/pantalla grande dedicado (mencionado en ADR-0005 junto a "panel de jornada") — no
  forma parte del criterio de éxito 9 del PRD ni de la fila #16 del backlog; si existe una vista de
  proyección separada, es un change posterior que puede reutilizar este mismo endpoint.
- SSE/WebSockets — descartados explícitamente por ADR-0005, no son una opción de diseño disponible
  para este change.
- Tabla de agregados pre-materializada / worker de refresco — descartada explícitamente en
  `exploration.md` (Approach C) por contradecir ADR-0005 y por sobre-ingeniería frente al volumen
  declarado (~1000 votantes).
- Endpoint distinto para comité — resuelto en decisión 2: mismo endpoint, campo adicional.
- Invalidación activa de caché por evento (p. ej. al emitir un voto) — el TTL corto es la única
  garantía de frescura adoptada; invalidación por evento es una optimización posible pero no
  requerida por ADR-0005 y añade acoplamiento entre `votos.service.ts` y el módulo de resultados
  que este change prefiere evitar en su primera versión.

## Enfoque

1. Nuevo `ResultadosService` (o extensión de `procesos.service.ts`) con dos métodos de agregación:
   `contarParticipacion(proceso_id)` (`count(DerechoVoto)` + `count(Voto)`) y
   `desglosarPorCandidatoListaOpcion(proceso_id)` (`groupBy()` sobre `Voto`, mismo idioma que
   `opciones.service.ts`/`listas.service.ts`/`candidatos.service.ts`).
2. Envolver la lectura con caché Redis: `GET resultados:{proceso_id}` → si hit, responder desde
   caché (sin tocar Postgres); si miss, calcular, `SETEX` con TTL 8 s, responder.
3. `GET /procesos/:id/resultados` en `procesos.controller.ts` (o un controlador hermano
   `resultados.controller.ts` dentro del mismo módulo), `@UseGuards(AuthGuard)` sin `@Roles()`.
4. DTO de respuesta con `hora_servidor: string` (ISO, sellada por Postgres `now()`/
   `clock_timestamp()` dentro de la consulta, mismo patrón que `ComprobanteDto`).
5. Frontend: instalar `@tanstack/react-query` + `QueryClientProvider`; instalar `recharts`.
6. Hook `useResultadosEnVivo(procesoId)` sobre `useQuery` con `refetchInterval` en el rango 10-30 s.
7. Vista de resultados: participación siempre; gráficos de barras/pastel condicionados a
   `estado_visibilidad === "visible"`; mensaje de "ocultos" en caso contrario.

## Capabilities

### New Capabilities
- `resultados-en-vivo`: endpoint autenticado (cualquier votante) de participación y desglose
  agregado durante la jornada `abierta`, con caché corta en servidor y respeto estricto de
  `ocultar_resultados`.

### Modified Capabilities
- None. `ocultar_resultados` (definido y congelado por `apertura-proceso-congelamiento-padron`,
  #13) se lee, no se modifica; su spec de inmutabilidad no cambia.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/src/procesos/` (servicio + controlador nuevo o extendido) | New/Modified | Endpoint `GET /procesos/:id/resultados`, agregación `count()`/`groupBy()` |
| `apps/backend/src/redis/redis.provider.ts` | Reused, unmodified | `REDIS_CLIENT` consumido por la caché corta de resultados |
| `apps/frontend/package.json` | Modified | Nuevas dependencias: `@tanstack/react-query`, `recharts` |
| `apps/frontend/src/` (punto de entrada) | Modified | `QueryClientProvider` nuevo envolviendo la app |
| `apps/frontend/src/procesos/` (o módulo nuevo `resultados/`) | New | Hook `useResultadosEnVivo`, vista de resultados con gráficos |
| `apps/frontend/src/procesos/usePadronEnVivo.ts` | Unmodified (explícito) | Fuera de alcance por decisión 5 |
| `apps/backend/test/` | New | Pruebas de integración del endpoint (modo oculto/visible, caché, hora del servidor) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Fuga indirecta de preferencia en modo oculto vía desglose por aula u otro campo no previsto | Baja | Decisión 1 fija el payload exacto en modo oculto: solo dos enteros de proceso completo, sin excepción, verificado en pruebas de contenido de la respuesta |
| Caché Redis sirve datos obsoletos justo tras el cierre del proceso (hasta 8 s de retraso) | Media | Aceptado explícitamente por ADR-0005 (retraso corto a cambio de proteger Postgres); no es un defecto de este change |
| Primera integración real de React Query introduce fricción de configuración no anticipada (`QueryClientProvider`, manejo de errores/reintentos por defecto) | Media | Alcance de este change incluye explícitamente esa configuración mínima como trabajo real, no como supuesto de "ya existe" |
| `recharts` no cubre un caso de estilo/accesibilidad que aparezca en `sdd-design` | Baja | Es SVG estándar, estilable con CSS/Tailwind; cualquier ajuste fino es iteración de diseño, no bloqueo de librería |
| Confusión de alcance con #17 (cierre/actas) si un cambio futuro no lee esta propuesta | Media | Declarado explícitamente arriba ("Fuera de alcance"): #16 es solo la vista en vivo durante `abierto` |
| Reutilizar `REDIS_CLIENT` acopla el módulo de resultados a la disponibilidad de Redis, que hoy ya es una dependencia dura de sesiones | Baja | Redis ya es dependencia dura del backend (sesiones); este change no añade una nueva superficie de falla, reutiliza una existente |

## Rollback Plan

Greenfield, sin datos de producción. Sin migraciones de schema (todo el modelo de datos ya existe
desde #2/#13/#14). El rollback es exclusivamente de código de aplicación: `git revert` del endpoint,
del hook y de las dependencias nuevas de `package.json` no deja estado huérfano — Redis solo
almacena claves con TTL corto que expiran solas, y ningún dato persistente en Postgres se escribe
desde este change (es de solo lectura). Si `recharts` o `@tanstack/react-query` resultan
inadecuadas en `sdd-design`, pueden reemplazarse sin afectar el contrato del endpoint backend.

## Dependencies

- `#13` (`apertura-proceso-congelamiento-padron`) — provee `DerechoVoto` congelado y
  `ocultar_resultados` inmutable; ya implementado y archivado.
- `#14` (`vote-casting`) — provee las filas `Voto` que este change agrega; ya implementado y
  archivado.
- `REDIS_CLIENT`/`ioredis` (`apps/backend/src/redis/redis.provider.ts`) — ya existe, se reutiliza
  tal cual.

## Success Criteria

- [ ] `GET /procesos/:id/resultados` responde `200` para cualquier rol de votante autenticado con
      `DerechoVoto` en el proceso, sin restricción de `@Roles()`
- [ ] Con `ocultar_resultados = true`, la respuesta contiene únicamente `votos_emitidos`,
      `padron_total`, `estado_visibilidad`, `resultados_ocultos_por_configuracion` y
      `hora_servidor` — verificado que ningún campo de desglose por candidato/lista/opción/aula
      esté presente
- [ ] Con `ocultar_resultados = false`, la respuesta incluye además el desglose por
      candidato/lista/opción, con nulos siempre en 0
- [ ] `padron_total` se deriva de `count(DerechoVoto)` y nunca de `Matricula`/`Usuario` en vivo
- [ ] Una segunda lectura dentro de los 8 s siguientes no genera una nueva consulta a Postgres
      (verificable por instrumentación/spy en pruebas de integración)
- [ ] `hora_servidor` viaja en cada respuesta, sellada con `now()`/`clock_timestamp()` de Postgres
- [ ] `@tanstack/react-query` está instalado y configurado con `QueryClientProvider`; el hook nuevo
      de resultados hace polling dentro del rango 10-30 s
- [ ] `recharts` renderiza gráficos de barras y pastel solo cuando `estado_visibilidad = "visible"`
- [ ] `usePadronEnVivo.ts` no tiene ningún cambio de línea en este change

## Proposal question round

La sesión corre en modo automático: no se abre una ronda de preguntas al usuario en esta fase. Las
cinco preguntas que `exploration.md` había dejado explícitamente abiertas (forma del payload oculto,
audiencia y campo de comité, mecanismo de caché, librería de gráficos, alcance de
`usePadronEnVivo.ts`) se resolvieron arriba con justificación trazable a fuentes ya leídas del
repo (ADR-0005, ADR-0008, TECH-DESIGN.md Flujo 4, y el código real de `redis.provider.ts`/
`session.service.ts`/`package.json`). Quedan como decisiones menores, explícitamente diferidas a
`sdd-design` por no ser bloqueantes para el alcance: el nombre final del método/módulo
(`ResultadosService` vs. extensión de `procesos.service.ts`, controlador propio vs. compartido) y
el nombre exacto del hook/carpeta frontend. Si el usuario prefiere resolver alguna de las cinco
decisiones de forma distinta a la adoptada aquí, puede indicarlo antes de continuar a `sdd-spec`/
`sdd-design`.
