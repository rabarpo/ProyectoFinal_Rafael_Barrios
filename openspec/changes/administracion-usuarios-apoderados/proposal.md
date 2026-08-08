# Propuesta: administracion-usuarios-apoderados (Backlog #7 — Administración de usuarios y apoderados)

## Intención

Hoy no existe ninguna forma de crear, consultar, editar o desactivar cuentas de `Usuario` más
allá de lo que dejaron las semillas de `#2`. El esquema (`Usuario`, `Apoderado`, `RolUsuario`,
`EstadoUsuario`) y la capa de autenticación/autorización (`AuthGuard`, `RolesGuard`, `@Roles()`)
ya existen desde `#2` y `#4`, pero ningún módulo de aplicación los expone como CRUD. Sin este
change, la institución no tiene manera operativa de dar de alta a un estudiante, docente,
integrante del comité, administrador o director, ni de registrar al apoderado de un estudiante —
un bloqueo total para cualquier elección real, y una dependencia declarada de `#8` (estructura
académica), `#9` (importación de Excel) y, en última instancia, de todo el padrón que `#13`
necesita materializar.

Este change entrega el módulo `UsersModule`: CRUD de `Usuario` para los cinco roles del sistema
(`estudiante`, `docente`, `comite`, `administrador`, `director`) y CRUD del sub-recurso
`Apoderado` anidado bajo un `Usuario` con `rol = estudiante`, conforme al contrato que fija
ADR-0011: el apoderado es información de contacto vinculada al estudiante, nunca una cuenta de
acceso independiente.

## Alcance

### Dentro de alcance

- `UsersModule` nuevo (`apps/backend/src/users/`): `UsersController`, `UsersService`, DTOs de
  entrada/salida, registrado en `app.module.ts`.
- CRUD completo de `Usuario` sobre los cinco roles (`estudiante`, `docente`, `comite`,
  `administrador`, `director`):
  - **Crear**: nombres, DNI, código, correo, rol; `password_hash = null` en la creación manual
    (el usuario establece su contraseña vía `POST /auth/recovery/confirm` de `#5`, o inicia
    sesión directamente por Google OAuth si su correo pertenece al dominio institucional).
  - **Leer**: obtener uno por id, listar con filtro por rol y por estado.
  - **Actualizar**: nombres, DNI, código, correo, rol; cambio de `estado` como operación propia
    (ver "Transiciones de estado" abajo), no un `PATCH` genérico de campo libre.
  - **Eliminar**: **lógico únicamente** (`estado = inactivo`), nunca `DELETE` físico — ver
    "Por qué no hay borrado físico" abajo.
- CRUD del sub-recurso `Apoderado` anidado bajo `Usuario` (`/usuarios/:id/apoderados`), válido
  únicamente cuando el `Usuario` referenciado tiene `rol = estudiante`; un estudiante puede tener
  cero, uno o más apoderados registrados. Campos: nombres, DNI, correo de contacto (opcional,
  según el esquema ya existente).
- Autorización por rol reutilizando `AuthGuard` + `RolesGuard` + `@Roles('administrador',
  'director')` de `#4` — el comité electoral **no** administra usuarios (PRD, sección de
  actores: "Administradores / Dirección — gestionan usuarios...").
- Claves nuevas y aditivas en `AUDIT_EVENT_TYPES` (p. ej. `USUARIO_CREADO`,
  `USUARIO_ACTUALIZADO`, `USUARIO_DESACTIVADO`, `APODERADO_CREADO`, etc.) y su registro
  transaccional vía `AuditoriaService.log(tx, ...)` para cada operación de escritura — patrón ya
  usado por `#4`/`#5`/`#6`. No se toca la cláusula `WHEN` del trigger de ADR-0016 (solo cubre
  `VOTO`/`RECHAZO`).
- Validaciones de negocio explícitas en la creación/edición: unicidad de DNI, código y correo
  (ya reforzada por `@unique` en el esquema, pero debe traducirse a errores de aplicación
  legibles, no un `500` de violación de constraint).
  - **DNI**: cadena de texto libre, sin formato exacto exigido, máximo 20 caracteres. Decisión
    tomada explícitamente para no acoplar el CRUD a un formato de documento de identidad
    específico (ver "Decisiones confirmadas" abajo).
  - **Correo**: sin exigencia de dominio institucional en la creación manual — solo se valida
    formato de correo y unicidad contra los correos ya existentes en `Usuario` (constraint
    `@unique` del esquema). El dominio institucional configurado (Backlog `#10`) solo condiciona
    el login por Google OAuth de `#5`, no la creación manual de este CRUD.

### Fuera de alcance

- **Borrado físico de `Usuario` o `Apoderado`** — ver justificación abajo.
- **Importación masiva por Excel** — Backlog `#9`. Esta propuesta solo deja `UsersService` con un
  método de creación reutilizable y apto para llamarse fila a fila, pero no implementa la carga
  de archivos, el reporte de errores ni el CSV descargable.
- **Estructura académica** (año escolar, nivel, grado, sección, aula, turno, matrícula) —
  Backlog `#8`. Esta propuesta no crea ni valida la relación `Usuario`↔`Matricula`; el CRUD de
  `Usuario` funciona sin depender de `#8`.
- **Bloqueo/desbloqueo de cuentas** — Backlog `#6`, ya implementado y archivado. Este change no
  agrega ni modifica el endpoint que cambia `estado` a `bloqueado` ni gestiona
  `bloqueado_hasta`; su propio cambio de `estado` (activo ⇄ inactivo) es una transición distinta
  y no debe colisionar con la de `#6` (ver "Transiciones de estado").
- **Autoservicio de perfil** (que un usuario edite sus propios datos) — este change cubre
  exclusivamente la administración por `administrador`/`director` sobre terceros.
- **Cualquier UI de frontend** — esta propuesta cubre el backend (`UsersModule` + contrato HTTP);
  la interfaz de administración es responsabilidad de una spec de frontend posterior o de
  `sdd-design` de este mismo change si el usuario decide incluirla ahí.

## Por qué no hay borrado físico

`model Usuario` tiene relaciones salientes (`apoderados`, `matriculas`, `derechoVotos`, sesiones,
eventos de auditoría vía `actor_id`, etc.) — la mayoría con `onDelete: Restrict` o equivalente
por diseño de integridad referencial y de auditoría append-only (ADR-0010: un evento de auditoría
no puede perder a su actor). Un `DELETE` físico de `Usuario` violaría esas restricciones en
cuanto existiera cualquier fila relacionada, y en el caso de auditoría rompería la garantía de
trazabilidad completa que el sistema promete. Por eso el "eliminar" de este CRUD es
exclusivamente lógico: `estado = inactivo`. `Apoderado`, en cambio, sí admite borrado físico
porque su única relación es `onDelete: Cascade` hacia `Usuario` y no participa de la cadena de
auditoría por sí mismo (no es actor ni entidad auditable independiente) — así que "eliminar
apoderado" es un `DELETE` real de esa fila.

## Transiciones de estado

`EstadoUsuario` tiene tres valores: `activo`, `inactivo`, `bloqueado`. Este change opera
exclusivamente sobre el eje `activo ⇄ inactivo` (alta/baja administrativa). `bloqueado` es
territorio exclusivo de `#6` (fuerza bruta, expiración automática, desbloqueo manual del comité)
y esta propuesta no lo toca ni en lectura de UI ni en escritura — un administrador que use este
CRUD para reactivar una cuenta `bloqueada` sería un choque de responsabilidades con `#6` que debe
evitarse explícitamente: el endpoint de cambio de estado de este change **rechaza** la
transición hacia o desde `bloqueado` (esa transición pertenece únicamente al flujo de `#6`).

## Enfoque

`UsersModule` con `Apoderado` como sub-recurso anidado bajo `Usuario` (rutas `/usuarios` y
`/usuarios/:id/apoderados`), reutilizando `AuthGuard`/`RolesGuard`/`@Roles()` de `#4` y el patrón
transaccional de `AuditoriaService.log(tx, ...)` de `#3`. Se descarta un módulo `Apoderado`
independiente de primer nivel (`/apoderados`) porque contradice el contrato de ADR-0011 —
`Apoderado` no tiene ciclo de vida propio de cuenta y no debería aparecer como recurso de auth
independiente ni siquiera a nivel de rutas.

No se espera migración de Prisma: el esquema de `#2` (con `bloqueado_hasta` ya agregado por `#6`)
cubre todos los campos que este CRUD necesita.

## Decisiones confirmadas

Estas dos decisiones estaban abiertas en la ronda de preguntas de la propuesta y fueron
respondidas por el usuario antes de avanzar a `sdd-spec`/`sdd-design`:

1. **DNI**: cadena de texto libre, sin validación de formato, máximo 20 caracteres. No se exige
   patrón numérico ni longitud fija — el campo admite cualquier documento de identidad.
2. **Correo de creación manual**: no se exige dominio institucional. Solo se valida formato de
   correo y unicidad contra los correos ya registrados en `Usuario` (constraint `@unique`
   existente en el esquema). El dominio institucional configurado en `#10` sigue aplicando
   únicamente al login por Google OAuth de `#5`, no a este CRUD.
3. **Permisos `administrador` vs. `director`**: idénticos, sin jerarquía interna entre ambos
   roles — confirma la asunción original de la propuesta.

## Riesgos

- **Coordinación con `#6`** (no bloqueante): el endpoint de cambio de `estado` de este change
  debe declarar explícitamente que no gestiona la transición hacia/desde `bloqueado`, para que
  `sdd-design` de este change y cualquier futura evolución de `#6` no dupliquen ni contradigan el
  mismo campo.
- **Gancho para `#9`**: `UsersService` debe exponer un método de creación/upsert reutilizable e
  idempotente por DNI/código, pensado para invocarse fila a fila desde la futura importación de
  Excel — sin implementar hoy ninguna lógica de carga de archivos.

## Criterios de éxito

- [ ] `POST /usuarios` crea un `Usuario` con cualquiera de los cinco roles, `password_hash = null`,
      y registra un evento de auditoría aditivo dentro de la misma transacción.
- [ ] `GET /usuarios` y `GET /usuarios/:id` permiten listar (con filtro por rol/estado) y
      consultar por id, restringido a `administrador`/`director`.
- [ ] `PATCH /usuarios/:id` actualiza datos básicos sin permitir el borrado físico ni una
      transición de `estado` hacia/desde `bloqueado`.
- [ ] La "eliminación" de un `Usuario` es exclusivamente lógica (`estado = inactivo`); ningún
      endpoint ejecuta `DELETE` físico sobre `Usuario`.
- [ ] `POST/GET/PATCH/DELETE /usuarios/:id/apoderados` operan únicamente cuando el `Usuario`
      referenciado tiene `rol = estudiante`; el `DELETE` de `Apoderado` sí es físico.
- [ ] Toda operación de escritura de este módulo deja un evento de auditoría, con claves nuevas
      aditivas en `AUDIT_EVENT_TYPES` que no tocan la cláusula `WHEN` del trigger de ADR-0016.
- [ ] `comite` no tiene acceso a ningún endpoint de este módulo (verificado con `RolesGuard`).
- [ ] `UsersService` expone un método de creación reutilizable, idempotente por DNI/código, apto
      para que `#9` lo invoque sin duplicar validación.

