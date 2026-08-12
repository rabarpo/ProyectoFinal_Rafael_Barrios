# Proposal: Administración de procesos electorales (asistente de 4 pasos)

## Intent

El modelo de datos del proceso electoral existe completo desde `#2` (`TipoProceso`,
`EstadoProceso`, `ProcesoElectoral`, `Lista`, `Candidato`, `OpcionConsulta`, `ProcesoAula`,
`DerechoVoto`), pero no hay capa de aplicación (`apps/backend/src/procesos/` no existe) ni
frontend real (solo `HealthPage`). Sin este change, el comité no puede crear ni configurar un
proceso electoral — bloqueando `#12` (candidatos) y `#13` (apertura), y dejando sin uso el árbol
académico de `#8` y la configuración institucional de `#10`. No existe reglamento electoral
institucional previo (ver `BACKLOG.md`): esta propuesta debe declarar explícitamente las reglas
de elegibilidad y segmentación del padrón que adopta, marcadas como configurables/revisables.

**Ampliación de alcance (confirmada con el usuario, 2026-08-11):** el backend de autenticación
(`/auth/login`, `/auth/google`, `/auth/whoami`, `/auth/logout`) ya existe desde `#4`/`#5`, pero
el frontend no tiene ninguna pantalla de login ni app shell — solo `HealthPage`. Sin eso, el
asistente de #11 no sería operable de punta a punta desde el navegador. Se añade un **login
mínimo** al alcance de este change (formulario email/contraseña + botón "Continuar con Google",
guard de ruta básico) para que el asistente quede accesible al cerrarlo.

## Scope

### In Scope
- Asistente de 4 pasos (backend: endpoints que lo soportan; frontend: primera UI no trivial del
  proyecto) para crear un `ProcesoElectoral` en estado `borrador`.
- Cálculo de padrón en vivo (conteo, no materialización) según público objetivo/nivel/grados/
  aulas seleccionados, usando `Matricula`/árbol académico de `#8`.
- Creación en lote de procesos de tipo `representante_aula` (un `ProcesoElectoral` +
  `ProcesoAula` por aula elegible).
- Soporte de los 4 `TipoProceso` (`municipio`, `representante_aula`, `padres`, `consulta`).
- CRUD de `ProcesoElectoral` en estado `borrador` (edición/eliminación previas a apertura).
- Declaración explícita de reglas de elegibilidad y segmentación del padrón (ver sección abajo).
- Auditoría (`PROCESO_CREADO`, `PROCESO_EDITADO`, etc.) dentro de la misma transacción.
- **Login mínimo en frontend**: pantalla de login (email/contraseña + "Continuar con Google")
  consumiendo los endpoints ya existentes de `#4`/`#5`, y guard de ruta básico que redirige al
  login si no hay sesión activa (`/auth/whoami`).

### Out of Scope
- Apertura del proceso, congelamiento de `DerechoVoto` y bloqueo de edición (`#13`).
- Alta/edición de `Candidato`, `Lista`, `OpcionConsulta` (`#12`).
- Emisión de voto, resultados, actas (`#14`–`#17`).
- Reglamento institucional formal (se redacta después, conforme `BACKLOG.md`).
- Recuperación de contraseña, bloqueo/desbloqueo de cuentas en UI (`#5`/`#6` ya tienen backend;
  UI queda para un change posterior si se necesita).
- App shell completo (navegación, layout general, dashboard) — solo lo mínimo para alojar el
  login y el asistente.

## Capabilities

### New Capabilities
- `electoral-process-wizard`: creación en borrador de `ProcesoElectoral` vía asistente de 4
  pasos, con cálculo de padrón en vivo y creación en lote por aula para `representante_aula`.
- `electoral-process-management`: CRUD de `ProcesoElectoral` en estado `borrador` (listado,
  edición, eliminación) previo a la apertura.
- `minimal-login`: pantalla de login frontend (email/contraseña + Google OAuth) y guard de ruta
  básico, consumiendo los endpoints ya existentes de `#4`/`#5`. Sin UI propia — solo consumo.

### Modified Capabilities
- Ninguna existente (no hay capacidades de procesos publicadas aún).

## Approach

Replicar el patrón de `#7`/`#8` (NestJS module, DTOs planos, guard de roles
`administrador`/`director`/`comité`, `AuditoriaService.log` en la misma tx). El cálculo de
padrón en vivo es una consulta agregada sobre `Matricula` filtrada por `Nivel`/`Grado`/`Aula`
activos (año escolar activo vía `ConfiguracionLecturaService` de `#10`), sin persistir filas de
`DerechoVoto` (eso es `#13`). Frontend: wizard controlado con estado de selección en cliente,
resuelto a `ProcesoAula[]` + metadata al guardar.

## Decisiones de diseño (confirmadas con el usuario, 2026-08-11)

1. **`publico_objetivo` en el schema — persistir.** `ProcesoElectoral` suma un enum
   `publico_objetivo` + snapshot de nivel/grado, junto al `ProcesoAula[]` resultante. Habilita
   reedición fiel de un borrador. Requiere un delta de migración declarado explícitamente contra
   el grupo `base-schema-and-migrations` en `sdd-design`.
2. **Gating de aulas sin candidatos — diferido a `#13`.** `#11` crea el `ProcesoElectoral` de
   tipo `representante_aula` en borrador sin validar candidatos (no existen hasta `#12`, y `#11`
   no depende de `#12`). El bloqueo real de `TECH-DESIGN` Flujo 3 ("bloquea aulas sin candidatos
   registrados") se implementa en `#13` (apertura), cuando `Candidato` ya existe.
3. **Default de `ocultar_resultados` — capa de aplicación.** El schema mantiene
   `@default(false)`; el asistente pre-marca el checkbox como activado al crear un proceso nuevo.
   Sin delta de migración para este punto.
4. **Roles con permiso de crear/editar procesos — administrador, director y comité.** Mismo
   patrón de `#7`/`#8`/`#10`; el comité puede crear y editar procesos en borrador, no solo
   operarlos durante la jornada.

## Reglas de negocio de elegibilidad y segmentación del padrón (declaración explícita, `BACKLOG.md`)

Sin reglamento previo, esta propuesta adopta las siguientes reglas — **todas configurables o
revisables** en el reglamento institucional futuro:

- **Elegibilidad base**: solo cuentas con `estado = activo` y `Matricula` vigente en el año
  escolar activo participan del cálculo de padrón. *(Revisable.)*
- **Segmentación por tipo de proceso**: `municipio`/`consulta` pueden segmentar por
  nivel/grado/aula o alcanzar a toda la institución; `representante_aula` se segmenta
  obligatoriamente por aula (1 proceso por aula); `padres` sigue la segmentación de
  estudiante-aula, extendida al `Apoderado` vinculado. *(Configurable por tipo.)*
- **Doble derecho en consultas a toda la comunidad**: una cuenta de estudiante con padre
  registrado genera dos participantes potenciales en el conteo en vivo (propio + del padre),
  confirmado por `ADR-0011`. *(No revisable — deriva de un ADR aceptado.)*
- **Exclusión de aulas sin elegibles**: una aula sin matrícula activa no genera fila de
  `ProcesoAula` en la creación en lote. *(Revisable.)*
- **Borrador editable sin límite de reintentos**: un proceso en `borrador` puede recalcularse y
  reeditarse libremente hasta su apertura (`#13`), sin congelar nada del padrón todavía.
  *(No revisable — es la frontera de responsabilidad con `#13`.)*

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/prisma/schema.prisma` | Delta confirmado | Decisión 1 (`publico_objetivo` + snapshot nivel/grado); decisión 3 no requiere migración |
| `apps/backend/src/procesos/` | New | Controller/service/DTOs del asistente y CRUD de borrador |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modified | Eventos `PROCESO_*` |
| `apps/frontend/src/` | New | Asistente de 4 pasos (primera UI real del proyecto) |
| `apps/backend/src/configuracion/configuracion-lectura.service.ts` | Reused | Año escolar activo / contexto institucional |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Migración de schema no anticipada por la dependencia declarada (`#8`/`#10` únicamente) | Medium | Declarar el delta explícitamente contra `base-schema-and-migrations` en `sdd-design` |
| Sin patrón previo de wizard en frontend | Medium | Mayor tiempo de diseño en `sdd-design`; UI greenfield |
| Reglas de elegibilidad sin reglamento previo pueden requerir reescritura | Low | Todas marcadas como configurables/revisables explícitamente |

## Rollback Plan

Sin migraciones irreversibles de datos existentes (el schema base ya existe). Si se agrega
`publico_objetivo`, el rollback revierte la migración aditiva (columna nullable/con default) y el
módulo de aplicación nuevo; sin procesos en `abierto` o posteriores, no hay datos en riesgo.

## Dependencies

- `#8` (`administracion-academica`, archivado): árbol académico y matrícula.
- `#10` (`configuracion-general`, archivado): año escolar activo, contexto institucional.

## Success Criteria

- [ ] El asistente de 4 pasos calcula el padrón en vivo por público/nivel/grados/aulas antes de
      guardar el borrador.
- [ ] La creación en lote de `representante_aula` genera un `ProcesoElectoral` + `ProcesoAula`
      por aula elegible.
- [ ] Los 4 tipos de proceso son soportados en el asistente.
- [ ] Un borrador es editable y eliminable sin afectar `#13`.
- [ ] Toda escritura queda registrada en auditoría dentro de la misma transacción.
