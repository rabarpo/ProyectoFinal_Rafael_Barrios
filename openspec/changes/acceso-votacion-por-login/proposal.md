# Proposal: Descubrimiento de derechos de voto propios al iniciar sesión

## Intent

Hoy un estudiante que se loguea no tiene ninguna forma, dentro de la app, de llegar a votar: el
menú muestra "Todavía no tenés accesos disponibles en esta sección" y no existe endpoint que
liste sus `DerechoVoto` vigentes. La única vía a la boleta (`/votar/:derechoVotoId`) requiere
conocer el UUID de antemano. La premisa original de "esperar un correo" es incorrecta — no hay
ningún correo que habilite el voto (#15 es solo el comprobante posterior) — pero el síntoma es
real. Este change construye desde cero el paso previo: que el usuario vea sus votaciones
disponibles al entrar y navegue desde ahí.

## Scope

### In Scope
- Endpoint `GET /votos/mis-derechos`, scoped estrictamente a `req.usuario` (nunca acepta
  `usuario_id` de parámetro), que lista los `DerechoVoto` del usuario autenticado en procesos
  con estado `abierto` (`now() < fecha_cierre_prevista` — misma ventana que ya usa
  `votos.service.ts::emitir()`; `cierre_real` queda descartado por ser `NULL` mientras el proceso
  está `abierto`, ver D1 en `design.md`).
- Respuesta agrupada por `en_calidad_de` (`estudiante`/`padre` se muestran como entradas
  separadas, nunca colapsadas — ADR-0011), ordenada por cierre más próximo primero.
- Cada entrada indica si el derecho ya fue usado (`ya_voto: boolean`) sin exponer la elección
  (secreto del voto, ADR-0010).
- Pantalla nueva en frontend que reemplaza el estado vacío de `InicioPage.tsx`/`MENU_POR_ROL`
  para `estudiante`, listando los derechos disponibles; entradas ya votadas se muestran
  bloqueadas ("Ya votaste", sin click); entradas pendientes navegan a `/votar/:derechoVotoId`
  existente.
- Estado vacío genérico ("no tenés votaciones activas en este momento") cuando no hay derechos
  en procesos abiertos.
- Carga única al entrar a la pantalla (sin polling).

### Out of Scope
- `POST /votos` y la transacción `emitir()` de `vote-casting` (#14, ya archivado) — sin cambios.
- Rol `docente`: confirmado que `DerechoVoto` nunca se genera para ese rol (solo
  `estudiante`/`padre`, ambos atados a cuentas de estudiante vía matrícula) — sin endpoint, sin
  item de menú, `MENU_POR_ROL.docente` queda `[]`.
- #19 Notificaciones (correo de "inicio de votación") — backlog separado, no bloquea ni se
  solapa; este change deja el terreno listo para que #19 enlace a la misma ruta.
- Cambios al modelo `DerechoVoto`/`ProcesoElectoral` o a sus migraciones.
- Polling/refresh en vivo mientras el usuario está en la pantalla.
- Distinguir "todavía no abrió" / "ya cerró" / "sin derecho" en el estado vacío — mensaje
  genérico único.

## Capabilities

### New Capabilities
- `descubrimiento-derechos-voto`: listado de `DerechoVoto` vigentes del usuario autenticado
  (backend `GET /votos/mis-derechos`) + pantalla de aterrizaje que reemplaza el estado vacío de
  `estudiante` en `InicioPage`.

### Modified Capabilities
- None (no se toca `vote-casting`; se agrega una capability nueva).

## Approach

Reutilizar el patrón ya establecido (`AuthGuard`, ruta plana) para exponer un endpoint de solo
lectura dentro de `apps/backend/src/votos/` — separado de `votos.controller.ts`/`votos.service.ts`
en su handler pero mismo módulo, sin tocar la ruta `POST /votos`. La consulta filtra
`DerechoVoto` por `usuario_id = req.usuario.id` y `proceso.estado = 'abierto' AND now() <
fecha_cierre_prevista`, sin nuevos DTOs de gestión (evita el approach descartado de ampliar
`GET /procesos`). En frontend, una vista nueva (`apps/frontend/src/votos/`) consume el endpoint y
reemplaza el ítem vacío de `estudiante` en `menu-por-rol.ts`/`InicioPage.tsx`, con navegación a la
`VotacionPage.tsx` existente sin modificarla.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/src/votos/` | New | Endpoint `GET /votos/mis-derechos` + service query, DTO propio |
| `apps/frontend/src/app/InicioPage.tsx`, `menu-por-rol.ts` | Modified | `estudiante` deja de recibir `[]`; nuevo item navegable |
| `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` | Modified | Nueva ruta de listado (`mis-votaciones` o similar) |
| `apps/frontend/src/votos/` | New | Pantalla de listado + consumo del endpoint nuevo |
| `openspec/specs/` | New | Spec nueva `descubrimiento-derechos-voto` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Oráculo de enumeración vía `usuario_id` de parámetro | Med | Endpoint siempre usa `req.usuario`, nunca parámetro de entrada |
| Fuga de secreto del voto (exponer la elección) | Low | Respuesta solo incluye `ya_voto: boolean`, nunca `lista_id`/`candidato_id` |
| Colapsar derechos `estudiante`/`padre` en una sola entrada | Med | Agrupación explícita por `en_calidad_de` (ADR-0011), test dedicado |
| Reabrir accidentalmente `vote-casting` (`POST /votos`) | Low | Nuevo endpoint vive en handler separado; sin cambios a `votos.service.ts::emitir()` |

## Rollback Plan

Revertir el commit(s) del change: elimina el endpoint nuevo y la pantalla nueva, y restaura
`MENU_POR_ROL.estudiante: []`. No hay migraciones de base de datos ni cambios de esquema
involucrados, por lo que el rollback es puramente de código.

## Dependencies

- Ninguna externa. Depende de `DerechoVoto`/`ProcesoElectoral` (`base-schema`) y
  `AuthGuard`/`req.usuario` (`auth-server-sessions`), ambos ya existentes.

## Success Criteria

- [ ] Un estudiante logueado con derechos vigentes ve el listado sin conocer ningún UUID de
      antemano.
- [ ] Derechos `estudiante` y `padre` se muestran como entradas separadas cuando coexisten.
- [ ] Un derecho ya usado se ve bloqueado ("Ya votaste") y no permite reintentar el voto desde la
      UI.
- [ ] El endpoint nunca acepta `usuario_id` como parámetro y rechaza acceso a derechos ajenos.
- [ ] `docente` sigue sin ningún item de menú ni endpoint expuesto.
- [ ] `POST /votos` y sus tests existentes permanecen sin modificar y en verde.
