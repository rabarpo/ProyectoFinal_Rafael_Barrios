# Tasks: administracion-procesos-electorales (Backlog #11 — Asistente de 4 pasos + login mínimo)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~180 / PR2 ~390 / PR3 ~250 / PR4 ~280 / PR5 ~400 / PR6 ~400 / PR7 ~430 / PR8 ~380 / PR9 ~400 (~3110 total) — estimación de `design.md`, "Corte de PR recomendado" |
| 400-line budget risk | Medium (por PR) / High (agregado: 9 slices, más que los 6 originales por el login mínimo) |
| Chained PRs recommended | Yes |
| Suggested split | Corte fijado por `design.md`: PR1 (contrato `/auth`) → PR2 (login por código) → PR3 (Google) → PR4 (cimientos schema/auditoría) → PR5 (`PadronService`) → PR6 (creación + lote) → PR7 (listado/PATCH/DELETE) → PR8 (wizard pasos 1-2) → PR9 (wizard pasos 3-4 + montaje) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High (agregado; por PR mayormente Medium, PR7 Medio-alto)

El diseño amplió la cadena de 6 a 9 slices por el login mínimo (D8-D10): el `AuthGuard` bloquea
todo lo demás, así que el login se entrega primero (PR1-3), antes de que el resto sea verificable
en navegador. PR1-3 son autónomos de `/procesos` (dependen solo de `#4`/`#5`, ya en `main`).
Contingencia predeclarada por `design.md`: separar `PATCH` del PR7 (mitad más cara) o separar
`AppShell`+`main.tsx` del PR2 si el provider crece — no adoptada por defecto.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Contrato OpenAPI de `/auth` (D9) + proxy dev (D10) | PR 1 | `pnpm --filter @seei/backend test -- auth.controller` | `pnpm openapi:extract` sin Postgres/Redis | `git revert` PR1; sin cambio de runtime |
| 2 | Login por código: provider, guard, shell (D8) | PR 2 | `pnpm --filter @seei/frontend test -- auth` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR2; PR1 sin consumidor aún |
| 3 | Google OAuth en login (D8/D10) | PR 3 | `pnpm --filter @seei/frontend test -- Google` | Testing Library + stub `google.accounts.id` | `git revert` PR3; login por código no afectado |
| 4 | Cimientos: migración `publico_objetivo`/`alcance` (D1), `anioEscolarActivoId()` (D2b), 3 claves de auditoría (D6) | PR 4 | `pnpm --filter @seei/backend test -- prisma-errores` | `test:schema` contra Postgres real | `git revert` PR4; sin controlador expuesto aún |
| 5 | `PadronService` + `POST /procesos/padron` (D2/D3/D4) | PR 5 | `pnpm --filter @seei/backend test:e2e -- padron` | `test:e2e` live Prisma | `git revert` PR5; PR4 sin ruta afectada |
| 6 | `POST /procesos`: creación + lote `ProcesoAula` (D3/D6) | PR 6 | `pnpm --filter @seei/backend test:e2e -- procesos.crear` | `test:e2e` live Prisma | `git revert` PR6; PR5 no afectado |
| 7 | `GET`/`PATCH`/`DELETE` `/procesos` + regeneración de contrato | PR 7 | `pnpm --filter @seei/backend test:e2e -- procesos` | `test:e2e` live Prisma | `git revert` PR7; PR6 no afectado |
| 8 | Wizard frontend: reducer + pasos 1-2 (D7) | PR 8 | `pnpm --filter @seei/frontend test -- wizard-reducer` | Vitest sin DOM + Testing Library | `git revert` PR8; sin montaje en `AppShell` aún |
| 9 | Wizard frontend: `usePadronEnVivo` + pasos 3-4 + montaje | PR 9 | `pnpm --filter @seei/frontend test -- usePadronEnVivo` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR9; PR8 no afectado |

## PR 1 — Contrato de `/auth` (base = feature/tracker branch)

### Phase 1: Decoradores OpenAPI y proxy (D9/D10)
- [x] 1.1 Crear `apps/backend/src/auth/dto/mensaje.dto.ts`: `{ mensaje: string }` [D9]
- [x] 1.2 Crear `apps/backend/src/auth/dto/sesion-usuario.dto.ts`: espejo de `SesionUsuario`
      (`userId`, `rol`, `creadoEn`) [D9]
- [x] 1.3 Modificar `auth.controller.ts`: `@ApiBody`/`@ApiResponse({type})` en `login`, `loginGoogle`,
      `logout`, `whoami` — solo decoradores, sin cambio de runtime [D9]
- [x] 1.4 RED: `test/schema/*` o test de contrato confirma que `/auth/login`/`/auth/google` ya no
      declaran `requestBody?: never` y `whoami` expone `rol`
- [x] 1.5 GREEN: `pnpm generate:contracts` regenera `packages/contracts` — pasa 1.4
- [x] 1.6 Modificar `apps/frontend/vite.config.ts`: `server.proxy['/api'] → http://localhost:3000` [D10]
- [x] 1.7 Regresión: e2e de `#4`/`#5`/`#6` sobre `/auth` sin cambios; `pnpm openapi:extract` sin
      Postgres/Redis vivos

## PR 2 — Login por código (base = PR 1 branch)

### Phase 2: Contexto de sesión y API
- [x] 2.1 Crear `apps/frontend/src/auth/sesion-context.ts`: `createContext` + `useSesion()` (lanza
      sin provider)
- [x] 2.2 Crear `apps/frontend/src/auth/auth-api.ts`: wrappers sobre `createSeeiClient('/api')`;
      mapea `401→'credenciales'`, `409 VINCULACION_REQUERIDA→'vinculacion'`, red→`'red'`
- [x] 2.3 RED unit: mapeo de errores de `auth-api` (401/409/red)
- [x] 2.4 RED unit: reducción de estado del provider (`cargando→autenticado/anonimo`)

### Phase 3: Provider, guard y shell (D8)
- [x] 3.1 Crear `AuthProvider.tsx`: `whoami()` al montar, `login/logout`, expone `alRecibir401()`
- [x] 3.2 Crear `AuthGuard.tsx`: composición `cargando | <LoginPage/> | children`
- [x] 3.3 Crear `AppShell.tsx`: encabezado (rol + logout) + `<main>`
- [x] 3.4 Crear `App.tsx`: `<AuthProvider><AuthGuard><AppShell/></AuthGuard></AuthProvider>`
- [x] 3.5 Modificar `main.tsx`: montar `<App/>`

### Phase 4: Formulario de login (spec: código+contraseña)
- [x] 4.1 Crear `FormularioCredenciales.tsx`: presentacional, `codigo`+`password`, submit
      deshabilitado con campos vacíos
- [x] 4.2 Crear `LoginPage.tsx`: orquesta submit, error, redirección al asistente en 200
- [x] 4.3 RED componente: `whoami` 200 monta el shell, nunca muestra el formulario
- [x] 4.4 RED componente: `whoami` 401 muestra el login
- [x] 4.5 RED componente: campos vacíos no invocan `POST /auth/login`
- [x] 4.6 RED componente: `401` deja el código tecleado, muestra "Credenciales inválidas"
- [x] 4.7 RED componente: "Cerrar sesión" vuelve al login
- [x] 4.8 GREEN: submit + redirección — pasa 4.3-4.7

### Phase 5: Adversarial login (RED obligatorio, D8)
- [x] 5.1 RED adversarial: `401` de `/procesos` (no de auth) también desmonta el asistente
- [x] 5.2 RED adversarial: el asistente nunca renderiza mientras `estado='cargando'`
- [x] 5.3 RED adversarial: ningún módulo de `auth/` escribe en `localStorage`/`sessionStorage` ni
      lee `document.cookie`
- [x] 5.4 RED adversarial: `logout` fallando (500/red) igual deja la UI `anonimo`
- [x] 5.5 RED adversarial: mismo texto exacto para cuenta bloqueada y contraseña incorrecta
- [x] 5.6 GREEN: correcciones necesarias — pasa 5.1-5.5

### Phase 6: Regresión PR2
- [x] 6.1 `pnpm typecheck` verde; e2e de `#4`/`#5`/`#6` sin regresión

## PR 3 — Google en el login (base = PR 2 branch)

### Phase 7: Google Identity Services (D8/D10)
- [ ] 7.1 Crear `useGoogleIdentity.ts`: carga única de `gsi/client`, `initialize`+`renderButton`
- [ ] 7.2 Crear `BotonGoogle.tsx`; RED: sin `VITE_GOOGLE_CLIENT_ID` el botón no renderiza
      (fail-closed, D10)
- [ ] 7.3 Crear `DialogoVinculacion.tsx`: segundo paso de `VINCULACION_REQUERIDA`
- [ ] 7.4 RED componente: Google exitoso → `POST /auth/google`, 200 redirige al asistente
- [ ] 7.5 RED componente: `409 VINCULACION_REQUERIDA` abre el diálogo, reenvío lleva
      `{idToken, password}`
- [ ] 7.6 RED componente: `401` de Google muestra el mismo mensaje genérico que el login por código
- [ ] 7.7 GREEN: callback de `useGoogleIdentity` → `auth-api.google()` + flujo de vinculación —
      pasa 7.4-7.6
- [ ] 7.8 Modificar `.env.example`/`docs/onboarding.md`: `VITE_GOOGLE_CLIENT_ID` debe igualar
      `GOOGLE_CLIENT_ID` del backend
- [ ] 7.9 Regresión: `pnpm typecheck` verde; tests de PR2 sin regresión

## PR 4 — Cimientos backend (base = PR 3 branch)

### Phase 8: Delta de schema (D1)
- [ ] 8.1 Modificar `apps/backend/prisma/schema.prisma`: enums `PublicoObjetivo`/
      `AlcanceSegmentacion` + 4 columnas en `ProcesoElectoral`
- [ ] 8.2 Crear migración `20260811010000_proceso_publico_objetivo_snapshot/migration.sql`:
      `CREATE TYPE`, `ADD COLUMN` con `DEFAULT` transitorio, luego `DROP DEFAULT`
- [ ] 8.3 GREEN: `information_schema.columns` confirma `publico_objetivo`/`alcance` sin
      `column_default`
- [ ] 8.4 Modificar `test/schema/{electoral,voting,support-tables}.spec.ts`: fixtures declaran
      ambos campos (typecheck lo exige)

### Phase 9: Año escolar activo (D2b)
- [ ] 9.1 RED integración: `anioEscolarActivoId()` devuelve el año `activo=true` aunque
      `Configuracion.anio_escolar_id` apunte a otro
- [ ] 9.2 Modificar `configuracion-lectura.service.ts`: `anioEscolarActivoId()` vía
      `findFirst({where:{activo:true}})` — GREEN 9.1

### Phase 10: Claves de auditoría (D6)
- [ ] 10.1 Modificar `audit-event-types.ts`: agregar `PROCESO_CREADO`/`PROCESO_EDITADO`/
      `PROCESO_ELIMINADO`
- [ ] 10.2 GREEN: `test/schema/auditoria.spec.ts` [TM4] confirma `WHEN` del trigger de ADR-0016
      intacto

### Phase 11: Regresión PR4
- [ ] 11.1 `pnpm openapi:extract` sin Postgres/Redis vivos; `pnpm typecheck` verde

## PR 5 — `PadronService` (base = PR 4 branch)

### Phase 12: Módulo, DTOs y catálogo de errores
- [ ] 12.1 Crear `procesos/dto/segmentacion.dto.ts`, `padron-respuesta.dto.ts`
- [ ] 12.2 Crear `procesos/procesos.errors.ts` (D5): `CAMPO_INVALIDO`, `REFERENCIA_INEXISTENTE`,
      `SEGMENTACION_INVALIDA`, `SEGMENTACION_SIN_ELEGIBLES`, `PROCESO_NO_EDITABLE`,
      `SIN_ANIO_ESCOLAR_ACTIVO`
- [ ] 12.3 Crear `procesos/procesos.module.ts`: `imports: [AuthModule, AuditoriaModule,
      ConfiguracionLecturaModule]`
- [ ] 12.4 Modificar `app.module.ts`: agregar `ProcesosModule`

### Phase 13: Resolución de aulas y agregación del padrón (D2/D3)
- [ ] 13.1 RED unit: resolución de aulas por `alcance` (4 ramas); `institucion` prohibido para
      `representante_aula` → `409 SEGMENTACION_INVALIDA`
- [ ] 13.2 RED unit: derivación de derechos por `publico_objetivo`, incluida la suma doble de
      `comunidad` [spec: doble derecho]
- [ ] 13.3 RED integración: sin `AnioEscolar` activo → `409 SIN_ANIO_ESCOLAR_ACTIVO`
- [ ] 13.4 RED integración: exclusión de aulas sin matrícula activa del cálculo
- [ ] 13.5 RED adversarial: estudiante con dos matrículas activas → `aviso: MATRICULA_DUPLICADA`,
      `cuentas_distintas < estudiantes`
- [ ] 13.6 RED adversarial: `aula_ids` de otro año escolar → `409 REFERENCIA_INEXISTENTE`, nunca
      contadas
- [ ] 13.7 RED adversarial: `POST /procesos/padron` no crea ninguna fila de `DerechoVoto` [spec:
      El conteo no crea filas de DerechoVoto]
- [ ] 13.8 Crear `procesos/padron.service.ts`: `calcular()` con `$transaction([groupBy, groupBy,
      count])` — GREEN 13.1-13.7

### Phase 14: `POST /procesos/padron`
- [ ] 14.1 Crear `procesos/procesos.controller.ts`: ruta `padron` estática antes de `:id` (D4),
      `@UseGuards`+`@Roles` a nivel de clase
- [ ] 14.2 RED e2e: `401` sin cookie, `403` para `docente`/`estudiante`, `200` para
      `administrador`/`director`/`comité`
- [ ] 14.3 GREEN: wiring — pasa 14.2

### Phase 15: Regresión PR5
- [ ] 15.1 `pnpm openapi:extract` verde; `pnpm typecheck` verde

## PR 6 — `POST /procesos`: creación y lote (base = PR 5 branch)

### Phase 16: DTOs y servicio de creación
- [ ] 16.1 Crear `procesos/dto/crear-proceso.dto.ts`, `proceso-respuesta.dto.ts`
- [ ] 16.2 Crear `procesos/procesos.service.ts`: `crear(dto, actorId)` — valida `tipo↔alcance`,
      resuelve aulas, excluye sin matrícula, `elegibles=[]` → `409 SEGMENTACION_SIN_ELEGIBLES`

### Phase 17: Lote y auditoría
- [ ] 17.1 RED e2e: `representante_aula` crea 1 `ProcesoElectoral` + N `ProcesoAula` en una
      `$transaction` [spec: Creación en lote]
- [ ] 17.2 RED e2e: aula sin matrícula activa queda excluida del lote, resto se crea [spec scenario]
- [ ] 17.3 RED e2e: aula sin `Candidato` crea `ProcesoAula` igual, sin error de validación [spec
      scenario]
- [ ] 17.4 RED e2e: `representante_aula` + `alcance=institucion` → `409 SEGMENTACION_INVALIDA`
- [ ] 17.5 RED e2e: exactamente una fila `PROCESO_CREADO` por creación, incluido el lote [spec:
      Auditoría de creación]
- [ ] 17.6 RED e2e: rol no autorizado se rechaza sin ejecutar el handler
- [ ] 17.7 RED adversarial: rollback forzado a mitad del lote → sin proceso, sin `ProcesoAula`, sin
      evento de auditoría
- [ ] 17.8 GREEN: `crear()` + ruta `POST /procesos` — pasa 17.1-17.7

### Phase 18: Regresión PR6
- [ ] 18.1 `pnpm openapi:extract` verde; `pnpm typecheck` verde

## PR 7 — `GET`/`PATCH`/`DELETE` `/procesos` (base = PR 6 branch)

### Phase 19: Listado y detalle
- [ ] 19.1 Crear `listar-procesos.query.ts`, `proceso-detalle-respuesta.dto.ts`
- [ ] 19.2 RED e2e: `GET /procesos?estado=borrador` filtra correctamente [spec scenario]
- [ ] 19.3 RED e2e: valor de filtro desconocido → `400 CAMPO_INVALIDO`
- [ ] 19.4 RED e2e: `GET /procesos/:id` incluye `publico_objetivo`, snapshot y `ProcesoAula[]`
      [spec scenario]
- [ ] 19.5 GREEN: `listar()`/`detalle()` + rutas `GET` — pasa 19.2-19.4

### Phase 20: `PATCH` sin límite de reintentos
- [ ] 20.1 Crear `actualizar-proceso.dto.ts` — sin `tipo` ni `estado` (D3)
- [ ] 20.2 RED e2e: `PATCH` regenera `ProcesoAula[]` según nueva segmentación [spec scenario]
- [ ] 20.3 RED e2e: `PATCH` con `tipo`/`estado` en el body no los cambia
- [ ] 20.4 RED e2e: `PATCH` sobre `estado != borrador` → `409 PROCESO_NO_EDITABLE`, sin cambios
      [spec scenario]
- [ ] 20.5 RED e2e: reedición repetida sin límite de reintentos [spec scenario]
- [ ] 20.6 RED e2e: exactamente una fila `PROCESO_EDITADO` por `PATCH` [spec scenario]
- [ ] 20.7 GREEN: `editar()` — `deleteMany`+`createMany` de `ProcesoAula` en `$transaction` — pasa
      20.2-20.6

### Phase 21: `DELETE`
- [ ] 21.1 RED e2e: `DELETE` elimina el proceso y sus `ProcesoAula` en cascada [spec scenario]
- [ ] 21.2 RED e2e: `DELETE` sobre `estado != borrador` → `409 PROCESO_NO_EDITABLE`, la fila
      permanece [spec scenario]
- [ ] 21.3 RED e2e: exactamente una fila `PROCESO_ELIMINADO` por `DELETE` [spec scenario]
- [ ] 21.4 RED e2e: rol no autorizado rechazado en `PATCH`/`DELETE` sin ejecutar el handler
- [ ] 21.5 GREEN: `eliminar()` + ruta `DELETE` — pasa 21.1-21.4

### Phase 22: Regresión PR7
- [ ] 22.1 `pnpm generate:contracts` regenera las 6 rutas de `/procesos`
- [ ] 22.2 `pnpm openapi:extract` verde; `pnpm typecheck` verde

## PR 8 — Wizard frontend: reducer + pasos 1-2 (base = PR 7 branch)

### Phase 23: Reducer y API tipada
- [ ] 23.1 Crear `procesos/wizard-reducer.ts`: `EstadoAsistente`, discriminador `paso`
- [ ] 23.2 RED unit: cambiar `tipo` invalida `alcance`
- [ ] 23.3 RED unit: cambiar `alcance` limpia la selección previa
- [ ] 23.4 RED unit: `ocultar_resultados` arranca en `true` para proceso nuevo, respeta valor
      persistido al reabrir [spec: pre-marcado]
- [ ] 23.5 GREEN: implementación del reducer — pasa 23.2-23.4
- [ ] 23.6 Crear `procesos/procesos-api.ts`: wrappers tipados contra `packages/contracts`
      regenerado en PR7

### Phase 24: Pasos 1-2
- [ ] 24.1 Crear `ProcesoWizardPage.tsx`: contenedor, reducer + navegación (sin submit todavía)
- [ ] 24.2 Crear `pasos/PasoDatos.tsx`: nombre, descripción, tipo, fechas
- [ ] 24.3 Crear `pasos/PasoPublico.tsx`: `publico_objetivo`+`alcance`+nivel/grados/aulas;
      `representante_aula` fuerza `alcance=aulas` [spec scenario]
- [ ] 24.4 RED componente: navegación 1→2 preserva estado; `representante_aula` no ofrece
      `institucion`
- [ ] 24.5 GREEN: wiring de `PasoDatos`/`PasoPublico` — pasa 24.4

### Phase 25: Regresión PR8
- [ ] 25.1 `pnpm typecheck` verde (frontend)

## PR 9 — Wizard frontend: padrón + revisión + montaje (base = PR 8 branch)

### Phase 26: `usePadronEnVivo`
- [ ] 26.1 Crear `usePadronEnVivo.ts`: debounce 300ms + `AbortController` + número de secuencia
- [ ] 26.2 RED unit: respuesta fuera de orden no pisa el conteo vigente
- [ ] 26.3 RED unit: petición previa se aborta al cambiar la segmentación
- [ ] 26.4 GREEN: implementación del hook — pasa 26.2-26.3

### Phase 27: Pasos 3-4 y submit
- [ ] 27.1 Crear `pasos/PasoPadron.tsx`: conteo en vivo, desglose por aula, aulas excluidas, aviso
      `MATRICULA_DUPLICADA`
- [ ] 27.2 Crear `pasos/PasoRevision.tsx`: resumen + checkbox `ocultar_resultados` + confirmar
- [ ] 27.3 RED componente: paso 4 muestra el checkbox marcado por defecto [spec scenario]
- [ ] 27.4 RED componente: el conteo se vuelve a solicitar al cambiar la segmentación
- [ ] 27.5 RED componente: navegación completa de 4 pasos llama `POST /procesos` al confirmar
- [ ] 27.6 GREEN: submit → `procesos-api.crear()` + confirmación — pasa 27.3-27.5

### Phase 28: Montaje en `AppShell`
- [ ] 28.1 Modificar `apps/frontend/src/app/AppShell.tsx`: montar `ProcesoWizardPage` como único
      hijo
- [ ] 28.2 Verificación manual (rollout R6): sin cookie → login; login → shell+asistente; crear
      borrador; logout → login

### Phase 29: Regresión final PR9
- [ ] 29.1 `pnpm typecheck` verde; sin rutas nuevas de backend, contrato sin cambios
- [ ] 29.2 `pnpm turbo run test`: e2e de `#4`/`#5`/`#6` sin regresión (verificación final de D9)
