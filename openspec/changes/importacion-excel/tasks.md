# Tasks: Importación de padrón desde Excel

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~700-850 (módulo nuevo + método nuevo + tests unit/integración/e2e) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (fundaciones) → PR2 (flujo principal) → PR3 (CSV + auditoría + wiring) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | `MatriculasService.crearIdempotente()` + exports + clave de auditoría, sin superficie HTTP nueva | PR 1 | `pnpm --filter backend test matriculas.service.spec.ts` | N/A — sin endpoint nuevo, solo servicio | Revertir `matriculas.service.ts`, los 2 `exports` y la clave `PADRON_IMPORTADO` (no usada aún) — no toca datos |
| 2 | `POST /importaciones/padron`: parseo, validación, bucle por fila | PR 2 | `pnpm --filter backend test importacion.service.spec.ts importacion.controller.spec.ts` | Nest `Test.createTestingModule` aislado (sin registrar en `app.module.ts` todavía) | Eliminar `apps/backend/src/importacion/*` — módulo no registrado, cero impacto en runtime |
| 3 | CSV de errores (Redis), `GET .../errores.csv`, auditoría agregada, wiring en `app.module.ts` | PR 3 | `pnpm --filter backend test:e2e importacion.e2e-spec.ts` | Docker Compose local (Postgres + Redis reales) | Quitar `ImportacionModule` de `app.module.ts` + revertir CSV/Redis — cambio aditivo puro |

## Phase 0: Dependencias

- [x] 0.1 Agregar `exceljs` (dependencies) y `@types/multer` (devDependencies) en `apps/backend/package.json`; `pnpm install`.
- [x] 0.2 Ejecutar `pnpm audit` sobre `exceljs`; si falla, registrar fallback a `xlsx` (Open Question D3 del diseño). Resultado: sin hallazgos `critical`/`high` atribuibles a `exceljs` en sí — únicamente un `moderate` transitivo (`exceljs > uuid`, GHSA-36xv-jgw5-4q75, `uuid < 11.1.1`, sin CVE bloqueante para este alcance) y los `high` preexistentes de `multer` (vía `@nestjs/platform-express`, no relacionados con esta dependencia nueva). No se activa el fallback a `xlsx`.

## Phase 1: Fundaciones — `MatriculasService.crearIdempotente` (PR 1)

- [x] 1.1 RED: `matriculas.service.spec.ts` — duplicado (`creado:false`), Aula/AnioEscolar inexistente, rol distinto de `estudiante`, incoherencia jerárquica (spec `student-enrollment`).
- [x] 1.2 GREEN: implementar `crearIdempotente()` en `apps/backend/src/academico/matriculas.service.ts` (resuelve `grado_nombre/seccion_nombre/turno/anio_escolar_codigo` → ids, reutiliza validaciones de `crear()`, acepta `tx` externo opcional).
- [x] 1.3 REFACTOR: extraer helpers de resolución compartidos con `crear()` si hay duplicación. Evaluado: `crear()` resuelve por UUID directo (`findUnique`) y `crearIdempotente()` por claves legibles (`findFirst` compuesto) — la forma de resolución es distinta en cada método, sin duplicación real que extraer sin forzar una abstracción prematura. Sin cambios.
- [x] 1.4 `apps/backend/src/academico/academico.module.ts`: agregar `exports: [MatriculasService]` (D1).
- [x] 1.5 `apps/backend/src/users/users.module.ts`: agregar `exports: [UsersService]` (D1).
- [x] 1.6 `apps/backend/src/auditoria/audit-event-types.ts`: agregar clave aditiva `PADRON_IMPORTADO` (D6).

## Phase 2: `ImportacionModule` — flujo principal (PR 2)

- [x] 2.1 RED: `padron-csv.spec.ts` — cabecera válida/inválida, fila vacía.
- [x] 2.2 GREEN: `apps/backend/src/importacion/padron-csv.ts` — `CABECERA_PADRON`, parseo de fila, validación de cabecera (D7).
- [x] 2.3 Crear `importacion.errors.ts` (`MOTIVOS_FILA`) y `dto/{resultado-importacion,error-fila}.dto.ts`.
- [x] 2.4 RED: `importacion.service.spec.ts` — filas válidas/inválidas mezcladas, fila vacía, correo inválido, Aula inexistente, tope 2000 filas, cabecera inválida (spec `importacion-excel`).
- [x] 2.5 GREEN: `apps/backend/src/importacion/importacion.service.ts` — parseo con `exceljs`, validación de cabecera/tope, bucle por fila con `UsersService.crearIdempotente` + `MatriculasService.crearIdempotente` (D3). DESVIACIÓN de D2 documentada en el archivo: cada llamada abre su propia transacción (sin `tx` externo compartido) en vez de una única `prisma.$transaction` por fila — requerido por el escenario spec "el Usuario, si es válido, sí se crea" aunque la Matrícula falle; ver comentario en `importacion.service.ts` e `importacion.service.spec.ts`.
- [x] 2.6 RED+GREEN: `importacion.controller.spec.ts`/`.ts` — `POST /importaciones/padron`, `FileInterceptor`, `@Roles('administrador','director')`, allowlist `.xlsx`/`.csv` (nunca `.xlsm`), `limits.fileSize` (D7).
- [x] 2.7 `apps/backend/src/importacion/importacion.module.ts` — importa `AuthModule`, `AuditoriaModule`, `UsersModule`, `AcademicoModule`; registra `redisProvider` (sin registrar aún en `app.module.ts`).

## Phase 3: CSV de errores + auditoría agregada + wiring (PR 3)

- [ ] 3.1 RED+GREEN: `padron-csv.ts` — serialización CSV (BOM UTF-8, escape RFC 4180, prefijo anti-fórmula) (D5).
- [ ] 3.2 RED+GREEN: `importacion.service.ts` — `SETEX importacion:errores:{id}` TTL 24h en Redis y evento único `PADRON_IMPORTADO` con conteos, en `$transaction` propia (D4, D6).
- [ ] 3.3 RED+GREEN: `importacion.controller.ts` — `GET /importaciones/:id/errores.csv` devuelve `StreamableFile`; 404 si ausente/expirado.
- [ ] 3.4 `apps/backend/src/app.module.ts`: registrar `ImportacionModule`.
- [ ] 3.5 E2E `apps/backend/test/importacion.e2e-spec.ts` — archivo mixto, reimportación sin duplicados, cabecera inválida, >2000 filas, `.xlsm` rechazado, descarga CSV, 403 por rol.
- [ ] 3.6 REFACTOR final: limpiar imports, revisar cobertura de las 4 capas de testing del diseño.
