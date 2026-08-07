# Tareas: Esquema base y migraciones (base-schema-and-migrations)

Convención de referencia: `[Rn]` remite a un escenario de `specs/base-schema/spec.md`; `[TMn]`
remite a una fila aplicable de la Matriz de amenazas de `design.md`. Bloqueo duro vigente: ningún
PR de este change llega a `sdd-apply` hasta que Backlog #1 (`system-scaffolding`) esté entregado.
TDD estricto activo — RED antes que GREEN en toda restricción/script.

## Pronóstico de carga de revisión

| Campo | Valor |
|---|---|
| Líneas cambiadas estimadas (autoría) | ~890 (D4 de `design.md`); ninguna migración `.sql` generada cuenta como autoría |
| Riesgo de presupuesto de 400 líneas | Alto en total, mitigado por el corte en 5 PRs — ningún PR individual supera 400 |
| PRs encadenados recomendados | Sí — 5 PRs (PR0 arnés + 4 grupos de migración) |
| Estrategia de entrega | `ask-on-risk` |
| Estrategia de encadenado | `feature-branch-chain` |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High
```

**Decisión resuelta:** el usuario eligió `feature-branch-chain` — rama tracker
`base-schema-and-migrations`, PR1 apunta a la tracker, cada PR hija apunta a la PR anterior, solo
la tracker se mergea a `main`. Mismo patrón usado en `system-scaffolding`.

### Unidades de trabajo sugeridas

| PR | Objetivo | Base | Comando de test enfocado | Arnés de runtime | Frontera de rollback |
|---|---|---|---|---|---|
| 0 | Arnés `test:schema` (helpers `pg-client`/`expect-pg-error`/`catalog`) | tracker/`main` | `pnpm --filter @seei/backend test:schema` | `docker-compose.test.yml`, tabla temporal | Revertir PR0; no existe todavía ningún modelo de dominio |
| 1 | `identity_and_academic_tree` + script de deriva + seed parcial | PR0 | `pnpm --filter @seei/backend test:schema -- identity` | `docker-compose.test.yml` + `prisma migrate deploy` | Revertir carpeta de migración + modelos antes de que PR2 exista; migración hacia adelante si ya se aplicó a una BD compartida |
| 2 | `electoral_process_structure` | PR1 | `pnpm --filter @seei/backend test:schema -- electoral` | ídem PR1 | Revertir carpeta de migración de PR2; PR3 aún no depende de ella |
| 3 | `voting_core` (`DerechoVoto`/`Voto` + `CHECK`) | PR2 | `pnpm --filter @seei/backend test:schema -- voting` | ídem PR1 | Revertir carpeta de migración de PR3 antes de que PR4 dependa de ella |
| 4 | `support_tables` + finalización del seed + CI wiring completo | PR3 | `pnpm --filter @seei/backend test:schema` (suite completa) | compose completo + job `e2e-backend` de CI | Revertir PR4; migración hacia adelante que elimine `JobCorreo`/`Notificacion`/`Configuracion`/`Acta` si ya se aplicó |

## Fase 0: Arnés de tests de rechazo (PR 0, base: tracker/`main` tras baseline de #1)

- [x] 0.1 `(config)` Crear `apps/backend/test/schema/jest-schema.config.ts` (proyecto Jest dedicado, patrón `test/schema/**/*.spec.ts`).
- [x] 0.2 `(config)` Crear `apps/backend/test/schema/helpers/pg-client.ts` (`pg.Client` con `DATABASE_URL`/`seei_app`; patrón `BEGIN`/`SAVEPOINT`/`ROLLBACK TO`).
- [x] 0.3 `(config)` Crear `apps/backend/test/schema/helpers/expect-pg-error.ts`.
- [x] 0.4 `(config)` Crear `apps/backend/test/schema/helpers/catalog.ts` (consultas `pg_constraint`/`pg_indexes` por nombre).
- [x] 0.5 `(config)` `apps/backend/package.json`: scripts `test:schema`/`db:seed`/`check:drift`; devDependency `pg` + `@types/pg`.
- [x] 0.6 `(config)` `turbo.json`: tarea `test:schema` (`dependsOn: ["^build"]`, `cache: false`, `env: ["DATABASE_URL","MIGRATION_DATABASE_URL"]`).
- [x] 0.7 RED: self-test de `expectPgError` contra una tabla temporal con `CHECK` — falla si el helper no detecta el rechazo.
- [x] 0.8 GREEN: implementar/ajustar `expectPgError` hasta que el self-test pase.
- [x] 0.9 Verificar `pnpm --filter @seei/backend test:schema` en verde (solo arnés, sin tablas de dominio todavía).

## Fase 1: Identidad y árbol académico (PR 1, base: PR 0)

- [x] 1.1 Agregar a `schema.prisma`: `Usuario`, `Apoderado`, `AnioEscolar`, `Nivel`, `Grado`, `Seccion`, `Aula`, `Matricula`; `onDelete` según D1 (`Apoderado→Usuario` Cascade, resto Restrict); PascalCase sin diacríticos.
- [x] 1.2 `prisma migrate dev --create-only --name identity_and_academic_tree`.
- [x] 1.3 Anexar SQL raw: `CREATE UNIQUE INDEX "anio_escolar_activo_unico_idx" ... WHERE "activo" = true`; comentario `// NOTE:` sobre el modelo `AnioEscolar`.
- [x] 1.4 `(config)` Crear `apps/backend/scripts/check-migration-drift.sh` (D2); registrar script `check:drift`.
- [x] 1.5 RED `[TM2]`: modificar un modelo sin migrar → el script debe fallar mostrando el SQL faltante.
- [x] 1.6 RED `[TM1]`: archivo sucio fuera de `prisma/migrations` en el árbol de trabajo → el script debe pasar (pathspec limitado a `*_drift_check`).
- [x] 1.7 RED `[TM3]`: `DIR` apuntando a una migración real → el script debe abortar sin `rm -rf`.
- [x] 1.8 GREEN: implementar `check-migration-drift.sh` (`set -euo pipefail`, validación de sufijo, deriva decidida por contenido) — 1.5–1.7 en verde.
- [x] 1.9 RED `[R1a]`: test de catálogo — columna `Aula.turno` y cadena FK `Nivel→Grado→Seccion→Aula→Matricula` existen con cardinalidades correctas.
- [x] 1.10 RED `[R1b]`: insertar `Seccion` referenciando un `Grado` inexistente → violación FK `23503`.
- [x] 1.11 RED `[R2]`: insertar segundo `AnioEscolar` con `activo=true` mientras uno ya está activo → `23505`/`P2002`.
- [x] 1.12 GREEN: aplicar migración; 1.9–1.11 pasan; asertar `anio_escolar_activo_unico_idx` vía `pg_indexes`.
- [x] 1.13 `(config)` Crear `apps/backend/prisma/seed.ts`: aborta antes de conectar si `NODE_ENV==='production'`; `upsert` de `AnioEscolar` activo, `Nivel→Grado→Seccion→Aula` (`turno=manana`), 1 `Usuario` por rol (solo identidad).
- [x] 1.14 RED `[R9a]`: ejecutar seed con `NODE_ENV=production` → código de salida distinto de 0, cero filas creadas.
- [x] 1.15 RED `[R9b]`: ejecutar seed fuera de producción → filas de `Usuario` sin `password_hash` ni identificador OAuth.
- [x] 1.16 GREEN: `seed.ts` satisface 1.14–1.15.
- [x] 1.17 `(config)` `.github/workflows/ci.yml`: `check:drift` en `build-and-check`; `test:schema` en `e2e-backend` tras `prisma migrate deploy`.
- [x] 1.18 Verificar `pnpm --filter @seei/backend test:schema` verde para alcance PR1; `check-migration-drift.sh` verde en árbol limpio.

## Fase 2: Estructura del proceso electoral (PR 2, base: PR 1)

- [ ] 2.1 Agregar a `schema.prisma`: `ProcesoElectoral`, `Lista`, `Candidato`, `OpcionConsulta`, `ProcesoAula`; `onDelete` según D1 (`Lista`/`OpcionConsulta`/`Candidato`/`ProcesoAula`→`ProcesoElectoral` Cascade; `Candidato→Lista` y `ProcesoAula→Aula` Restrict).
- [ ] 2.2 `prisma migrate dev --create-only --name electoral_process_structure` (sin SQL raw).
- [ ] 2.3 RED: insertar `ProcesoAula` referenciando un `Aula` inexistente → violación FK `23503`.
- [ ] 2.4 GREEN: aplicar migración; 2.3 pasa.
- [ ] 2.5 Verificar `pnpm --filter @seei/backend test:schema` verde para alcance PR2.

## Fase 3: Núcleo de votación (PR 3, base: PR 2 — mayor valor de revisión)

- [ ] 3.1 Agregar a `schema.prisma`: `DerechoVoto`, `Voto`; `onDelete: Restrict` explícito en todo (D1, anula `SetNull` por omisión); `@@unique([proceso_id, derecho_voto_id])`, `@@unique([proceso_id, clave_idempotencia])`.
- [ ] 3.2 `prisma migrate dev --create-only --name voting_core`.
- [ ] 3.3 Anexar SQL raw: `ALTER TABLE "Voto" ADD CONSTRAINT "voto_eleccion_exactamente_una_chk" CHECK (num_nonnulls("lista_id","opcion_id","candidato_id") + "blanco"::int = 1)`; comentario `// NOTE:` sobre `Voto`.
- [ ] 3.4 RED `[R3a]`: insertar `DerechoVoto` referenciando `ProcesoElectoral`/`Usuario` válidos → aceptado y vinculado por FK.
- [ ] 3.5 RED `[R3b]`: insertar `DerechoVoto` con `proceso_id` inexistente → violación FK `23503`.
- [ ] 3.6 RED `[R4]`: insertar segundo `Voto` con el mismo `(proceso_id, derecho_voto_id)` → `23505`/`P2002`.
- [ ] 3.7 RED `[R5a]`: insertar `Voto` con `lista_id` y `candidato_id` ambos establecidos → `23514`.
- [ ] 3.8 RED `[R5b]`: insertar `Voto` con `lista_id`/`opcion_id`/`candidato_id` en `NULL` y `blanco=false` → `23514`.
- [ ] 3.9 RED `[R5c]`: insertar `Voto` con `blanco=true` y el resto `NULL` → aceptado.
- [ ] 3.10 GREEN: aplicar migración; asertar `voto_eleccion_exactamente_una_chk` vía `pg_constraint`; 3.4–3.9 pasan.
- [ ] 3.11 RED `[R6]`: `SELECT count(*) FROM pg_views WHERE schemaname='public'` debe ser `0`.
- [ ] 3.12 GREEN: confirmar 3.11 (este change no crea ninguna vista).
- [ ] 3.13 Verificar `pnpm --filter @seei/backend test:schema` verde para alcance PR3.

## Fase 4: Tablas de soporte y cierre (PR 4, base: PR 3)

- [ ] 4.1 Agregar a `schema.prisma`: `JobCorreo`/`Notificacion`, `Configuracion`, `Acta`; `onDelete: Restrict` (D1); `Configuracion` sin columnas de secreto SMTP (D7: solo `smtp_host`/`smtp_puerto`/`smtp_remitente`).
- [ ] 4.2 `prisma migrate dev --create-only --name support_tables` (sin SQL raw).
- [ ] 4.3 RED `[R7]`: insertar `Acta` referenciando un `ProcesoElectoral` existente → aceptado.
- [ ] 4.4 GREEN: aplicar migración; 4.3 pasa.
- [ ] 4.5 Finalizar `seed.ts`: `upsert` de `Configuracion` singleton (datos de marcador de posición, sin secretos SMTP).
- [ ] 4.6 RED: seed fuera de producción → fila de `Configuracion` sin campos de secreto SMTP.
- [ ] 4.7 GREEN: 4.6 pasa; seed idempotente vía `upsert` por clave natural.
- [ ] 4.8 RED `[R8]`: `prisma migrate deploy` desde la baseline vacía de #1 hasta las cuatro migraciones de #2 → se aplican en orden sin error y sin tablas fuera del inventario de alcance.
- [ ] 4.9 GREEN: confirmar 4.8 (verificación de integración entre los cuatro grupos).
- [ ] 4.10 Verificar suite completa `pnpm --filter @seei/backend test:schema` en verde `[R10]`; `pnpm --filter @seei/backend run check:drift` limpio.

## Cobertura de escenarios no resuelta

Ninguna. Los 15 escenarios GIVEN/WHEN/THEN de `specs/base-schema/spec.md` (`R1a/R1b`, `R2`, `R3a/R3b`,
`R4`, `R5a/R5b/R5c`, `R6`, `R7`, `R8`, `R9a/R9b`, `R10` — cubierto por cada par RED/GREEN) y las tres
filas aplicables de la Matriz de amenazas de `design.md` (`TM1`, `TM2`, `TM3`) quedan referenciados en
al menos una tarea de arriba.
