# Proposal: Candidatos, listas y opciones de consulta

## Intent

El modelo de datos (`Lista`, `Candidato`, `OpcionConsulta`, `EstadoParticipacion` + `baja_en`)
existe desde `#2` y `Voto` ya depende de sus FKs, pero no hay capa de aplicación
(`apps/backend/src/candidatos/` no existe) ni pantalla de administración
(`ProcesoWizardPage` línea 20 difiere explícitamente "cargos y candidatos" a este change). Sin
esto, un proceso no puede recibir postulantes reales ni consultas con opciones A/B/C, bloqueando
`#13` (apertura) y `#17` (escrutinio, que exige reflejar bajas).

## Scope

### In Scope
- CRUD de `Lista`/`Candidato`/`OpcionConsulta` (backend + UI admin) agrupados por cargo.
- Foto y plan de trabajo en PDF como `Bytes` en Postgres, patrón `Configuracion.logo`.
- Baja de candidato (`EstadoParticipacion=baja` + `baja_en`) distinta de borrado físico.
- Borrado físico bloqueado si hay `Voto` referenciándolo (`ENTIDAD_CON_DEPENDIENTES`).
- Auditoría (`CANDIDATO_*`/`LISTA_*`) en la misma tx.
- Router mínimo en frontend (primer módulo que lo necesita).

### Out of Scope
- Catálogo formal `Cargo` (queda texto libre, ver reglas de negocio).
- Almacenamiento externo de objetos (S3) — descartado, sin precedente (ADR-0007).
- Apertura/congelamiento de proceso (`#13`), escrutinio (`#17`).
- Validación cruzada `TipoProceso` ↔ `Lista`/`Candidato` (riesgo abierto, no bloquea este change).

## Capabilities

### New Capabilities
- `candidatos-listas-management`: CRUD de `Lista`/`Candidato`/`OpcionConsulta`, subida/entrega de
  foto y PDF, baja/reactivación, borrado físico guardado.
- `minimal-frontend-router`: enrutador mínimo hand-rolled (sin librería nueva) para alternar entre
  vistas admin; base reutilizable para `#7`/`#8`/`#10`.

### Modified Capabilities
- `base-schema`: `foto`/`foto_mime` aditivos en `Candidato`; `plan_trabajo_url` cambia de `String`
  a `Bytes` (rompiente, requiere migración real).

## Approach

Módulo `apps/backend/src/candidatos/` siguiendo `academico/aulas.service.ts` (controller/service/
DTOs, `$transaction` + `auditoria.log`, catch `P2002`/`P2003`). Subida de archivos reutiliza multer
`memoryStorage` + `fileFilter` allowlist + `PayloadTooLargeException` + `StreamableFile` de
`configuracion.controller.ts`. Frontend: router hand-rolled basado en `window.location.pathname`
(~2-3 rutas: lista de candidatos, alta/edición), sin `react-router-dom` — YAGNI hasta que haya
necesidad real de rutas anidadas/guards por ruta; establece el patrón que `#7`/`#8`/`#10`
reutilizarán. UI sigue tokens de `index.css` (`#24`); referencia visual: Stitch "Gestión de
Candidatos - Administrador" / "Registro de Candidato".

## Reglas de negocio adoptadas (sin reglamento previo, configurables/revisables)

- **Cargo por lista**: `cargo` puede repetirse dentro de una `Lista` (texto libre, sin unicidad
  forzada). *(Revisable si se define plancha con cargos únicos.)*
- **Foto**: allowlist PNG/JPG, tope 2MB (espeja logo), **obligatoria** al crear un candidato.
  *(Revisable.)*
- **Plan de trabajo PDF**: allowlist `application/pdf`, tope 5MB (mayor al logo por ser documento
  extenso), opcional. *(Revisable.)*
- **Baja de candidato**: roles `administrador`/`director`/`comité`; permitida en cualquier
  `Proceso.estado`, incluido `abierto` — consistente con `#13` (congela `DerechoVoto`, no
  candidatos) y `#17` (debe reflejar la baja en escrutinio). Votos ya emitidos a un candidato dado
  de baja permanecen válidos. *(No revisable — frontera de responsabilidad con `#17`.)*
- **`OpcionConsulta.etiqueta`**: texto libre; la UI sugiere A/B/C por defecto sin forzarlo.
  *(Revisable.)*

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/prisma/schema.prisma` | Delta rompiente | `foto`/`foto_mime` add; `plan_trabajo_url` → `Bytes` |
| `apps/backend/src/candidatos/` | New | Controller/service/DTOs |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modified | `CANDIDATO_*`/`LISTA_*` |
| `apps/frontend/src/app/App.tsx` | Modified | Monta router mínimo |
| `apps/frontend/src/candidatos/` | New | Admin UI |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Migración rompiente de `plan_trabajo_url` sin datos previos que preservar | Low | Sin procesos abiertos aún, columna nueva sin filas reales |
| Foto+PDF como `Bytes` infla filas de Postgres | Medium | Topes declarados (2MB/5MB), revisar si escala mal en diseño |
| Alcance puede exceder presupuesto de revisión (400 líneas) por 4 áreas nuevas + router | Medium | Evaluar PRs encadenados en `sdd-tasks` |
| Router mínimo insuficiente si `#7`/`#8`/`#10` necesitan rutas anidadas | Low | Reevaluar librería si aparece esa necesidad concreta |

## Rollback Plan

Sin datos de producción en riesgo (no hay procesos abiertos con candidatos aún). Revertir la
migración de `plan_trabajo_url` (columna nueva sin backfill) y el módulo de aplicación nuevo es
seguro; el router se retira volviendo `App.tsx` a montar `ProcesoWizardPage` directo.

## Dependencies

- `#2` (`base-schema`, archivado): `Lista`/`Candidato`/`OpcionConsulta`/`Voto`.
- `#11` (`administracion-procesos-electorales`, archivado): `ProcesoElectoral` a poblar.

## Success Criteria

- [ ] CRUD completo de `Lista`/`Candidato`/`OpcionConsulta` con foto y PDF operable end-to-end.
- [ ] Baja de candidato distinta de borrado físico; borrado bloqueado si hay `Voto`.
- [ ] Toda escritura auditada en la misma transacción.
- [ ] Router mínimo permite navegar entre lista y alta/edición sin recargar.

## Proposal question round

No se realizó ronda de preguntas interactiva antes de esta versión — la exploración ya cubría
gran parte del terreno de negocio. Puntos abiertos para el usuario, no bloqueantes:
1. ¿La foto realmente debe ser obligatoria, o hay candidatos sin foto disponible al momento del
   registro (ej. inscripción tardía)?
2. ¿5MB es razonable para el PDF del plan de trabajo, o debería alinearse con algún límite de
   infraestructura (ADR-0007, VPS único)?
3. ¿Existe algún caso donde deba impedirse la baja de un candidato (ej. últimas 24h de votación)?
