# Proposal: Administración académica (año escolar, árbol académico y matrícula)

## Intent

El modelo de datos del árbol académico (`AnioEscolar`, `Nivel`, `Grado`, `Seccion`, `Aula`,
`Matricula`, `enum Turno`) existe desde `#2`, pero no hay ninguna capa de aplicación que lo
exponga. Sin esta capa, nadie puede configurar el año escolar activo, dar de alta la jerarquía
académica ni matricular estudiantes — bloqueando `#9` (importación Excel), `#10` (configuración
general) y `#11` (procesos electorales), que dependen de leer/escribir estas entidades. El
invariante "un solo año escolar activo" ya vive en Postgres como índice único parcial; falta
solo traducir su violación (`23505`/`P2002`) a un error de negocio legible.

## Scope

### In Scope
- CRUD de `AnioEscolar`, `Nivel`, `Grado`, `Seccion`, `Aula` y `Matricula`.
- Endpoint de activación de año escolar que desactiva el anterior de forma atómica.
- Traducción de la violación del índice único parcial de año activo a un error de negocio
  legible (HTTP 409/422, catálogo local de errores como en `#7`).
- Guardas de aplicación para los `DELETE` restringidos por `onDelete: Restrict` (mensaje de
  negocio legible en vez de dejar propagar el error crudo de Postgres).
- Autorización por rol (`administrador`/`director`, permisos idénticos, patrón de `#7`).
- Entradas de auditoría (`AuditoriaService.log(tx, ...)`) para altas/bajas/activación.

### Out of Scope
- Congelamiento del padrón al abrir un proceso electoral (`#13`).
- Importación masiva desde Excel (`#9`).
- Cambios al modelo de datos/migraciones (el schema ya existe; solo se confirma en `sdd-design`
  si algo aditivo llegara a faltar).
- UI/frontend de administración académica (fuera del alcance backend de este change).

## Capabilities

### New Capabilities
- `academic-tree-management`: alta, edición, baja y consulta de `Nivel`, `Grado`, `Seccion`,
  `Aula`, con las restricciones de unicidad ya existentes en el schema.
- `school-year-management`: alta/edición/consulta de `AnioEscolar` y activación exclusiva con
  desactivación atómica del año previamente activo.
- `student-enrollment`: alta/baja/consulta de `Matricula` (asociación `Usuario`↔`Aula`↔`AnioEscolar`).

### Modified Capabilities
- Ninguna. `base-schema` no se modifica a nivel de requisitos — solo se le agrega una capa de
  aplicación.

## Approach

Replicar el patrón consolidado en `#7` (`administracion-usuarios-apoderados`): NestJS module(s)
con DTOs planos (sin `class-validator`, validación manual como en `users.service.ts`), guard de
roles a nivel de clase (`@Roles('administrador', 'director')`), catálogo de errores de negocio
local al módulo, y `AuditoriaService.log(tx, ...)` dentro de la misma transacción Prisma que la
escritura. La activación de año escolar usa una transacción que desactiva el año actual y activa
el nuevo, capturando el `P2002` del índice parcial como colisión de concurrencia (dos activaciones
simultáneas) en vez de violación de negocio.

Estructura de módulo(s): se recomienda evaluar un único `AcademicoModule` con controllers internos
separados por entidad (cohesión, un solo lugar para la regla de activación) versus módulos
independientes por entidad (cortes de PR más naturales, ya usado en `#7` con `UsersModule` +
`ApoderadosController`). Esta decisión se deja abierta para `sdd-design`/`sdd-tasks`, condicionada
al presupuesto de 400 líneas por PR.

## Decisiones de alcance tomadas por ambigüedad

1. **DELETE físico vs. lógico**: se asume `DELETE` físico para `Nivel`/`Grado`/`Seccion`/`Aula`/
   `AnioEscolar` (ninguna tiene historial propio como `Usuario`), protegido por `onDelete:
   Restrict` ya existente — la aplicación solo traduce el error de FK a un mensaje legible. Para
   `Matricula`, se asume también `DELETE` físico (retiro/traslado de un estudiante), dado que el
   congelamiento del padrón para fines históricos es responsabilidad explícita de `#13`, no de
   `#8` (confirmado en PRD línea 93). **A confirmar con el usuario.**
2. **Activación de año escolar**: se asume un endpoint dedicado (`PATCH
   /anios-escolares/:id/activar`) que desactiva atómicamente el año previamente activo dentro de
   la misma transacción, en vez de exigir al cliente dos llamadas separadas — evita una ventana
   sin año activo o con dos años activos a mitad de camino. **A confirmar con el usuario.**
3. **Roles administradores**: se asume `administrador`/`director` con permisos idénticos, mismo
   patrón que `#7` (`@Roles('administrador', 'director')` a nivel de clase) — no hay ADR ni PRD
   que restrinja el árbol académico a un subconjunto distinto de roles.
4. **Estructura de módulo(s)**: se deja como decisión abierta de `sdd-design`/`sdd-tasks` entre
   `AcademicoModule` único vs. módulos separados por entidad (ver Approach).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/src/academico/` | New | Módulo(s), controllers, services, DTOs para las 6 entidades |
| `apps/backend/src/app.module.ts` | Modified | Registro del/los módulo(s) nuevo(s) |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modified | Claves de evento aditivas (alta/baja/activación) |
| `apps/backend/prisma/schema.prisma` | Unlikely | Sin cambios esperados; confirmar en `sdd-design` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `DELETE` físico choca con `onDelete: Restrict` en cascada dejando errores crudos de Postgres | Medium | Catálogo de errores de negocio local, mismo patrón que `#7` |
| Ambigüedad en reglas de activación de año escolar sin cerrar antes de `sdd-spec` | Medium | Documentado explícitamente arriba; confirmar con el usuario antes de continuar |
| Corte de PR mal dimensionado si se usa un único `AcademicoModule` (6 entidades + activación) | Medium | Definir el corte explícitamente en `sdd-tasks` con presupuesto de 400 líneas |
| `#9`/`#11` dependen de un contrato estable de `#8` | Low | Diseñar el CRUD/activación como reutilizable desde el inicio (endpoints idempotentes donde aplique) |

## Rollback Plan

Revertir el/los commit(s) del PR correspondiente. Sin migraciones nuevas de por medio (el schema
ya existe), el rollback es puramente de código de aplicación: eliminar el módulo nuevo y su
registro en `app.module.ts`. No hay impacto en datos existentes porque este change no reescribe
el modelo de datos.

## Dependencies

- `#7` (`administracion-usuarios-apoderados`): implementado en la rama actual, provee el patrón de
  módulo/DTOs/roles/auditoría a reutilizar.
- `#2` (`base-schema-and-migrations`): provee el modelo de datos completo y el invariante de año
  único como índice de base de datos.

## Success Criteria

- [ ] Las 6 entidades académicas tienen CRUD expuesto vía API REST, autenticado y autorizado por
      rol.
- [ ] Activar un año escolar desactiva atómicamente el anterior; una violación de concurrencia
      produce un error de negocio legible, no un 500 crudo.
- [ ] Los `DELETE` restringidos por FK devuelven un mensaje de negocio legible en vez de propagar
      el error de Postgres.
- [ ] Toda escritura queda registrada en auditoría dentro de la misma transacción.
