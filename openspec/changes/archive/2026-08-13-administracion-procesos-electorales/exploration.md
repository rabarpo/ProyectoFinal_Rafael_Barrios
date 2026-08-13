# Exploración: administracion-procesos-electorales (Backlog #11 — Administración de procesos electorales)

## Estado actual

El modelo de datos del proceso electoral ya existe completo en `apps/backend/prisma/schema.prisma`
(depositado por `#2`, grupo "Estructura del proceso electoral", líneas 162–265): `enum TipoProceso
{ municipio representante_aula padres consulta }` (los 4 tipos del PRD), `enum EstadoProceso {
borrador abierto cerrado acta_emitida }`, `model ProcesoElectoral`, `Lista`/`Candidato`/
`OpcionConsulta`, `ProcesoAula` (join proceso↔aula), `DerechoVoto` (padrón, `en_calidad_de` como
`String` plano, no enum).

**`ProcesoElectoral` no tiene columnas `nivel_id`/`grado_id`/`publico_objetivo`** — el único
vínculo académico persistido es `ProcesoAula`. La selección del asistente ("público/nivel/grados/
aulas") no tiene hoy dónde vivir más allá del conjunto de aulas resultante.

**No existe capa de aplicación** para procesos: `apps/backend/src/` no tiene `procesos/`; no hay
entradas `PROCESO_*` en `audit-event-types.ts`. **El frontend está prácticamente vacío**
(`main.tsx` + `HealthPage` únicamente) — el asistente de 4 pasos sería la primera UI no trivial
del proyecto.

Ya existe una guarda que anticipa `#11`: `AulasService.eliminar()` bloquea borrar un `Aula`
referenciada por `ProcesoAula`, con una nota de diseño explícita al respecto.

Dependencias `#8` (`administracion-academica`) y `#10` (`configuracion-general`) están archivadas
y aportan: árbol académico (año escolar, nivel, grado, sección, aula, turno, matrícula) y
`ConfiguracionLecturaService` (año escolar activo, contexto institucional de solo lectura).

## Áreas afectadas

- `apps/backend/prisma/schema.prisma` — delta probable: decisión sobre `publico_objetivo`,
  posible promoción de `en_calidad_de` a enum, default de `ocultar_resultados` (el schema hoy
  default `false`; TECH-DESIGN sugiere default activado).
- `apps/backend/src/procesos/` (nuevo) — controller/service/DTOs siguiendo las convenciones de
  `academico`/`configuracion` (rutas planas + filtros por query, `$transaction` +
  `auditoria.log` en la misma tx, catches de `P2002`/`P2003`).
- `apps/backend/src/auditoria/audit-event-types.ts` — nuevos eventos `PROCESO_*`.
- `apps/frontend/src/` — asistente de 4 pasos, greenfield.
- `apps/backend/src/configuracion/configuracion-lectura.service.ts` — dependencia reutilizable
  de solo lectura para año escolar activo / contexto institucional.

## Enfoques posibles

1. **Todo derivado del asistente, sin columnas nuevas** — nivel/grado/público solo viven en el
   estado del frontend y se resuelven a `ProcesoAula[]` al guardar. Pros: sin migración, sigue el
   patrón de aplanado ya usado. Cons: pierde la intención de selección para reeditar un borrador.
   Esfuerzo: Bajo.
2. **Persistir metadata de selección** (`publico_objetivo` enum ± snapshot de nivel/grado) junto
   a `ProcesoAula`. Pros: reedición fiel del borrador, traza explícita de elegibilidad. Cons:
   nueva migración, redundancia a mantener sincronizada. Esfuerzo: Medio.

## Recomendación

Inclinarse por una versión liviana del enfoque 2 (`publico_objetivo` como enum) manteniendo
`ProcesoAula` como única fuente de verdad para la participación por aula — barato, y necesario
para la sección de reglas de negocio de elegibilidad que exige `BACKLOG.md`.

## Riesgos

- Delta de schema necesario aunque `#11` nominalmente depende solo de `#8`/`#10`, no de `#2` —
  debe declararse explícitamente como delta al grupo de migración de `base-schema-and-migrations`.
- No hay patrón previo de asistente/wizard en la UI — mayor incertidumbre de diseño para
  `sdd-design`.
- Desajuste del default de `ocultar_resultados` (TECH-DESIGN vs. schema) necesita una decisión
  explícita registrada.
- El criterio de TECH-DESIGN "bloquea aulas sin candidatos" referencia `#12` (candidatos, aún no
  implementado) — hay que decidir si el gating por candidatos es responsabilidad de la creación en
  lote de `#11` o se difiere a la apertura del proceso en `#13`.
- Cero reglamento institucional previo para elegibilidad/segmentación del padrón — debe
  redactarse explícitamente según `BACKLOG.md`, marcado como configurable.

## Listo para propuesta

Sí.
