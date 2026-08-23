# Exploración: dashboard-panel-jornada (Backlog #20 — Dashboard y panel de jornada)

## Estado actual

No existe hoy ningún dashboard/panel de jornada en el código (ni backend ni frontend). El precedente directo y más reutilizable es `resultados-en-vivo` (#16, ya archivado):

- **Backend** (`apps/backend/src/procesos/resultados.controller.ts`, `resultados.service.ts`, `resultados-cache.ts`): `GET /procesos/:id/resultados` — controlador hermano de `ProcesosController` con `@UseGuards(AuthGuard)` (sin `RolesGuard`, audiencia amplia: cualquier votante con `DerechoVoto`). Caché en Redis con TTL 8 s (`resultados-cache.ts`), clave `resultados:{procesoId}` con auto-chequeo anticontaminación. La visibilidad ("ocultar resultados hasta el cierre") se evalúa **en el servidor** (ADR-0005): si `ocultar_resultados=true`, el payload nunca lleva desglose por candidato, solo participación.
- **Frontend** (`apps/frontend/src/resultados/`): `useResultadosEnVivo.ts` — hook de React Query con `refetchInterval: INTERVALO_SONDEO_MS` (15 s, exportado explícitamente para que una vista de proyección futura lo pueda sobrescribir por vista, según ADR-0005 "configurable por vista"). `ResultadosPage.tsx` monta `PanelParticipacion` (siempre) + `GraficoDesglose` o `AvisoResultadosOcultos` según `estado_visibilidad`. `PanelParticipacion.tsx` calcula el porcentaje de participación **en el cliente** a partir de `votosEmitidos`/`padronTotal` que manda el servidor (`abstenciones = padronTotal - votosEmitidos`, `porcentaje = votosEmitidos/padronTotal*100`) — mismo patrón de cálculo que aplicaría a "porcentaje de participación" del dashboard.

**ProcesoElectoral / procesos activos**: `EstadoProceso` (schema.prisma) = `borrador | abierto | cerrado | acta_emitida`. `ProcesosService.listar(filtros)` (`apps/backend/src/procesos/procesos.service.ts:456`) YA acepta `filtros.estado` y hace `prisma.procesoElectoral.findMany({ where: { estado } })`. **"Procesos activos" = `GET /procesos?estado=abierto`, ya existe, sin trabajo backend adicional para esa porción.**

**Estudiantes y padres**: `Usuario.rol` (enum `RolUsuario`) incluye `estudiante`. `Apoderado` es tabla aparte (`id, nombres, dni, correo, usuario_id → Usuario`), gestionada vía `apoderados.controller.ts` (`GET/POST/PATCH/DELETE /usuarios/:usuarioId/apoderados`, solo `administrador`/`director`). **No existe ningún endpoint que agregue/cuente** estudiantes ni padres — `listarUsuarios` (`apps/frontend/src/usuarios/usuarios-api.ts`) devuelve arrays, sin totales. Un `Apoderado` está atado a un único `usuario_id`: un mismo padre con varios hijos matriculados produce varias filas `Apoderado` (una por estudiante) — no hay deduplicación por DNI. Esto es una decisión abierta para `sdd-propose`: ¿contar filas `Apoderado` crudas o padres distintos por DNI?

**JobCorreo / correos fallidos**: `EstadoJobCorreo` = `pendiente | enviado | fallido`. `JobCorreo` se crea **exclusivamente** en `votos.service.ts` (`tx.jobCorreo.create(...)`, al confirmar un voto, dentro de la misma transacción) y siempre lleva `proceso_id` — nunca se usa para otro tipo de correo (recuperación, notificaciones, etc., a la fecha). El estado `fallido` lo escribe únicamente el listener `worker.on('failed')` en `apps/worker/src/main.ts`/`outbox-correo.repo.ts` cuando BullMQ agota los 5 reintentos (`despacharLoteOutbox`, `outbox-dispatcher.ts`). **No hay ningún controlador HTTP que exponga lectura de `JobCorreo`** — el "contador de correos fallidos" del dashboard necesita un endpoint backend nuevo, naturalmente scoped por proceso: `prisma.jobCorreo.count({ where: { proceso_id, estado: 'fallido' } })`.

**Navegación/routing post-login (#25)**: `MENU_POR_ROL` (`apps/frontend/src/app/menu-por-rol.ts`) es un `Record<RolSesion, ItemMenu[]>` totalizado por rol (rompe en compilación si falta un rol); `Enrutador.tsx` es un `switch` sobre `ruta.nombre` montado dentro de `AuthGuard > AppShell`. Agregar un ítem `panel-jornada` es mecánico: nueva `Ruta`, entrada en `MENU_POR_ROL` para los roles que correspondan, y un `case` nuevo en el switch — sigue exactamente el patrón usado para `academica`/`usuarios`/`configuracion`.

**"Modo proyección"**: no implementado todavía, pero está **explícitamente diseñado** en ADR-0005 y `Design.md` vista `3a`: pantalla grande, sin controles interactivos, auto-refresh por polling (mismo mecanismo que `useResultadosEnVivo`, "intervalo configurable por vista" según ADR-0005), mostrando participación + votos + aulas rezagadas — **deliberadamente sin resultados por candidato**, para no influir en votantes que aún no votaron.

**Nota de alcance**: `Design.md` vista `1e` ("panel de jornada") pide además "votos por hora" y "avance por aula (rezagadas en magenta)", que **no** están en el alcance declarado de backlog #20 (fila #20 solo lista: procesos activos, cantidad de estudiantes y padres, % de participación, resultados rápidos, contador de correos fallidos, modo proyección). Es una decisión explícita a resolver en `sdd-propose`: alcance reducido de #20 tal cual está en BACKLOG.md, o expandir al `1e` completo de `Design.md`.

## Áreas afectadas

- `apps/backend/src/procesos/procesos.controller.ts`, `procesos.service.ts` — reutilizable sin cambios para "procesos activos" (`?estado=abierto`).
- Backend nuevo (posible módulo `dashboard/` o extensión de `procesos/`) — endpoint(s) de agregación: conteo estudiantes/padres, conteo correos fallidos, quizá % participación agregado si se quiere multi-proceso.
- `apps/backend/prisma/schema.prisma` — sin cambios de esquema previstos; todos los campos necesarios (`estado`, `rol`, `estado` de `JobCorreo`) ya existen.
- `apps/frontend/src/resultados/useResultadosEnVivo.ts` — patrón de hook de polling a clonar/parametrizar para el nuevo endpoint del dashboard.
- `apps/frontend/src/resultados/piezas/PanelParticipacion.tsx` — patrón de cálculo de % participación reutilizable tal cual.
- `apps/frontend/src/app/menu-por-rol.ts`, `Enrutador.tsx`, `rutas.ts` — nueva ruta/ítem de menú `panel-jornada` (y posiblemente `proyeccion`).
- Nueva página frontend (dashboard) — a definir en `sdd-propose`.

## Enfoques posibles

1. **Endpoint único de agregación por proceso** — `GET /procesos/:id/panel-jornada` que devuelve en un solo payload: procesos activos (o se resuelve aparte con el `GET /procesos?estado=abierto` ya existente), estudiantes, padres, % participación, resultados rápidos, correos fallidos.
   - Pros: un solo hook de polling en el frontend, coherente con el patrón `resultados.controller.ts`; menos requests.
   - Contras: mezcla conteos globales (estudiantes/padres de toda la institución) con datos scoped a un proceso (correos fallidos, participación) — el shape de la respuesta necesita distinguir ambos.
   - Esfuerzo: Medio.

2. **Endpoints separados** — reutilizar `GET /procesos?estado=abierto` tal cual, y agregar 2-3 endpoints chicos y enfocados (conteo usuarios por rol, conteo `JobCorreo` fallidos por proceso).
   - Pros: cada endpoint es simple, testeable aislado, sigue el estilo ya usado en el repo (controladores chicos por sub-dominio, ver `ActasController`, `ApoderadosController`).
   - Contras: el frontend necesita orquestar varios hooks de polling (o un solo componente contenedor que dispare varios `useQuery`).
   - Esfuerzo: Medio (similar al anterior, pero más módulos pequeños en vez de uno grande).

3. **Modo proyección como vista separada vs. flag en la misma página** — proyección podría ser una `Ruta` nueva (`/proyeccion`) sin sidebar/controles, o el mismo dashboard con un toggle "pantalla completa" que oculta chrome.
   - Ruta separada: más simple de razonar (nunca expone controles por accidente, coincide con "para pantalla grande" del Design.md 3a); reutiliza el mismo hook de polling con distinto payload (sin desglose por candidato).
   - Toggle en la misma página: menos código nuevo, pero riesgo de fuga de controles/datos sensibles si el toggle falla.
   - Esfuerzo: Bajo-Medio, se decide en `sdd-propose`/`sdd-design`.

## Recomendación

Enfoque 2 (endpoints separados, reutilizando `GET /procesos?estado=abierto` sin cambios) + Enfoque 3 con ruta separada para modo proyección (`Ruta` nueva, sin controles, mismo hook de polling parametrizado). Es el camino de menor esfuerzo y mayor coherencia con los patrones ya existentes (`resultados-en-vivo`, `ActasController`, `menu-por-rol.ts`). El punto de diseño real a cerrar en `sdd-propose`/`sdd-design` es: (a) alcance exacto (backlog #20 reducido vs. `Design.md` 1e completo), (b) qué roles ven el panel de jornada (candidato natural: `administrador`, `director`, `comite`, espejando la audiencia de `ProcesosController`/`ActasController`), y (c) si "padres" cuenta filas `Apoderado` o DNIs distintos.

## Riesgos

- Ambigüedad de alcance: backlog #20 es más chico que `Design.md` 1e (falta "votos por hora"/"avance por aula") — si no se aclara en `sdd-propose`, el `sdd-design` puede sub o sobre-construir.
- Conteo de "padres": sin deduplicación por DNI, un padre con 3 hijos cuenta como 3 — puede no ser la métrica que el usuario espera ("cantidad de padres" vs. "cantidad de vínculos padre-estudiante").
- Ninguna decisión de negocio debe evaluarse en el cliente (regla derivada de ADR-0005) — el modo proyección debe recibir del servidor un payload ya filtrado (sin resultados por candidato), nunca ocultar candidato en el cliente.
- Nuevo endpoint de correos fallidos es superficie de datos operacionales nueva — definir en `sdd-propose`/`sdd-spec` qué roles pueden verlo (probablemente los mismos que ven el panel de jornada, no la audiencia amplia de `ResultadosController`).

## Listo para propuesta

Sí, con las tres decisiones abiertas señaladas arriba (alcance 1e vs #20, roles con acceso, definición de "padres") a resolver explícitamente en `sdd-propose`.
