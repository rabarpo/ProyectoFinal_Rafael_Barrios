# Proposal: frontend-administracion-usuarios (Backlog #27)

## Intent

El dominio de usuarios/apoderados/bloqueo backend (#6, #7) está completo y archivado, pero
`administrador`/`director` no tienen forma de gestionar `Usuario` (5 roles), los `Apoderado` de un
estudiante, ni desbloquear una cuenta bloqueada, salvo llamando la API a mano. El menú ya reserva un
placeholder `usuarios` (#25) que hoy es "Próximamente". Este change lo activa.

## Scope

### In Scope
- CRUD de `Usuario` (crear/editar/cambiar estado activo↔inactivo) para los 5 roles
  (`estudiante/docente/comite/administrador/director`) — sin `DELETE` ni campo de contraseña (login
  es Google OAuth).
- Gestión de `Apoderado` (crear/editar/eliminar físico) como panel contextual dentro de la ficha de
  un `Usuario`, visible solo cuando `rol === 'estudiante'`.
- Pantalla propia "Cuentas bloqueadas" (`GET /auth/usuarios/bloqueados` + desbloqueo manual con
  `POST /auth/usuarios/:id/desbloquear`), **reservada al rol `comite`** — no un panel dentro de la
  ficha de `Usuario`: el backend gatea ambos endpoints con `@Roles('comite')`, mientras que
  `UsersController` (la ficha) es `@Roles('administrador','director')` — son roles disjuntos, la
  acción no puede vivir anidada donde el borrador original la había puesto (decisión confirmada
  2026-08-20, ver "Proposal question round").
- Cliente API nuevo `apps/frontend/src/usuarios/usuarios-api.ts` — `Usuario`, `Apoderado`, y el
  listado/desbloqueo de `AuthController`.
- Una `Ruta` `usuarios` con listado central + filtro por rol/estado (alcanzable por
  `administrador`/`director`) y una `Ruta` separada para "Cuentas bloqueadas" (alcanzable solo por
  `comite`), reutilizando `TablaGenerica`/`FormularioGenerico`/`DialogoConfirmacion` de
  `comun/piezas/` (#26).
- Ocultamiento de acciones de escritura para `comite` en `/usuarios` (no tiene acceso alguno a ese
  dominio en el backend) y ocultamiento de "Cuentas bloqueadas" para todo rol que no sea `comite`.
- Activar el placeholder `usuarios` en `menu-por-rol.ts` a `navegable` para `administrador`/
  `director`, y agregar un item de menú nuevo "Cuentas bloqueadas" navegable solo para `comite`.

### Out of Scope
- Cualquier cambio de backend — #6/#7 ya están completos y archivados.
- Reapertura de D10/D11 del enrutador o del mapa rol→items de #25 — solo se extienden.
- Vista o ruta de primer nivel para `Apoderado` — es contextual a un `Usuario`, no una sección
  independiente. ("Cuentas bloqueadas" SÍ es una ruta de primer nivel, ver In Scope: el rol
  disjunto entre quien puede ver la ficha y quien puede desbloquear lo exige.)
- Deep-linking a un usuario/pestaña específica dentro de `usuarios` (refinamiento futuro).
- Reglas de UI por-rol dentro de `CrearUsuarioDto` más allá de lo que el DTO ya exige — el detalle
  exacto de campos por rol se fija en `sdd-design`.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `administracion-usuarios-apoderados`: agrega requisitos de UI para alta/edición/cambio de estado
  de `Usuario` y CRUD de `Apoderado` anidado a un estudiante.
- `bloqueo-desbloqueo-cuentas`: agrega requisitos de UI para listar y desbloquear manualmente
  cuentas bloqueadas.
- `minimal-frontend-router`: agrega las variantes `Ruta` `usuarios` y `cuentas-bloqueadas`.

## Approach

Enfoque de exploration.md confirmado **parcialmente**: `Apoderado` sí es un panel contextual dentro
de la ficha de `Usuario` (Enfoque 2 de exploration.md descartado para este caso — `ApoderadosController`
es un sub-recurso anidado, `409` si `rol !== 'estudiante'`, no tiene sentido sin un `Usuario` ya
seleccionado). El desbloqueo manual, en cambio, **no puede** anidarse en la ficha: verificado contra
el backend real, `AuthController.listarBloqueados`/`desbloquear` están gateados con
`@Roles('comite')`, mientras que `UsersController` (la ficha completa) es
`@Roles('administrador','director')` — son roles disjuntos. Corrección post-spec (confirmada por el
usuario el 2026-08-20): "Cuentas bloqueadas" es una pantalla y un item de menú de primer nivel,
reservados a `comite`, independientes de `/usuarios`.

Cliente API nuevo desde cero (mismo estilo `openapi-fetch` que `candidatos-api.ts`/`academico-api.ts`).
Reutilizar `TablaGenerica`/`FormularioGenerico`/`DialogoConfirmacion` de `comun/piezas/` (precedente
de #26) en vez de crearlos de nuevo. Ficha de usuario con lógica condicional explícita: panel de
apoderados solo si `rol==='estudiante'`. Vista separada de cuentas bloqueadas con botón de
desbloqueo por fila, confirmación explícita cuyo texto mencione que la acción queda auditada.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/frontend/src/usuarios/usuarios-api.ts` | New | Cliente API: `Usuario`, `Apoderado`, listado/desbloqueo de bloqueo |
| `apps/frontend/src/usuarios/UsuariosPage.tsx` | New | Listado central + filtro por rol/estado (administrador/director) |
| `apps/frontend/src/usuarios/FichaUsuarioPage.tsx` | New | Alta/edición + panel apoderados (sin desbloqueo — ver fila siguiente) |
| `apps/frontend/src/usuarios/CuentasBloqueadasPage.tsx` (o similar) | New | Listado + desbloqueo manual, reservado a `comite` |
| `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` | Modified | Variantes `Ruta` `usuarios` y `cuentas-bloqueadas` |
| `apps/frontend/src/app/menu-por-rol.ts` | Modified | Placeholder `usuarios` → `navegable` (admin/director); nuevo item `cuentas-bloqueadas` → `navegable` (comite) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sin cliente API previo — más superficie nueva que #26 | Med | `sdd-design` fija el contrato completo antes de codear |
| `CrearUsuarioDto` cubre 5 roles con reglas potencialmente distintas por rol | Med | Verificar el DTO exacto en `sdd-design` antes de fijar el formulario |
| Desbloqueo manual es acción auditada (ADR-0008) — UI debe evitar sensación de botón silencioso | Low | Diálogo de confirmación explícito con mensaje de consecuencia registrada |
| Ficha de usuario concentra lógica condicional (apoderados + 5 roles) | Med | Panel de apoderados bien delimitado, sin mezclar validación entre roles |
| PR único puede exceder presupuesto de 400 líneas | Med | `sdd-tasks` evalúa corte por PR (p.ej. api, luego listado, luego ficha+apoderados, luego cuentas bloqueadas) |

## Rollback Plan

Revertir los commits del change. Sin migraciones ni datos persistidos nuevos — el placeholder
`usuarios` vuelve a `proximamente` en `menu-por-rol.ts` si se revierte esa línea.

## Dependencies

- #6 (bloqueo/desbloqueo), #7 (usuarios/apoderados backend) y #25 (menú/enrutamiento) — todos
  archivados, prerequisitos cumplidos.
- #26 (`frontend-administracion-academica`) — provee `comun/piezas/{TablaGenerica,FormularioGenerico,DialogoConfirmacion}.tsx`, reutilizables sin recrearlos.

## Success Criteria

- [ ] `administrador`/`director` gestionan los 5 roles de `Usuario` desde `/usuarios` sin llamar la API a mano.
- [ ] Apoderados de un estudiante se gestionan desde la ficha de ese usuario, nunca como sección independiente.
- [ ] Cuentas bloqueadas se desbloquean manualmente desde la pantalla "Cuentas bloqueadas" (rol `comite`), con confirmación explícita auditada.
- [ ] `comite` no ve el item `usuarios` ni ningún botón de escritura de ese dominio; `administrador`/`director` no ven el item "Cuentas bloqueadas".

## Proposal question round (resuelto 2026-08-20)

1. Ficha de usuario como pantalla única con panel condicional de apoderados — **confirmado**, no
   ruta separada para apoderados.
2. Nombre de archivo de la vista de detalle/edición — **confirmado `FichaUsuarioPage.tsx`**.
3. Corte de PRs — **confirmado el sugerido en Riesgos** (api → listado → ficha+apoderados → cuentas
   bloqueadas) como punto de partida; `sdd-tasks` puede afinarlo si el presupuesto de 400 líneas lo
   exige, mismo criterio que #26.
4. **Ubicación de la UI de desbloqueo (resuelto post-spec, 2026-08-20)**: al verificar
   `AuthController` se encontró que desbloqueo/listado de bloqueados son `@Roles('comite')`, rol
   disjunto del que puede ver la ficha de `Usuario` (`administrador`/`director`). Confirmado:
   pantalla e item de menú propios "Cuentas bloqueadas", reservados a `comite`, en vez del panel
   contextual que este documento planteaba originalmente.
