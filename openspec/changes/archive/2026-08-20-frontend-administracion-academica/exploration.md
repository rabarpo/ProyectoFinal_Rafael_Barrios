# Exploración: frontend-administracion-academica (Backlog #26 — Frontend de administración académica)

## Estado actual

Origen: partido del change `frontend-administracion` original (#26 previo a la subdivisión del
2026-08-20) tras detectar que cubría 4 dominios de backend distintos — ver
`openspec/changes/archive/*/BACKLOG.md` / nota de decomposición en `BACKLOG.md`. Este documento
recorta la investigación compartida a lo que aplica exclusivamente al dominio académico.

Backend (`apps/backend/src/academico/*.controller.ts`) — jerarquía `AnioEscolar → Nivel → Grado →
Sección → Aula`, más `Matricula` (Usuario+Aula+AnioEscolar):
- Los 6 controllers (`anios-escolares`, `niveles`, `grados`, `secciones`, `aulas`, `matriculas`)
  tienen `@Roles('administrador', 'director')` a nivel de clase; los `GET` de cada uno agregan
  `@Roles('administrador', 'director', 'comite')` handler por handler (comité solo lee, nunca
  escribe).
- CRUD completo con `ParseUUIDPipe` en `:id`. `Matricula` **no tiene `PATCH`** — un traslado de
  aula es `DELETE` + `POST` (decisión ya tomada en el backend, no se reabre acá).
- `AnioEscolar` tiene un endpoint extra `PATCH :id/activar` con la invariante "un solo año activo
  a la vez" (`409 ACTIVACION_CONCURRENTE` si dos activaciones chocan).
- Todos los `DELETE` chequean dependientes antes de borrar (`409 ENTIDAD_CON_DEPENDIENTES`):
  Nivel→Grado, Grado→Sección/Aula, Sección→Aula, Aula→Matricula/ProcesoAula, AnioEscolar→todo lo
  anterior.
- Filtros de listado ya soportados por el backend: `secciones?grado_id&anio_escolar_id`,
  `grados?nivel_id`, `aulas?grado_id&seccion_id&anio_escolar_id&turno`,
  `matriculas?usuario_id&aula_id&anio_escolar_id`.

Frontend:
- `apps/frontend/src/academico/academico-api.ts` **ya existe pero solo cubre lectura**:
  `listarNiveles/listarGrados/listarAulas/listarAniosEscolares`. Falta `listarSecciones`,
  `listarMatriculas`, y **todo el CRUD de escritura** (crear/actualizar/eliminar/activar) para las
  6 entidades.
- No hay componente de tabla ni de formulario genérico reutilizable en el repo (#24 solo tokenizó
  clases utilitarias Tailwind). `TablaCandidatos` (`apps/frontend/src/candidatos/piezas/`) es una
  lista `<ul>/<li>` hecha a mano específica de su dominio, no genérica.
- Patrón container/presentational ya establecido: página contenedora con efectos
  (`GestionCandidatosPage`) + piezas presentacionales puras con callbacks
  (`TablaCandidatos`/`FormularioCandidato`), `modo: 'creacion'|'edicion'` derivado de un id
  opcional en props — replicable acá.
- `apps/frontend/src/app/rutas.ts` (D10): unión discriminada cerrada + `parsearRuta`/`rutaAPath`
  totales, switch exhaustivo sin `default`. Agregar una ruta toca 3 puntos (`Ruta`, `parsearRuta`,
  `rutaAPath`) + el `case` en `Enrutador.tsx`.
- `apps/frontend/src/app/menu-por-rol.ts`: el placeholder `academica` (visible para
  `administrador`, `director`, `comite`) hoy es `{ clase: 'proximamente', id: 'academica', ... }`
  — pasar a `navegable` exige una `Ruta` real; el compilador (unión discriminada) impide dejarlo a
  medias.

## Áreas afectadas

- `apps/frontend/src/academico/academico-api.ts` — expandir a CRUD completo de las 6 entidades.
- `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` — ruta(s) nuevas para el dominio académico
  (decisión de diseño: ¿una sola ruta `academica` con navegación interna por pestañas/drill-down
  entre las 6 entidades, o una ruta por entidad? La jerarquía de 6 niveles hace que 6 rutas
  separadas sea plausible pero pesado — a decidir en `sdd-design`).
- `apps/frontend/src/app/menu-por-rol.ts` — el placeholder `academica` pasa a `navegable`.
- Páginas y piezas nuevas bajo `apps/frontend/src/academico/` (o el path que se decida) — listados
  y formularios para las 6 entidades, respetando que `comite` solo tiene acceso de lectura (los
  botones de crear/editar/eliminar/activar no deben renderizarse para ese rol, aunque el backend
  ya los rechaza con 403 — UX defensiva, no la única barrera).
- Ningún cambio de backend — dominio ya completo y archivado (#8).

## Enfoques posibles

1. **Una sola página `academica` con navegación interna (tabs/drill-down) entre las 6 entidades**
   — Pros: 1 sola `Ruta` nueva, coherente con "sin lógica de negocio en el menú" de #25; UX de
   jerarquía visible de un vistazo (año → nivel → grado → sección → aula). Cons: página grande,
   más estado interno de navegación a manejar.
2. **6 rutas independientes, una por entidad** — Pros: cada página es simple y aislada, mismo
   patrón que `GestionCandidatosPage`. Cons: 6 rutas nuevas × 3 puntos de enrutamiento cada una
   (18 ediciones mecánicas), navegación entre entidades relacionadas (¿cómo se llega de "Grados
   del Nivel X" a "Secciones del Grado Y"?) requiere pasar ids por query/params igual que si
   fuera una sola página con estado.
3. **Componente de tabla/formulario genérico reutilizable, construido en este change y usado por
   las 6 entidades** — Pros: evita repetir la misma tabla 6 veces con columnas distintas; sienta
   precedente para #27/#28/#29. Cons: trabajo de diseño de componente genérico antes de poder
   entregar la primera entidad funcional; riesgo de sobre-generalizar sin ver aún los otros 3
   dominios.

## Recomendación

Ninguna fijada — corresponde a `sdd-propose`/`sdd-design` de este change, con el enfoque 1
(una página con navegación interna) como punto de partida más simple, y la decisión del
componente de tabla genérico (enfoque 3) evaluada aparte porque afecta también a #27/#28/#29.

## Riesgos

- Es el dominio con mayor complejidad de jerarquía de los 4 (6 entidades relacionadas, filtros en
  cascada) — el más grande de los 4 ítems nuevos, con más superficie de PRs potenciales si se
  encadenan.
- Sin componente de tabla genérico previo: la primera implementación de este change fija el
  patrón que probablemente repliquen #27/#28/#29 — vale la pena decidirlo con cuidado acá.
- `comite` tiene acceso de solo lectura: la UI debe ocultar acciones de escritura para ese rol sin
  depender únicamente del 403 del backend (defensa en profundidad, no la única barrera real).

## Listo para propuesta

Sí.
