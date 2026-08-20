# Exploración: frontend-administracion-usuarios (Backlog #27 — Frontend de administración de usuarios y apoderados)

## Estado actual

Origen: partido del change `frontend-administracion` original (#26 previo a la subdivisión del
2026-08-20). Este documento recorta la investigación compartida a lo que aplica exclusivamente al
dominio de usuarios/apoderados/bloqueo.

Backend:
- `UsersController` (`apps/backend/src/users/users.controller.ts`, ruta `/usuarios`):
  `@Roles('administrador','director')` a nivel de clase. CRUD **sin `DELETE`** — la "baja" de un
  usuario es `PATCH :id/estado` (solo transiciona `activo`↔`inactivo`, nunca a/desde `bloqueado`,
  que es un estado propio del sistema de auth). `CrearUsuarioDto` cubre los 5 roles del sistema
  (`estudiante/docente/comite/administrador/director`) — sin `password_hash`: el login real es
  Google OAuth de dominio, no hay contraseña que fijar desde este formulario.
- `ApoderadosController` (`apps/backend/src/users/apoderados.controller.ts`, ruta
  `/usuarios/:usuarioId/apoderados`): sub-recurso anidado, sólo válido si
  `Usuario.rol === 'estudiante'` (`409 USUARIO_NO_ES_ESTUDIANTE` si se intenta en cualquier otro
  rol). `Apoderado` no tiene login propio (ADR-0011) — es un registro de contacto vinculado al
  estudiante, no una cuenta. `DELETE` acá sí es borrado físico real (a diferencia de `Usuario`).
- **Bloqueo/desbloqueo vive en `AuthController`, no en `UsersController`**
  (`apps/backend/src/auth/auth.controller.ts`): `GET` listado de cuentas bloqueadas y
  `POST /usuarios/:id/desbloquear`. El bloqueo automático (N intentos fallidos, expiración 10-15
  min) es enteramente backend — esta UI sólo necesita listar bloqueados y ofrecer el desbloqueo
  manual auditado (#6, ya archivado).

Frontend: **no existe ningún cliente API de usuarios en el frontend hoy** (a diferencia de
académica, que al menos tiene lectura parcial). Este dominio arranca desde cero en el cliente.

Convenciones reutilizables: mismo patrón container/presentational que el resto del proyecto
(`GestionCandidatosPage`/`RegistroCandidatoPage`), `apps/frontend/src/app/rutas.ts` (D10, unión
discriminada cerrada) y `menu-por-rol.ts` (placeholder `usuarios`, visible solo para
`administrador`/`director` — `comite` no tiene ningún acceso a este dominio en el backend, ni
siquiera de lectura).

## Áreas afectadas

- Cliente API nuevo (p. ej. `apps/frontend/src/usuarios/usuarios-api.ts`) — CRUD de `Usuario`,
  sub-recurso de `Apoderado`, y el listado/desbloqueo de `AuthController`.
- `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` — ruta(s) nuevas para gestión de usuarios
  (listado + alta/edición) y, dentro de la ficha de un estudiante, gestión de sus apoderados.
- `apps/frontend/src/app/menu-por-rol.ts` — el placeholder `usuarios` pasa a `navegable` (solo
  para `administrador`/`director`; `comite` sigue sin verlo, ya está bien en el mapa actual).
- Páginas y piezas nuevas — listado de usuarios (con filtro por rol/estado), formulario de
  alta/edición (con validación de los 5 roles), gestión de apoderados anidada al ver un
  estudiante, y una vista/acción de desbloqueo manual.

## Enfoques posibles

1. **Listado único de usuarios con filtro por rol + acción de "ver apoderados" solo visible para
   estudiantes** — Pros: un solo listado central, coherente con cómo el backend modela todo bajo
   `Usuario`; apoderados y bloqueo se resuelven como acciones/paneles secundarios dentro de la
   ficha de un usuario concreto, no como secciones de menú separadas. Cons: la ficha de un
   estudiante concentra bastante lógica condicional (apoderados solo si `rol==='estudiante'`,
   desbloqueo solo si `estado==='bloqueado'`).
2. **Tres secciones separadas** (usuarios, apoderados, cuentas bloqueadas) con navegación cruzada
   por id — Pros: cada pantalla es más simple individualmente. Cons: "apoderados" sin un
   estudiante seleccionado no tiene sentido (es un sub-recurso, no una entidad de primer nivel);
   más rutas de las que el dominio realmente necesita.

## Recomendación

Enfoque 1 — un listado de usuarios como pantalla central, con apoderados y desbloqueo como
acciones contextuales dentro de la ficha de un usuario, no como items de menú de primer nivel.
Corresponde confirmarlo en `sdd-propose`.

## Riesgos

- Sin cliente API previo en el frontend — más superficie nueva que académica (que ya tenía algo de
  lectura).
- `CrearUsuarioDto` cubre 5 roles con reglas potencialmente distintas por rol (p. ej. campos
  relevantes para `docente` vs `estudiante`) — hay que verificar el DTO exacto en `sdd-design`
  antes de fijar el formulario.
- El desbloqueo manual es una acción auditada (ADR-0008) — la UI debe reflejar que es una acción
  con consecuencia registrada, no un botón silencioso.

## Listo para propuesta

Sí.
