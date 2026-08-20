# Proposal: frontend-administracion-academica (Backlog #26)

## Intent

El dominio académico backend (#8: `AnioEscolar → Nivel → Grado → Sección → Aula` + `Matricula`) está
completo y archivado, pero no tiene UI. `administrador`/`director` no tienen forma de gestionar la
jerarquía académica ni matricular alumnos salvo llamando la API a mano; el menú ya reserva un
placeholder `academica` (#25) que hoy es "Próximamente". Este change lo activa con CRUD completo de
las 6 entidades, incluida la activación de año escolar, y sienta el patrón de tabla/formulario que
reutilizarán #27/#28/#29.

## Scope

### In Scope
- CRUD completo (crear/editar/eliminar) de `AnioEscolar`, `Nivel`, `Grado`, `Sección`, `Aula`,
  `Matrícula` — traslado de matrícula como `DELETE`+`POST` (decisión ya tomada en backend).
- Acción `Activar` para `AnioEscolar` (`PATCH :id/activar`) con confirmación explícita.
- Expansión de `academico-api.ts` a CRUD completo (hoy solo lectura parcial).
- Una `Ruta` `academica` con navegación interna por pestañas entre las 6 entidades.
- Componente de tabla y de formulario genéricos reutilizables (`comun/piezas/`), declarados como
  precedente para #27/#28/#29.
- Ocultamiento de acciones de escritura para el rol `comite` en el cliente (defensa en profundidad).
- Activar el placeholder `academica` en `menu-por-rol.ts` a `navegable`.

### Out of Scope
- Dominios #27 (usuarios/apoderados), #28 (configuración), #29 (importación Excel) — ninguna pantalla
  se construye acá; solo dejamos el componente genérico disponible para que lo reutilicen.
- Cualquier cambio de backend — #8 ya está completo y archivado.
- Reapertura de D10/D11 del enrutador o del mapa rol→items de #25 — solo se extienden.
- Deep-linking a una pestaña/entidad específica dentro de `academica` (queda como refinamiento
  futuro; la navegación interna es estado de componente, no URL).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `academic-tree-management`: agrega requisitos de UI para Nivel/Grado/Sección/Aula.
- `school-year-management`: agrega requisitos de UI para AnioEscolar, incluida la activación.
- `student-enrollment`: agrega requisitos de UI para Matrícula.
- `minimal-frontend-router`: agrega la variante `Ruta` `academica` y su navegación interna.

## Approach

Extender `academico-api.ts` con los wrappers de escritura faltantes (mismo estilo `openapi-fetch`
que `candidatos-api.ts`). Agregar una sola `Ruta` `{ nombre: 'academica' }` (D10/D11 de #12, sin
reabrir) con navegación interna por pestañas entre las 6 entidades — evita 18 ediciones mecánicas de
6 rutas separadas y calza con "sin lógica de negocio en el menú" de #25. Construir
`comun/piezas/TablaGenerica.tsx` y `comun/piezas/FormularioGenerico.tsx` (columnas/campos
declarativos por props) en vez de replicar el patrón `<ul>/<li>` ad-hoc de `TablaCandidatos` seis
veces; #27/#28/#29 podrán importarlos por nombre. UX defensiva de `comite`: `useSesion().rol` decide
qué botones de escritura se renderizan (no solo el 403 del backend). Activación de año: botón
"Activar" por fila en el listado de años, con diálogo de confirmación explícito que advierte que
desactiva el año previamente activo (invariante "un solo año activo a la vez").

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/frontend/src/academico/academico-api.ts` | Modified | CRUD completo de las 6 entidades |
| `apps/frontend/src/academico/AcademicaPage.tsx` (+ pestañas) | New | Contenedor con navegación interna |
| `apps/frontend/src/comun/piezas/TablaGenerica.tsx` | New | Tabla genérica, precedente #27/#28/#29 |
| `apps/frontend/src/comun/piezas/FormularioGenerico.tsx` | New | Formulario genérico, ídem |
| `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` | Modified | Variante `academica` |
| `apps/frontend/src/app/menu-por-rol.ts` | Modified | Placeholder `academica` → `navegable` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Componente genérico sobre-generalizado sin ver #27/#28/#29 | Med | API mínima (columnas/campos por props), sin resolver casos que aún no existen |
| Página `academica` grande, más estado interno de navegación | Med | Pestañas simples con `useState` local; sin URL sub-state en esta primera entrega |
| UX de `comite` inconsistente con el 403 real del backend | Low | Espejar exactamente los `@Roles` por handler ya verificados en exploration.md |
| PR único excede presupuesto de 400 líneas (6 entidades) | High | `sdd-tasks` evalúa corte por PR (p.ej. api+genéricos, luego 2-3 PRs de entidades) |

## Rollback Plan

Revertir los commits del change. Sin migraciones ni datos persistidos nuevos — el placeholder
`academica` vuelve a `proximamente` en `menu-por-rol.ts` si se revierte esa línea.

## Dependencies

- #8 (backend académico) y #25 (menú/enrutamiento) — ambos archivados, prerequisitos cumplidos.

## Success Criteria

- [ ] `administrador`/`director` gestionan las 6 entidades desde `/academica` sin llamar la API a mano.
- [ ] `comite` no ve ningún botón de escritura, solo lectura.
- [ ] Activar un año escolar desactiva el previamente activo, con confirmación explícita.
- [ ] `comun/piezas/TablaGenerica.tsx`/`FormularioGenerico.tsx` existen y son importables por futuros changes.

## Proposal question round

Decisiones fijadas en esta propuesta que quedan abiertas a corrección del usuario:
1. Navegación interna por pestañas (no drill-down por URL) — ¿alcanza para la primera entrega o se
   necesita deep-link a una entidad/pestaña específica?
2. Nombres/ubicación del componente genérico (`comun/piezas/`) — ¿coincide con dónde #27/#28/#29
   esperarían encontrarlo?
3. Activación de año escolar como botón + diálogo de confirmación — ¿alcanza, o se requiere un
   resumen de qué se desactiva (nombre del año previamente activo) en el propio diálogo?
