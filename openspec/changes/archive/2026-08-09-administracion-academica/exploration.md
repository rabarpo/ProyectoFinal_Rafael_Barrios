# Exploración: administracion-academica (Backlog #8 — Administración académica)

## Estado actual

El modelo de datos ya existe completo en `apps/backend/prisma/schema.prisma`, depositado por
`#2` (`base-schema-and-migrations`, grupo 1 "Identidad y árbol académico"): `AnioEscolar` (id,
`nombre @unique`, `activo Boolean @default(false)`), `Nivel` (`nombre @unique`) → `Grado`
(`@@unique([nivel_id, nombre])`) → `Seccion` (`@@unique([grado_id, anio_escolar_id, nombre])`),
`Aula` (`turno Turno`, `@@unique([grado_id, seccion_id, anio_escolar_id])`),
`enum Turno { manana tarde }`, y `Matricula` (`usuario_id`, `aula_id`, `anio_escolar_id`,
`@@unique([usuario_id, aula_id, anio_escolar_id])`). Todas las FK usan `onDelete: Restrict`
(D1 del diseño de `#2`).

**"Un solo año escolar activo a la vez" ya es un invariante de base de datos**, no una regla de
aplicación pendiente. Vive como índice único parcial en SQL raw en
`apps/backend/prisma/migrations/20260807033309_identity_and_academic_tree/migration.sql`:

```sql
CREATE UNIQUE INDEX "anio_escolar_activo_unico_idx"
  ON "AnioEscolar" ("activo") WHERE "activo" = true;
```

Un segundo `activo = true` es rechazado por Postgres (`23505`/`P2002`). Ya hay tests de rechazo
cubriendo esto en el archive de `#2`. El trabajo de `#8` es exponer un endpoint que traduzca ese
error a un mensaje de negocio legible — no reimplementar la exclusividad.

`Usuario` ya expone `matriculas Matricula[]` (línea 71 de `schema.prisma`). `UsersService`/
`UsersController` de `#7` no tocan esa relación — el CRUD de `#7` es puro identidad/rol/estado.

**Ninguna capa de aplicación existe todavía** para estas entidades: `apps/backend/src/` solo
tiene `auth/`, `auditoria/`, `email/`, `health/`, `system-ping/`, `prisma/`, `redis/`, `users/`.

**PRD.md/TECH-DESIGN.md confirman el alcance sin fijar reglas finas**: PRD línea 102 confirma el
invariante; PRD línea 93 aclara que el congelamiento del padrón (`#13`) es quien preserva la foto
histórica, no `#8`. Ningún ADR (0001-0013) cubre la estructura académica directamente — el diseño
archivado de `#2` marca la jerarquía como "provisional hasta que `#8` fije las reglas de negocio".

## Áreas afectadas

- `apps/backend/src/academico/` (nuevo) — CRUD para las 6 entidades
- `apps/backend/src/app.module.ts` — registrar módulo(s) nuevo(s)
- `apps/backend/src/auditoria/audit-event-types.ts` — claves aditivas
- `apps/backend/prisma/schema.prisma` — probablemente sin cambios (confirmar en `sdd-design`)

## Enfoques posibles

1. **Un `AcademicoModule` único** con varios controllers/services internos — Pros: cohesión, un
   solo lugar para la regla de activación; Cons: puede exceder 400 líneas/PR sin corte explícito
   — Esfuerzo: Medio-Alto.
2. **Módulos separados por entidad** (`AniosEscolaresModule`, `ArbolAcademicoModule`,
   `MatriculasModule`) — Pros: cortes de PR naturales; Cons: más wiring cruzado — Esfuerzo: Medio.
3. **Rutas anidadas vs. planas**: `Aula`/`Matricula` dependen de más de un padre, probablemente
   exige un híbrido — decisión de `sdd-design`, no bloqueante.

## Recomendación

Proceder a `sdd-propose`. Modelo de datos cerrado, invariante de año único ya en el motor,
patrones de `#7` (DTOs sin `class-validator`, `AuthGuard`/`RolesGuard`,
`AuditoriaService.log(tx,...)` transaccional, catálogo de errores local al módulo) trasladables
directamente.

## Riesgos

- Reglas de negocio finas sin declarar: roles administradores del árbol, activación automática
  vs. manual del año, `DELETE` físico vs. lógico por entidad.
- `DELETE` físico choca con `onDelete: Restrict` en cascada — necesita guarda de aplicación
  explícita.
- `#9` (importación Excel) y `#11` (procesos electorales) dependen de `#8` — se recomienda
  exponer upsert idempotente reutilizable.
- Coordinar con `#10`: `Configuracion.anio_escolar_id` ya referencia `AnioEscolar`.

## Listo para propuesta

Sí.
