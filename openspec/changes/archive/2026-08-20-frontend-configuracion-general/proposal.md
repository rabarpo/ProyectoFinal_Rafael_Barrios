# Proposal: frontend-configuracion-general (Backlog #28)

## Intent

El backend de configuración institucional (#10) está completo y archivado
(`GET`/`PUT /configuracion`, `GET /configuracion/comite`, `POST`/`GET /configuracion/logo`), pero
`administrador`/`director` no tienen forma de editar nombre, director, colores, zona horaria,
dominios Google, SMTP, ni subir el logo, salvo llamando la API a mano. El menú ya reserva el
placeholder `configuracion` (#25), hoy "Próximamente". Este change lo activa.

## Scope

### In Scope
- Formulario de edición del singleton `Configuracion` (merge parcial vía `PUT`): nombre, director,
  color primario/secundario, zona horaria, `dominios_google` (arreglo editable, vacío = fail-closed
  explícito), host/puerto/remitente SMTP.
- Subida de logo institucional (PNG/JPG/SVG, máx. 2 MB) embebida en la misma página, reutilizando el
  precedente `CampoArchivo` (`apps/frontend/src/candidatos/piezas/CampoArchivo.tsx`) y el patrón
  `FormData` de `candidatos-api.ts` (`aFormData` + `body as never` sobre `openapi-fetch`).
- Lista de solo lectura de integrantes del comité (`GET /configuracion/comite`) en la misma página —
  sin edición: eso vive en #27.
- Cliente API nuevo `apps/frontend/src/configuracion/configuracion-api.ts`.
- Una sola `Ruta` `configuracion`, sin sub-rutas.
- Activar el placeholder `configuracion` en `menu-por-rol.ts` a `navegable` para
  `administrador`/`director` (`comite` no tiene acceso en el backend).

### Out of Scope
- Campo de contraseña SMTP — nunca es parte de `ActualizarConfiguracionDto`; sigue viniendo
  exclusivamente de `SMTP_USER`/`SMTP_PASSWORD` en variable de entorno. El formulario no debe
  ofrecer ni sugerir ese campo.
- Edición o alta de usuarios `comite` desde esta pantalla (#27).
- Cualquier cambio de backend — #10 ya está completo y archivado.
- Reapertura de D10/D11 del enrutador o del mapa rol→items de #25 — solo se extiende.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `configuracion-institucional`: agrega requisitos de UI para editar el singleton (merge parcial),
  subir/reemplazar el logo, y listar (solo lectura) el comité.
- `minimal-frontend-router`: agrega la variante `Ruta` `configuracion`.

## Approach

Recomendación de exploration.md **confirmada**: una sola página de formulario con subida de logo
embebida, sin fragmentar en más rutas — es un singleton sin jerarquía, el dominio más simple de los
4. Verificado contra el controller real: tres endpoints (`GET`/`PUT /configuracion`,
`GET /configuracion/comite`, `POST`/`GET /configuracion/logo`), ninguno justifica una ruta propia.

Precedente de upload de archivo **confirmado, no hay que crear el patrón desde cero**:
`CampoArchivo.tsx` ya es presentacional puro y reutilizable (usado hoy por `FormularioCandidato` y
planeado para `FormularioLista`), y `candidatos-api.ts` ya resuelve `FormData` sobre
`openapi-fetch` (`aFormData`, verificado que `bodySerializer` no necesita override). El cliente de
configuración reutiliza ambos en vez de reinventar validación de tipo/tamaño o progreso del lado
cliente.

`dominios_google` es un arreglo de strings editable (no un campo simple) — `sdd-design` fija el
control de UI exacto (chips/lista con alta y baja).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/frontend/src/configuracion/configuracion-api.ts` | New | Cliente API: singleton, comité (solo lectura), logo |
| `apps/frontend/src/configuracion/ConfiguracionPage.tsx` | New | Formulario único: datos institucionales + logo + lista de comité |
| `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` | Modified | Variante `Ruta` `configuracion` |
| `apps/frontend/src/app/menu-por-rol.ts` | Modified | Placeholder `configuracion` → `navegable` (administrador/director) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Formulario podría insinuar un campo de contraseña SMTP inexistente en el DTO | Low | UI omite explícitamente ese campo; documentado en Out of Scope |
| `dominios_google` vacío es un valor válido fail-closed, distinto de "ausente" | Low | UI debe permitir guardar arreglo vacío explícitamente, no solo campos con valor |
| Confusión de alcance con #27 (comité es solo lectura acá) | Low | Lista de comité sin acciones de escritura; documentado en Out of Scope |

Exploration.md marcó "ningún riesgo significativo" — **confirmado**: el único punto abierto
(precedente de upload) ya se verificó y existe, así que no queda incertidumbre técnica relevante
para este dominio.

## Rollback Plan

Revertir los commits del change. Sin migraciones ni datos persistidos nuevos — el placeholder
`configuracion` vuelve a `proximamente` en `menu-por-rol.ts` si se revierte esa línea.

## Dependencies

- #10 (backend de configuración institucional) y #25 (menú/enrutamiento) — ambos archivados,
  prerequisitos cumplidos.
- #26 (`frontend-administracion-academica`) — precedente de estructura de `comun/piezas/`, aunque
  este change no necesita `TablaGenerica`/`FormularioGenerico` (formulario único, no CRUD tabular).
- `apps/frontend/src/candidatos/piezas/CampoArchivo.tsx` y el patrón `FormData` de
  `candidatos-api.ts` — reutilizados sin recrear.

## Success Criteria

- [ ] `administrador`/`director` editan nombre, director, colores, zona horaria, dominios Google y
      SMTP (sin contraseña) desde `/configuracion`, sin llamar la API a mano.
- [ ] El logo institucional se sube/reemplaza desde la misma página con `CampoArchivo`.
- [ ] La lista de comité se ve en modo solo lectura, sin ninguna acción de edición.
- [ ] `comite` no ve el item `configuracion` en el menú.
