```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:bf47800fdff4ab322b87b3567761efeb2ec84a14b76b98ddfc4a6d34175f4dcd
verdict: pass
blockers: 0
critical_findings: 0
requirements: 10/10
scenarios: 15/15
test_command: pnpm --filter @seei/backend test:schema
test_exit_code: 0
test_output_hash: sha256:50608cba2a42421faf6c5533af0079a281c4f6802f99ef35af94225736b08a2b
build_command: pnpm turbo run lint typecheck build test --filter=@seei/backend --force
build_exit_code: 0
build_output_hash: sha256:61253a23a1be5d20c3c747a742e284ebc1def699ea3891aae6a8d0f91ec9147b
```

# Reporte de verificacion: base-schema-and-migrations

**Fecha:** 2026-08-06
**Rama verificada (tracker):** base-schema-and-migrations - HEAD de la cadena en base-schema-and-migrations-pr4-support-tables
**HEAD:** c34c6639cb7f3809972dd6228d6ded503d13012b
**Veredicto:** PASS CON ADVERTENCIAS (0 CRITICAL, 3 WARNING, 0 BLOCKER)

## Alcance verificado

Los 5 PRs encadenados (PR0 arnes + PR1 identidad/arbol academico + PR2 estructura del proceso electoral + PR3 nucleo de votacion + PR4 tablas de soporte), 55/55 tareas de tasks.md marcadas [x], contra specs/base-schema/spec.md (10 requisitos, 15 escenarios GIVEN/WHEN/THEN: R1a/R1b, R2, R3a/R3b, R4, R5a/R5b/R5c, R6, R7, R8, R9a/R9b, R10) y design.md (decisiones D1-D7, matriz de amenazas TM1/TM2/TM3).

## Completitud de tareas

55/55 tareas [x] en tasks.md (PR0: 9, PR1: 18, PR2: 5, PR3: 13, PR4: 10), confirmado por lectura directa del archivo. Seccion "Cobertura de escenarios no resuelta" dice "Ninguna" y es correcta: los 15 escenarios y las 3 filas TM aplicables estan referenciados en al menos una tarea.

## Evidencia real ejecutada (no solo lectura de codigo)

Todo lo siguiente se ejecuto en esta sesion de verificacion, contra un stack Postgres/Redis efimero real (infra/docker/docker-compose.test.yml, Docker Desktop), reproduciendo el patron de CI documentado en apply-progress:

- Replica manual e independiente del escenario R8 ("una base de datos con solo la migracion baseline vacia aplicada" seguido de prisma migrate deploy con las cuatro migraciones): se levanto un contenedor Postgres 16 completamente vacio (sin ninguna migracion aplicada) y se ejecuto prisma migrate deploy desde cero. Resultado: las 5 migraciones (20260806021859_baseline_vacia mas las 4 grupos de este change) se aplicaron en orden, sin error. Este es exactamente el GIVEN/WHEN/THEN literal de R8, verificado en vivo, no solo por inspeccion de codigo.
- pnpm --filter @seei/backend test:schema - 7 suites / 21 tests, todos en verde (identity, electoral, voting, support-tables, migration-inventory, seed, expect-pg-error self-test). test_exit_code: 0, test_output_hash en el envelope YAML es el SHA-256 real de la salida capturada de este comando.
- pnpm --filter @seei/backend run check:drift - exit 0, sin deriva; confirmado que el script ignora correctamente el comentario placeholder de 30 bytes que Prisma 5.22 siempre escribe ("This is an empty migration.") antes de decidir si hay deriva real, tal como describe la desviacion de diseno aceptada.
- pnpm turbo run lint typecheck build test --filter=@seei/backend --force (cache forzado a limpio) - 4/4 tareas en verde (test: 2 suites/3 tests Jest de apps/backend/src, build via nest build, typecheck via tsc --noEmit, lint no configurado aun - mensaje explicito "nothing to lint yet", no un fallo silencioso). build_output_hash es el SHA-256 real de esta salida.
- Teardown limpio del stack efimero (docker compose down -v) tras cada corrida; git status --short del repo sin cambios inesperados.

## Matriz de cumplimiento de especificacion

| Requisito | Escenario(s) | Test cubridor | Resultado runtime |
|---|---|---|---|
| Identidad y arbol academico | Arbol completo con Turno [R1a] | identity.spec.ts ([R1a]) | PASS |
| | FK invalida en Seccion-Grado rechazada [R1b] | identity.spec.ts ([R1b], 23503) | PASS |
| Unico AnioEscolar activo | Segundo activo rechazado [R2] | identity.spec.ts ([R2], 23505/P2002) + assert pg_indexes sobre anio_escolar_activo_unico_idx | PASS |
| Estructura del proceso electoral | DerechoVoto valido aceptado [R3a] | voting.spec.ts ([R3a]) | PASS |
| | DerechoVoto sin proceso valido rechazado [R3b] | voting.spec.ts ([R3b], 23503) | PASS |
| | ProcesoAula con Aula inexistente rechazado (complemento no numerado) | electoral.spec.ts | PASS |
| Cero votos duplicados | Segundo voto mismo par rechazado [R4] | voting.spec.ts ([R4], 23505/P2002) | PASS |
| Exactamente una eleccion por voto | Dos elecciones establecidas rechazado [R5a] | voting.spec.ts ([R5a], 23514) | PASS |
| | Ninguna eleccion establecida rechazado [R5b] | voting.spec.ts ([R5b], 23514) | PASS |
| | Voto en blanco aceptado [R5c] | voting.spec.ts ([R5c]) | PASS |
| Frontera del secreto del voto | Sin vistas que unan identidad y eleccion [R6] | voting.spec.ts ([R6], pg_views count 0) | PASS |
| Tablas de soporte | Acta referencia ProcesoElectoral valido [R7] | support-tables.spec.ts ([R7]) | PASS |
| Migraciones agrupadas apiladas | 4 migraciones aplican en orden sin error, sin tablas fuera de alcance [R8] | migration-inventory.spec.ts (19 tablas exactas) + orden de pasos de CI + replica manual de esta verificacion (ver arriba) | PASS - ver hallazgo WARNING 1 |
| Seeds estructurales restringidos a no-produccion | Rechazado en produccion [R9a] | seed.spec.ts ([R9a]) | PASS |
| | Sin material de credenciales [R9b] | seed.spec.ts ([R9b]) | PASS |
| Suite de rechazo con codigos reales | RED/GREEN documentado por par | apply-progress (evidencia TDD por tarea) + re-ejecucion en verde de toda la suite en esta sesion [R10] | PASS |

10/10 requisitos, 15/15 escenarios - todos con test cubridor que paso en runtime real en esta sesion de verificacion (no solo lectura estatica).

## Coherencia de diseno

| Decision | Estado en codigo | Coherencia |
|---|---|---|
| D1 (onDelete explicito por relacion) | schema.prisma - Restrict por omision, Cascade solo en Apoderado-Usuario y las 4 relaciones *-ProcesoElectoral de composicion; Voto-{Lista,OpcionConsulta,Candidato} con Restrict explicito anulando el SetNull por omision | Conforme |
| D2 (SQL raw anexado a mano + doble verificacion de deriva) | migration.sql de identity_and_academic_tree y voting_core llevan el bloque SQL raw al final; check-migration-drift.sh decide por contenido, no por git diff | Conforme, con desviacion aceptada documentada abajo |
| D3 (arnes pg crudo + Prisma Client) | expect-pg-error.ts, pg-client.ts, catalog.ts; DSL via Prisma (P2002), SQL raw/FK via pg (23505/23514/23503) | Conforme |
| D4 (4 grupos de migracion, 5 PRs) | 5 commits en 5 ramas encadenadas, exactamente 4 directorios de migracion de dominio mas baseline de #1 | Conforme |
| D5 (blanco NOT NULL DEFAULT false + CHECK num_nonnulls) | voting_core/migration.sql - CHECK (num_nonnulls(lista_id,opcion_id,candidato_id) + blanco::int = 1), blanco Boolean @default(false) sin ? | Conforme |
| D6 (ProcesoAula como unico eje de alcance) | Sin ProcesoNivel/ProcesoGrado adicionales | Conforme |
| D7 (Configuracion sin secreto SMTP) | Solo smtp_host/smtp_puerto/smtp_remitente; seed.spec.ts asegura explicitamente ausencia de password/secret en nombres de columna | Conforme |

## Hallazgos WARNING (no bloqueantes)

1. Evidencia de R8 compuesta, no un unico test de reemplazo literal dentro de Jest. El equipo de sdd-apply no pudo incrustar un test "prisma migrate deploy desde una BD verdaderamente vacia" dentro de la suite Jest de CI porque el job e2e-backend no expone credenciales con privilegio de creacion de base (seei_migrator carece de CREATEDB; SHADOW_DATABASE_URL solo existe en el job build-and-check). La sustitucion documentada -- (a) el orden de pasos de CI ya garantiza que migrate deploy tuvo exito antes de que test:schema corra, y (b) migration-inventory.spec.ts asertando el inventario exacto de 19 tablas como postcondicion -- es una evidencia funcional razonable y no un hueco de cobertura: en esta sesion de verificacion reproduje el escenario R8 literal (BD recien creada, sin ninguna migracion, prisma migrate deploy aplicando las 5 migraciones en orden sin error) de forma independiente y paso. Ademas, el contenedor de servicio Postgres de e2e-backend en CI es efimero por diseno (se crea vacio en cada corrida), asi que el GIVEN de R8 ("solo la baseline vacia aplicada") se satisface implicitamente en cada ejecucion de CI, no solo en esta verificacion manual. Juicio independiente: la sustitucion es equivalente en efecto de verificacion al escenario que la spec describe; se marca WARNING (no CRITICAL) porque la trazabilidad explicita "por que este test cubre R8" depende de leer apply-progress/este reporte -- aunque el describe() de migration-inventory.spec.ts ya lleva el tag [R8] en su nombre, asi que el vinculo es descubrible directamente en el codigo. Dado eso, este hallazgo se degrada a documentacion/seguimiento, no a una brecha real de cobertura.
2. shadowDatabaseUrl agregado al datasource de Prisma (desviacion de diseno aceptada por el mantenedor, pregunta abierta de design.md D2 resuelta durante sdd-apply): apunta al superusuario postgres de arranque, exclusivamente para tooling de autoria (migrate dev --create-only, incluido check:drift). No cambia privilegios de runtime de seei_app/seei_migrator; verificado que migrate deploy (el unico comando de runtime/CI) no usa la base sombra. Documentado en un comentario extenso sobre el bloque datasource en schema.prisma. Sin impacto en ningun escenario de la spec.
3. Logica de check-migration-drift.sh ajustada frente al snippet literal de design.md D2 (desviacion aceptada): la version fijada de Prisma (5.22.0) siempre escribe un migration.sql de 30 bytes con un comentario placeholder, asi que la comprobacion original ([ -s "$DIR/migration.sql" ]) habria producido un falso positivo de deriva en cada corrida. El script real filtra lineas de comentario (--) y en blanco antes de decidir. Verificado en esta sesion: check:drift da exit 0 limpio contra el arbol sin cambios reales. design.md no se actualizo para reflejar esta logica final (sigue mostrando el snippet original en la seccion D2) -- sugerencia de documentacion, no bloqueante.

## Limitaciones de entorno (no bloqueantes)

- El workflow de CI (ci.yml) se verifico localmente reproduciendo la misma secuencia de comandos que invoca (prisma migrate deploy, luego test:schema, luego check:drift), pero no corrio contra un runner real de GitHub Actions -- no disponible en este entorno.

## Conclusion

Ningun hallazgo es BLOCKER ni CRITICAL. Los 3 WARNING quedan como seguimiento explicito -- el primero (evidencia de R8) se evalua con juicio independiente como una sustitucion equivalente y suficiente, no como una brecha de cobertura; ninguno impide considerar base-schema-and-migrations listo para sdd-archive.
