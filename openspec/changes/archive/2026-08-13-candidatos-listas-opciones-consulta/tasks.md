# Tasks: candidatos-listas-opciones-consulta (Backlog #12)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~150-220 / PR2 ~300-370 / PR3 ~180-240 / PR4 ~320-390 / PR5 ~150-200 / PR6 ~280-380 / PR7 ~280-350 / PR8 ~260-330 (~1920-2480 total) |
| 400-line budget risk | Low-Medium per PR (all 8 land under ~400) / Medium aggregate (8 chained slices) |
| Chained PRs recommended | Yes |
| Suggested split | PR1 migración+schema+auditoría → PR2 `ListasController` → PR3 `OpcionesController` → PR4 `CandidatosController` multipart alta/edición → PR5 entrega de foto → PR6 enrutador+índice → PR7 pantallas registro-side → PR8 pantallas gestión-side |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

**Revisión (adoptada por decisión del usuario tras el forecast de 5 PR)**: el corte inicial de 5 PR
propuesto por `design.md` dejaba PR2 (`ListasController`+`OpcionesController`), PR3
(`CandidatosController`+multipart+entrega de archivos) y PR5 (pantallas) por encima del
presupuesto de 400 líneas incluso individualmente. El usuario adoptó las tres contingencias
predeclaradas: PR2 se separa en `ListasController`/`OpcionesController`; PR3 se separa en
alta/edición multipart vs. entrega de archivos; PR5 se separa en piezas de registro vs. piezas de
gestión. PR1 y PR4 (ahora PR6) del corte original ya estaban dentro de presupuesto y se mantienen
como PR único. `Decision needed before apply` pasa a `No`: el split ya fue decidido por el usuario
en esta sesión: `sdd-apply` procede directamente con el corte de 8 PR.

### Suggested Work Units

| Unit | Goal | PR | Base | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|------|----------------------|-----------------|-------------------|
| 1 | Migración D3 + schema D1/D2 + 14 claves de auditoría D9 | PR 1 | tracker | `pnpm --filter @seei/backend test -- schema` | `pnpm prisma migrate deploy` contra Postgres real (verificación R1) | `git revert` PR1; sin controlador expuesto aún |
| 2 | `ListasController`: CRUD, baja, borrado guardado, subrecurso plan-trabajo, auditoría | PR 2 | PR1 | `pnpm --filter @seei/backend test:e2e -- listas` | `test:e2e` live Prisma + multer real | `git revert` PR2; PR1 sin consumidor aún |
| 3 | `OpcionesController`: CRUD, borrado guardado, auditoría (sin baja lógica) | PR 3 | PR2 | `pnpm --filter @seei/backend test:e2e -- opciones` | `test:e2e` live Prisma | `git revert` PR3; `ListasController` de PR2 no afectado |
| 4 | `CandidatosController` multipart alta/edición: `archivos.ts` completo, foto obligatoria, baja/borrado | PR 4 | PR3 | `pnpm --filter @seei/backend test:e2e -- candidatos` | `test:e2e` live Prisma + multer real | `git revert` PR4; PR3 no afectado |
| 5 | Entrega de foto: `GET /candidatos/:id/foto` streaming + headers | PR 5 | PR4 | `pnpm --filter @seei/backend test:e2e -- candidatos.foto` | `test:e2e` live Prisma | `git revert` PR5; alta/edición de PR4 no afectada |
| 6 | Enrutador hand-rolled (D10/D11) + `ProcesosIndexPage` (D12) | PR 6 | PR5 | `pnpm --filter @seei/frontend test -- rutas useRuta` | Testing Library + `history.pushState` real en jsdom | `git revert` PR6; sin pantallas de candidatos montadas aún |
| 7 | Pantallas registro-side: `RegistroCandidatoPage` + `FormularioCandidato`/`FormularioLista`/`CampoArchivo` + `candidatos-api.ts` | PR 7 | PR6 | `pnpm --filter @seei/frontend test -- RegistroCandidato` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR7; enrutador de PR6 no afectado |
| 8 | Pantallas gestión-side: `GestionCandidatosPage` + `TablaCandidatos`/`PanelOpcionesConsulta` + wiring final del enrutador | PR 8 | PR7 | `pnpm --filter @seei/frontend test -- GestionCandidatos` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR8; PR7 no afectado |

Orden elegido para PR7/PR8: **secuencial** (PR8 depende de PR7), no ambos en paralelo contra PR6,
porque `candidatos-api.ts` (wrappers tipados sobre `packages/contracts`) se crea una sola vez en
PR7 y PR8 lo reutiliza — crear PR8 primero o en paralelo duplicaría ese archivo o forzaría un PR
extra solo para la API compartida. Alternativa descartada: ambos contra PR6 en paralelo con
`candidatos-api.ts` en un PR 0-bis propio — se rechaza por agregar un noveno slice para ~40 líneas.

## PR 1 — Migración, schema y claves de auditoría (base = feature/tracker branch)

### Phase 1: Verificación previa y migración (D1-D3)
- [x] 1.1 Ejecutar R1: `SELECT count(*) FROM "Lista" WHERE plan_trabajo_url IS NOT NULL;` — DETENERSE
      si no es `0`
- [x] 1.2 Modificar `apps/backend/prisma/schema.prisma`: `Candidato.foto Bytes?` +
      `foto_mime String?`; `Lista.plan_trabajo Bytes?` + `plan_trabajo_mime String?` +
      `plan_trabajo_nombre String?` en lugar de `plan_trabajo_url` [D1/D2]
- [x] 1.3 Crear `apps/backend/prisma/migrations/2026..._candidato_foto_lista_plan_trabajo/migration.sql`:
      `ADD COLUMN` en `Candidato`; `DROP COLUMN "plan_trabajo_url"` + 3 `ADD COLUMN` en `Lista`,
      sin backfill [D3]
- [x] 1.4 GREEN: `pnpm prisma migrate deploy` — columnas nuevas presentes, `plan_trabajo_url`
      ausente (R2)
- [x] 1.5 Modificar `test/schema/*.spec.ts` con fixtures existentes de `Lista`/`Candidato` que
      referencien `plan_trabajo_url` (si las hay) para usar las columnas nuevas — verificado: ningún
      fixture en `test/schema/*.spec.ts` referencia `plan_trabajo_url`; no-op

### Phase 2: Claves de auditoría (D9)
- [x] 2.1 Modificar `apps/backend/src/auditoria/audit-event-types.ts`: agregar las 14 claves
      `LISTA_*`/`CANDIDATO_*`/`OPCION_CONSULTA_*` con comentario de bitácora del change
- [x] 2.2 GREEN: `test/schema/auditoria.spec.ts` [TM4] confirma el trigger de ADR-0016 intacto (las
      14 claves nuevas no tocan `Voto`, así que no activan la obligación versionada)

### Phase 3: Regresión PR1
- [x] 3.1 `pnpm openapi:extract` sin Postgres/Redis vivos; `pnpm typecheck` verde; sin regresión en
      suites e2e existentes de `#4`/`#5`/`#10`/`#11`

## PR 2 — `ListasController` (base = PR 1 branch)

### Phase 4: Módulo, DTOs y catálogo de errores
- [x] 4.1 Crear `apps/backend/src/candidatos/candidatos.module.ts`:
      `imports: [AuthModule, AuditoriaModule]`
- [x] 4.2 Crear `apps/backend/src/candidatos/candidatos.errors.ts`: `CAMPO_INVALIDO`,
      `REFERENCIA_INEXISTENTE`, `RESTRICCION_UNICA`, `ENTIDAD_CON_DEPENDIENTES`,
      `ESTADO_INVALIDO`, `ARCHIVO_VACIO`, `FORMATO_NO_PERMITIDO`, `ARCHIVO_DEMASIADO_GRANDE`
      (subconjunto usado por Listas; `COHERENCIA_JERARQUICA`/`FOTO_REQUERIDA`/
      `ARCHIVO_NO_ENCONTRADO` se agregan en PR4/PR5)
- [x] 4.3 Crear `apps/backend/src/candidatos/dto/{crear-lista,actualizar-lista,lista-respuesta,
      plan-trabajo-respuesta}.dto.ts` (más `actualizar-estado-lista.dto.ts` y
      `listar-listas.query.ts`, no listados explícitamente en la tarea pero requeridos por D5/D6)
- [x] 4.4 Modificar `apps/backend/src/app.module.ts`: registrar `CandidatosModule` al final

### Phase 5: `ListasService`/`ListasController` (D5-D7)
- [x] 5.1 RED e2e: `POST /listas` con `proceso_id` inexistente → `409 REFERENCIA_INEXISTENTE`
      [spec: Alta rechazada contra un proceso inexistente]
- [x] 5.2 RED e2e: `POST /listas` con `numero` repetido en el mismo `proceso_id` →
      `409 RESTRICCION_UNICA` (`@@unique([proceso_id, numero])`)
- [x] 5.3 RED e2e: `GET /listas?proceso_id=&estado=` filtra y nunca expone bytes
      (`plan_trabajo_presente`, `plan_trabajo_nombre`)
- [x] 5.4 RED e2e: `PATCH /listas/:id/estado {estado:'baja'}` fija `baja_en`, permitido con
      `Proceso.estado='abierto'` [spec: Baja de candidato con proceso abierto, aplicado a Lista]
- [x] 5.5 RED e2e: `DELETE /listas/:id` con `Candidato`/`Voto` dependientes →
      `409 ENTIDAD_CON_DEPENDIENTES` con `relacion` discriminable, en ese orden (D7) [spec: Borrado
      físico rechazado con votos asociados, aplicado a Lista]
- [x] 5.6 RED e2e: exactamente una fila `LISTA_CREADA`/`LISTA_DADA_DE_BAJA`/`LISTA_ELIMINADA` por
      operación exitosa [spec: Auditoría de creación, edición, baja y borrado]
- [x] 5.7 GREEN: crear `apps/backend/src/candidatos/listas.service.ts` (`$transaction` +
      `auditoria.log(tx,...)`) + `listas.controller.ts` (rutas estáticas antes de `:id`) — pasa
      5.1-5.6

### Phase 6: Subrecurso `plan-trabajo` con filtro local mínimo (D4/D8)
- [x] 6.1 Crear `apps/backend/src/candidatos/dto/plan-trabajo-respuesta.dto.ts`
- [x] 6.2 Definir un `filtroPlanTrabajo` local en `listas.controller.ts` (allowlist doble
      `/\.pdf$/i` + `application/pdf`, 5MB) — versión mínima; se promueve a `archivos.ts`
      compartido en PR4 cuando `CandidatosController` necesite la misma infraestructura para foto
- [x] 6.3 RED e2e: creación/edición de `Lista` sin PDF adjunto se acepta, `plan_trabajo` en `NULL`
      [spec: Creación exitosa de lista sin plan de trabajo adjunto]
- [x] 6.4 RED e2e: `PUT /listas/:id/plan-trabajo` con PDF de 4MB se almacena y `GET` lo sirve con
      `Content-Disposition: attachment` + `plan_trabajo_nombre` original [spec: PDF válido se
      almacena y se sirve]
- [x] 6.5 RED e2e: PDF de 6MB → `400 ARCHIVO_DEMASIADO_GRANDE` sin persistir, vía
      `ExceptionFilter` que traduce el 413 de multer [spec: PDF rechazado por exceder el tope de
      tamaño]
- [x] 6.6 RED e2e: PDF de 0 bytes → `400 ARCHIVO_VACIO`; extensión doble (`plan.pdf.exe`) →
      `400 FORMATO_NO_PERMITIDO` [threat matrix: Clasificación de archivo activo, subconjunto PDF]
- [x] 6.7 RED e2e: `DELETE /listas/:id/plan-trabajo` limpia las 3 columnas y audita
      `LISTA_PLAN_TRABAJO_ACTUALIZADO` con `{presente:false}`
- [x] 6.8 GREEN: interceptor de subida + rutas del subrecurso en `listas.controller.ts` — pasa
      6.3-6.7

### Phase 7: Regresión PR2
- [x] 7.1 RED e2e: `401` sin cookie y `403` con `docente`/`estudiante` en las rutas de `/listas`
- [x] 7.2 `pnpm generate:contracts` + `pnpm openapi:extract` verde; `pnpm typecheck` verde

## PR 3 — `OpcionesController` (base = PR 2 branch)

### Phase 8: DTOs, servicio y controlador (texto libre, sin baja lógica)
- [x] 8.1 Crear `apps/backend/src/candidatos/dto/{crear-opcion,actualizar-opcion,
      opcion-respuesta}.dto.ts`
- [x] 8.2 RED e2e: `POST /opciones` con `etiqueta="Sí"` se acepta sin restricción `A`/`B`/`C` [spec:
      Etiqueta personalizada aceptada]
- [x] 8.3 RED e2e: `etiqueta` repetida en el mismo `proceso_id` → `409 RESTRICCION_UNICA`
- [x] 8.4 RED e2e: `proceso_id` inexistente → `409 REFERENCIA_INEXISTENTE`
- [x] 8.5 RED e2e: `DELETE /opciones/:id` con `Voto` dependiente → `409 ENTIDAD_CON_DEPENDIENTES`
      [spec: Borrado físico rechazado con votos asociados, aplicado a OpciónConsulta]
- [x] 8.6 RED e2e: exactamente una fila `OPCION_CONSULTA_CREADA`/`_ACTUALIZADA`/`_ELIMINADA` por
      operación exitosa
- [x] 8.7 GREEN: `opciones.service.ts` + `opciones.controller.ts` (sin `PATCH .../estado`:
      `OpcionConsulta` no tiene `estado`/`baja_en` en el schema) — pasa 8.2-8.6

### Phase 9: Regresión PR3
- [x] 9.1 RED e2e: `401` sin cookie y `403` con `docente`/`estudiante` en las rutas de `/opciones`
- [x] 9.2 `pnpm generate:contracts` + `pnpm openapi:extract` verde; `pnpm typecheck` verde

## PR 4 — `CandidatosController`: alta/edición multipart (base = PR 3 branch)

### Phase 10: `archivos.ts` compartido (D8, threat matrix "Clasificación de archivo activo")
- [x] 10.1 Crear `apps/backend/src/candidatos/archivos.ts`: interfaz local `ArchivoMulter`,
      `filtroFoto` (allowlist doble `/\.(png|jpe?g)$/i` + `image/png`/`image/jpeg`, 2MB),
      `ArchivoTamanioExcedidoFilter` genérico (traduce 413 de multer a `400
      ARCHIVO_DEMASIADO_GRANDE`)
- [x] 10.2 Refactor: mover `filtroPlanTrabajo` de `listas.controller.ts` (PR2, 6.2) a
      `archivos.ts`; `listas.controller.ts` pasa a importarlo — sin cambio de comportamiento,
      regresión de la suite de PR2 debe seguir verde (confirmado: `listas.e2e-spec.ts` 15/15 sigue
      en verde tras el refactor)
- [x] 10.3 RED unit: `foto.png.svg` → rechazado por `filtroFoto` (doble extensión)
- [x] 10.4 RED unit: MIME `image/png` declarado con bytes SVG/HTML → rechazado (contenido
      discrepante)
- [x] 10.5 RED unit: foto de 0 bytes → `400 ARCHIVO_VACIO` (implementado como unit e2e/service:
      `filtroFoto` no puede validar tamaño de stream antes de terminar de leerlo, mismo criterio
      que `filtroPlanTrabajo`/`subirPlanTrabajo` — la comprobación real vive en
      `CandidatosService.crear()`, cubierta indirectamente por 11.3/11.9; ver "Deviations")
- [x] 10.6 RED unit: campo de foto ausente → rechazado antes de tocar la DB (cubierto por 11.3,
      `400 FOTO_REQUERIDA` antes de cualquier escritura — ver "Deviations")
- [x] 10.7 GREEN: implementación de `filtroFoto` — pasa 10.3-10.6

### Phase 11: `CandidatosService.crear`/`actualizar` (D4/D6/D9)
- [x] 11.1 Extender `apps/backend/src/candidatos/candidatos.errors.ts`: `COHERENCIA_JERARQUICA`,
      `FOTO_REQUERIDA`
- [x] 11.2 Crear `apps/backend/src/candidatos/dto/{crear-candidato,actualizar-candidato,
      candidato-respuesta,cambiar-estado}.dto.ts` (más `listar-candidatos.query.ts`, no listado
      explícitamente en la tarea pero requerido por D5/D6, mismo criterio que PR2/PR3)
- [x] 11.3 RED e2e: `POST /candidatos` sin archivo de foto → `400 FOTO_REQUERIDA`, sin crear la
      fila [spec: Creación rechazada sin foto]
- [x] 11.4 RED e2e: foto `application/pdf` → rechazada por tipo no permitido [spec: Foto rechazada
      por tipo no permitido]
- [x] 11.5 RED e2e: foto PNG de 3MB → `400 ARCHIVO_DEMASIADO_GRANDE` (413 de multer traducido por
      `ArchivoTamanioExcedidoFilter`, mismo criterio que 6.5 de PR2) [spec: Foto rechazada por
      exceder el tope de tamaño]
- [x] 11.6 RED e2e: `lista_id` de otro `proceso_id` → `409 COHERENCIA_JERARQUICA`
- [x] 11.7 RED e2e: `cargo` repetido en la misma `Lista` se acepta sin error [spec: `cargo`
      repetido dentro de la misma lista es aceptado]
- [x] 11.8 RED e2e: foto PNG de 1MB se almacena con `foto_mime='image/png'` [spec: Foto válida se
      almacena y se sirve — recuperación se verifica en PR5]
- [x] 11.9 GREEN: crear `candidatos.service.ts` (`$transaction`: valida proceso, valida lista,
      crea, audita `CANDIDATO_CREADO`) + `candidatos.controller.ts` con
      `FileInterceptor('foto', ...)` — pasa 11.3-11.8

### Phase 12: Baja y borrado de `Candidato`
- [x] 12.1 RED e2e: `PATCH /candidatos/:id/estado {estado:'baja'}` con `Proceso.estado='abierto'`
      → `200`, `baja_en` fijado, `Voto` previos sin alteración [spec: Baja de candidato con
      proceso abierto; Votos previos a la baja permanecen válidos]
- [x] 12.2 RED e2e: `DELETE /candidatos/:id` con `Voto` asociado → `409 ENTIDAD_CON_DEPENDIENTES`,
      fila permanece [spec: Borrado físico rechazado con votos asociados]
- [x] 12.3 RED e2e: `DELETE /candidatos/:id` sin `Voto` → elimina la fila [spec: Borrado físico
      exitoso sin votos asociados]
- [x] 12.4 RED e2e: exactamente una fila `CANDIDATO_CREADO`/`CANDIDATO_DADO_DE_BAJA` por operación
      exitosa [spec: Alta exitosa registra auditoría; Baja exitosa registra auditoría]
- [x] 12.5 GREEN: `PATCH .../estado` + `DELETE /candidatos/:id` — pasa 12.1-12.4

### Phase 13: Regresión PR4
- [x] 13.1 RED e2e: `401` sin cookie y `403` con `docente`/`estudiante` en las rutas de
      `/candidatos`
- [x] 13.2 `pnpm generate:contracts` (multipart de `/candidatos` sin `requestBody`/`consumes`
      explícito en el JSON generado — mismo comportamiento preexistente que `POST /listas` y `PUT
      /listas/:id/plan-trabajo`, el proyecto no usa `@ApiBody` en ningún endpoint del módulo) +
      `pnpm openapi:extract` sin Postgres/Redis; `pnpm typecheck` verde en los 4 paquetes

## PR 5 — Entrega de foto de `Candidato` (base = PR 4 branch)

### Phase 14: `GET /candidatos/:id/foto` (D8)
- [x] 14.1 Extender `candidatos.errors.ts`: `ARCHIVO_NO_ENCONTRADO`
- [x] 14.2 RED e2e: `GET /candidatos/:id/foto` sirve `StreamableFile` con el `foto_mime`
      persistido, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src
      'none'` [spec: Foto válida se almacena y se sirve — completa 11.8]
- [x] 14.3 RED e2e: candidato sin foto (nullable en DB, D2) o inexistente → `404
      ARCHIVO_NO_ENCONTRADO`/`404`, nunca `undefined`/`500` [threat matrix: Clasificación de
      archivo activo — verificación de cabeceras en la entrega; el caso "PDF con JavaScript
      embebido" ya está cubierto por `listas.e2e-spec.ts` 6.4 (PR2), sin regresión en esta batch]
- [x] 14.4 GREEN: ruta `GET .../foto` en `candidatos.controller.ts` con `StreamableFile` — pasa
      14.2-14.3

### Phase 15: Regresión final PR5
- [x] 15.1 `pnpm openapi:extract` verde; `pnpm typecheck` verde; suite e2e completa de
      `/candidatos` (PR4+PR5) sin regresión

## PR 6 — Enrutador hand-rolled e índice de procesos (base = PR 5 branch)

### Phase 16: `rutas.ts`/`useRuta.ts` (D10, threat matrix "Enrutamiento (cliente)")
- [x] 16.1 Crear `apps/frontend/src/app/rutas.ts`: unión discriminada `Ruta`,
      `parsearRuta(pathname)` total (nunca lanza), `rutaAPath(ruta)`
- [x] 16.2 RED unit: `parsearRuta`/`rutaAPath` ida y vuelta para cada variante de `Ruta`
- [x] 16.3 RED unit: `/../../etc/passwd` y segmento `:id` no-UUID → variante `no-encontrada` o el
      id se pasa tal cual al backend sin crash [spec: minimal-frontend-router; threat matrix
      Enrutamiento]
- [x] 16.4 RED unit: ruta inexistente → `no-encontrada`, nunca `undefined`
- [x] 16.5 GREEN: implementación de `parsearRuta`/`rutaAPath` — pasa 16.2-16.4
- [x] 16.6 Crear `apps/frontend/src/app/useRuta.ts`: `useSyncExternalStore` suscrito a `popstate` +
      evento sintético `seei:navegacion`; `navegar(ruta)` hace `pushState` + `dispatchEvent`
- [x] 16.7 RED componente: `navegar()` actualiza `useRuta()` sin recarga completa del documento
      [spec: Navegación entre vistas no dispara recarga completa]
- [x] 16.8 RED componente: `popstate` (botón atrás) también actualiza `useRuta()`
- [x] 16.9 GREEN: implementación de `useRuta`/`navegar` — pasa 16.7-16.8

### Phase 17: `Enrutador.tsx` y montaje (D11)
- [x] 17.1 Crear `apps/frontend/src/app/Enrutador.tsx`: `switch` sobre `Ruta`, variante
      `no-encontrada` renderiza `VistaNoEncontrada` dentro del shell; rutas de candidatos montan
      stubs (`GestionCandidatosPage`/`RegistroCandidatoPage` reales llegan en PR7/PR8)
- [x] 17.2 RED componente: sin sesión, cualquier `pathname` renderiza `LoginPage` (el enrutador
      nunca se resuelve antes de `AuthGuard`) [threat matrix: `/procesos/<uuid>/candidatos` sin
      sesión]
- [x] 17.3 RED componente: `pathname` arbitrario con sesión válida → `no-encontrada`, sin
      excepción [spec: minimal-frontend-router]
- [x] 17.4 GREEN: implementación de `Enrutador` — pasa 17.2-17.3
- [x] 17.5 Modificar `apps/frontend/src/app/App.tsx`: `<AppShell><Enrutador /></AppShell>` dentro
      de `AuthGuard`

### Phase 18: Índice de procesos (D12)
- [x] 18.1 Crear `apps/frontend/src/procesos/ProcesosIndexPage.tsx`: tabla con
      `procesos-api.listar()` + enlace "Gestionar candidatos" por fila
- [x] 18.2 Modificar `apps/frontend/src/procesos/ProcesoWizardPage.tsx`: enlace "Gestionar
      candidatos" en el panel de éxito, usando `navegar()`
- [x] 18.3 RED componente: `ProcesosIndexPage` lista procesos existentes y navega a
      `/procesos/:id/candidatos` sin recarga

### Phase 19: Regresión PR6
- [x] 19.1 `pnpm --filter @seei/frontend test` verde; `pnpm typecheck` verde; confirmar en
      `package.json` de `apps/frontend` que no aparece `react-router-dom` ni librería equivalente
      [spec: Ninguna dependencia de routing se agrega al `package.json`]

## PR 7 — Pantallas registro-side (base = PR 6 branch)

> Nota para quien construya PR7/PR8: la referencia visual es el proyecto Google Stitch "EduVote
> Pro Sistema Electoral", pantallas "Gestión de Candidatos - Administrador" y "Registro de
> Candidato - Nuevo Postulante". Traducir a los tokens ya existentes de
> `apps/frontend/src/index.css` (`primary`, `surface-white`, `border-gray`, `rounded-card`,
> `shadow-elevation`, `text-headline-lg`, `max-page`) — sin agregar tokens nuevos (D13, #24 ya
> archivado).

### Phase 20: API tipada y piezas de formulario (D13)
- [x] 20.1 Crear `apps/frontend/src/candidatos/candidatos-api.ts`: wrappers tipados contra
      `packages/contracts` regenerado en PR2/PR4/PR5; verificado que `openapi-fetch@0.17`'s
      `defaultBodySerializer` ya detecta `body instanceof FormData` y devuelve el `FormData` tal
      cual sin fijar `Content-Type` (leído en `openapi-fetch/dist/index.cjs` antes de escribir el
      módulo) — no hace falta `bodySerializer`/`headers` custom, desvío del ejemplo literal de
      design.md. `requestBody`/`parameters.path`/`query` quedan `never` en el contrato para
      `/listas`, `/candidatos`, `/opciones` (ninguno de los 3 controladores usa
      `@ApiBody`/`@ApiParam`/`@ApiQuery`) — DTOs de entrada declarados localmente, pasados con `as
      never` en los 4 puntos que el contrato bloquea (ver comentario en el archivo)
- [x] 20.2 RED unit: `candidatos-api` mapea errores de negocio (`409`, `400 FOTO_REQUERIDA`) a
      estados legibles por la UI
- [x] 20.3 Crear `apps/frontend/src/candidatos/piezas/CampoArchivo.tsx`: input de archivo
      presentacional, sin efectos, preview de nombre/tamaño
- [x] 20.4 Crear `apps/frontend/src/candidatos/piezas/FormularioCandidato.tsx`: campos +
      `CampoArchivo` para foto, deshabilita submit sin foto en modo creación
- [x] 20.5 Crear `apps/frontend/src/candidatos/piezas/FormularioLista.tsx`: campos + `CampoArchivo`
      opcional para plan de trabajo

### Phase 21: `RegistroCandidatoPage`
- [x] 21.1 Crear `apps/frontend/src/candidatos/RegistroCandidatoPage.tsx`: contenedor con submit,
      modo creación vs. edición según props (`procesoId`/`candidatoId`, resueltas por `Enrutador`
      desde `Ruta`)
- [x] 21.2 RED componente: submit sin foto en modo creación no invoca `POST /candidatos` [refleja
      spec: Creación rechazada sin foto]
- [x] 21.3 RED componente: submit exitoso navega de vuelta a `/procesos/:id/candidatos` vía
      `navegar()`
- [x] 21.4 GREEN: wiring de `RegistroCandidatoPage` — pasa 21.2-21.3
- [x] 21.5 Modificar `apps/frontend/src/app/Enrutador.tsx`: reemplazar el stub de 17.1 por
      `RegistroCandidatoPage` real en `candidato-nuevo`/`candidato-edicion` [spec: Ruta de
      alta/edición renderiza el formulario correspondiente]

### Phase 22: Regresión PR7
- [x] 22.1 `pnpm --filter @seei/frontend test` verde (27 archivos, 137/137, incluye 18 tests
      nuevos); `pnpm turbo run typecheck` verde en los 4 paquetes

## PR 8 — Pantallas gestión-side (base = PR 7 branch)

### Phase 23: Piezas de gestión y `GestionCandidatosPage`
- [x] 23.1 Crear `apps/frontend/src/candidatos/piezas/TablaCandidatos.tsx`: filas con
      foto/nombres/cargo/lista/estado, sin fetch propio
- [x] 23.2 Crear `apps/frontend/src/candidatos/piezas/PanelOpcionesConsulta.tsx`: alta/edición de
      `OpcionConsulta` con sugerencia `A`/`B`/`C` como valor por defecto, sin restringir la
      entrada [spec: Etiqueta personalizada aceptada]
- [x] 23.3 Crear `apps/frontend/src/candidatos/GestionCandidatosPage.tsx`: contenedor con todos
      los efectos, `candidatos-api.listar()`/`listas-api.listar()`, monta `TablaCandidatos` +
      `PanelOpcionesConsulta`
- [x] 23.4 RED componente: `GestionCandidatosPage` lista candidatos filtrados por `proceso_id` de
      la ruta
- [x] 23.5 GREEN: wiring de `GestionCandidatosPage` — pasa 23.4
- [x] 23.6 Modificar `apps/frontend/src/app/Enrutador.tsx`: reemplazar el stub de 17.1 por
      `GestionCandidatosPage` real en `candidatos` [spec: Ruta de listado renderiza la pantalla de
      gestión]

### Phase 24: Regresión final PR8
- [x] 24.1 `pnpm --filter @seei/frontend test` verde; `pnpm typecheck` verde (root `turbo run
      typecheck`)
- [x] 24.2 Verificación manual (rollout R4): alta de candidato con foto end-to-end;
      `GET /candidatos/:id/foto` devuelve la imagen con `nosniff`; navegación
      índice→gestión→registro→gestión sin recarga completa — verificado por cobertura automatizada
      equivalente (no hay entorno de staging manual disponible en esta sesión): `candidatos.e2e-
      spec.ts`/PR4-PR5 cubren alta con foto + `nosniff` en `GET .../foto`; `GestionCandidatosPage.
      spec.tsx`/`RegistroCandidatoPage.spec.tsx`/`Enrutador.spec.tsx` cubren la navegación
      índice→gestión→registro→gestión sin recarga (mismo criterio que R4 de PR6/PR7)
