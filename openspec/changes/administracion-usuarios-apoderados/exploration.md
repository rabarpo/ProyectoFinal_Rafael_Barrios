# Exploración: administracion-usuarios-apoderados (Backlog #7 — Administración de usuarios y apoderados)

## Estado actual

**El modelo de datos ya existe, no se espera cambio de esquema.** `apps/backend/prisma/schema.prisma`
ya tiene `enum RolUsuario { estudiante docente comite administrador director }` (los 5 roles del
alcance de #7 ya están presentes) y `enum EstadoUsuario { activo inactivo bloqueado }`. `model
Usuario` tiene `nombres, dni (@unique), codigo (@unique), correo (@unique), rol, estado,
creado_en, password_hash (nullable), google_id (nullable, @unique)`. `model Apoderado` ya está
vinculado a `Usuario` vía `onDelete: Cascade` — coincide exactamente con ADR-0011.

**No existe capa de aplicación todavía.** `apps/backend/src/` solo tiene `auth/`, `auditoria/`,
`email/`, `health/`, `system-ping/`, `prisma/`, `redis/` — ningún módulo `users/`/`usuarios/`.
`app.module.ts` solo importa `HealthModule, SystemPingModule, AuditoriaModule, AuthModule`.

**Primitivas de auth reutilizables de #4** (`openspec/specs/auth-server-sessions/spec.md`,
archivado): `AuthGuard`, `RolesGuard` + `@Roles()` (`apps/backend/src/auth/roles.guard.ts`,
`roles.decorator.ts`), patrón de cableado visible en `auth.controller.ts`
(`@UseGuards(AuthGuard, RolesGuard)` a nivel de ruta).

**Auditoría (#3)**: `AuditoriaService.log(tx, eventType, actorId, entityType, entityId, payload)`
debe correr dentro de `prisma.$transaction()`. `AUDIT_EVENT_TYPES`
(`apps/backend/src/auditoria/audit-event-types.ts`) hoy solo tiene claves de auth — #7 necesita
claves nuevas aditivas (`USUARIO_CREADO`, etc.) — no toca la cláusula `WHEN` del trigger de
ADR-0016 (solo cubre `VOTO`/`RECHAZO`).

**Patrón de contraseña ya resuelto por #5**: usuarios creados por un administrador probablemente
necesitan `password_hash = null`; el usuario establece su primera contraseña vía `POST
/auth/recovery/confirm` (ya maneja tanto reseteo como "primera contraseña" según los comentarios
de `auth.controller.ts`) o inicia sesión directamente vía Google OAuth.

**ADR-0011** (`adrs/0011-voto-del-padre-cuenta-estudiante.md`): los padres no tienen cuenta de
login; `Apoderado` es solo dato de contacto, se borra en cascada junto con el estudiante. Esto fija
el contrato: el CRUD de `Apoderado` es un sub-recurso anidado de `Usuario`, nunca un recurso de
auth independiente.

**PRD/TECH-DESIGN**: confirma los campos (nombre, DNI, código, correo, estado, rol) y que
`administrador`/`director` administran usuarios (no `comite`). `bloqueado_hasta` mencionado en
TECH-DESIGN pertenece a #6, no a #7 — el esquema correctamente carece de esa columna hoy.

## Áreas afectadas

- `apps/backend/src/users/` (nuevo) — `UsersModule`, `UsersController`, `UsersService`, DTOs,
  sub-recurso anidado `Apoderado`
- `apps/backend/src/app.module.ts` — registrar `UsersModule`
- `apps/backend/src/auditoria/audit-event-types.ts` — claves nuevas aditivas
- `apps/backend/prisma/schema.prisma` — probablemente sin cambios (confirmar en sdd-design)
- `openspec/specs/auth-server-sessions/spec.md`, `openspec/specs/google-oauth-y-recuperacion/spec.md`
  — solo consumidas, no modificadas

## Enfoques

1. **`UsersModule` con `Apoderado` anidado bajo `Usuario`** — rutas `/usuarios` (CRUD completo por
   rol) y `/usuarios/:id/apoderados` (solo válido cuando `rol === 'estudiante'`).
   - Pros: fiel a ADR-0011, un registro de auditoría por operación, consistente con el patrón ya
     existente de `auth.controller.ts`
   - Cons: el controller puede crecer si se agregan filtros/paginación más adelante
   - Esfuerzo: Medio

2. **Módulos separados (`UsersModule` + `ApoderadosModule`)** con `/apoderados` como recurso de
   primer nivel.
   - Pros: separación más limpia si `Apoderado` crece en complejidad
   - Cons: contradice la intención declarada de ADR-0011 ("sin ciclo de vida de cuenta de padre")
   - Esfuerzo: Medio-Alto, sin beneficio claro

## Recomendación

Enfoque 1 — sub-recurso `Apoderado` anidado bajo `UsersModule`, reutilizando
`RolesGuard`/`@Roles('administrador', 'director')` y el patrón transaccional de
`AuditoriaService` ya existentes. No se espera migración de Prisma.

## Riesgos

- Reglas de validación aún no explícitas (formato de DNI, exigencia de dominio institucional en
  creación manual, transiciones válidas de `estado`) — deben declararse explícitamente en
  propose/spec, no dejarse implícitas.
- La división exacta de permisos entre `administrador` y `director` no está documentada — ningún
  ADR la cubre; requiere una decisión de producto en sdd-propose.
- El DELETE físico probablemente choca con `onDelete: Restrict` en la mayoría de las relaciones
  salientes de `Usuario` — #7 debería implementar solo desactivación lógica (`estado = inactivo`),
  a declarar explícitamente.
- Nota de coordinación (no bloqueante): #6 (bloqueo de cuentas) más adelante agregará
  `bloqueado_hasta` y posiblemente extienda cualquier endpoint de cambio de `estado` que cree #7 —
  el diseño debería señalar esto para que #6 no duplique el endpoint.
- Gancho para #9 (importación de Excel): se recomienda que `UsersService` exponga un método de
  creación/upsert reutilizable y apto para lotes (idempotente por DNI/código) para que #9 pueda
  reutilizar la lógica de validación fila a fila sin duplicarla. No implementar ahora.

## Listo para propuesta

Sí — el modelo de datos está cerrado (sin migración necesaria), las primitivas de auth/auditoría
están listas para reutilizar, y las preguntas abiertas son decisiones de producto para
`sdd-propose`, no bloqueos técnicos.
