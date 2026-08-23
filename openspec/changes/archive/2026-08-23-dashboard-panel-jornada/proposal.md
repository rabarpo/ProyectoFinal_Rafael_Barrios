# Propuesta: dashboard-panel-jornada (Backlog #20 — Dashboard y panel de jornada)

## Intención

Hoy no existe ningún panel que resuma el estado de la jornada electoral: `administrador`,
`director` y `comite` no tienen una vista única de procesos activos, participación, avance por
aula/hora o incidencias de correo. `resultados-en-vivo` (#16) cubre participación y desglose por
candidato, pero está scoped a un proceso y a votantes, no a supervisión operativa. Este change
entrega ese panel, reutilizando el patrón ya validado de polling server-truth de #16.

## Decisiones (ya resueltas por el usuario — no reabrir)

1. **Alcance ampliado**: backlog #20 (procesos activos, cantidad de estudiantes/padres, %
   participación, resultados rápidos, correos fallidos, modo proyección) MÁS lo que pide
   `Design.md` 1e: serie "votos por hora" y "avance por aula" con rezagadas resaltadas. Esto
   requiere agregación backend nueva (por aula, por franja horaria) fuera del alcance original de
   #20.
2. **Roles con acceso**: `administrador`, `director`, `comite`. Ningún otro rol ve el panel.
3. **Conteo de "padres"**: filas `Apoderado` crudas (sin deduplicar por DNI); un padre con 3
   hijos cuenta 3 veces.

## Alcance

### Dentro de alcance
- `GET /procesos?estado=abierto` reutilizado tal cual para "procesos activos" (sin cambios).
- Endpoint(s) backend nuevos, scoped por proceso, `@Roles('administrador','director','comite')`:
  conteo estudiantes/padres (`Apoderado` crudo), % participación, resultados rápidos, votos por
  hora (agregación por franja horaria de `Voto.creado_en`), avance por aula (participación por
  `Aula` vía `Matricula`/`DerechoVoto`, con umbral de "rezagada").
- Endpoint nuevo de correos fallidos: `count(JobCorreo)` `estado='fallido'` por proceso, mismos
  3 roles (no la audiencia amplia de `ResultadosController`).
- Hook de polling frontend (clon parametrizado de `useResultadosEnVivo`), intervalo configurable.
- Página "Panel de jornada" + ítem de menú/ruta nuevos siguiendo `menu-por-rol.ts`/
  `Enrutador.tsx`/`rutas.ts` (#25).
- Modo proyección: `Ruta` separada, sin controles, payload servidor sin desglose por candidato
  (visibilidad evaluada en servidor, nunca en cliente — ADR-0005).

### Fuera de alcance
- Cambios a `resultados-en-vivo` (#16) o `ResultadosController`.
- Deduplicación de padres por DNI (decisión 3 cierra esto).
- Cambios de schema Prisma (todos los campos ya existen).

## Capabilities

### New Capabilities
- `panel-jornada`: endpoints de agregación scoped por proceso (estudiantes, padres,
  participación, votos por hora, avance por aula, correos fallidos) + vista de dashboard y modo
  proyección para `administrador`/`director`/`comite`.

### Modified Capabilities
- `menu-navegacion-post-login`: agrega ítem "Panel de jornada" y ruta de modo proyección para los
  3 roles autorizados.

## Enfoque

Endpoints separados (no un único agregador), reutilizando `GET /procesos?estado=abierto`.
Hook de polling clonado de `useResultadosEnVivo`. Modo proyección como ruta propia, no toggle.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/src/panel-jornada/` | New | Servicio/controlador de agregación (estudiantes, padres, participación, votos/hora, aula, correos fallidos) |
| `apps/frontend/src/panel-jornada/` | New | Hook de polling, página dashboard, vista proyección |
| `apps/frontend/src/app/menu-por-rol.ts`, `Enrutador.tsx`, `rutas.ts` | Modified | Ítem de menú y rutas nuevas |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Avance por aula filtra preferencia indirecta en aulas pequeñas | Baja | Mostrar solo % participación, nunca desglose por candidato |
| Confusión sobre "padres" vs. vínculos | Media | UI etiqueta explícitamente "vínculos apoderado-estudiante" |

## Rollback Plan

Greenfield, sin migraciones de schema, solo lectura. `git revert` de endpoints/hook/rutas sin
estado huérfano.

## Dependencies

- `#16` (`resultados-en-vivo`) — patrón de polling/visibilidad en servidor.
- `#25` (`menu-navegacion-post-login`) — patrón mecánico de ítem de menú/ruta.

## Success Criteria

- [ ] Panel visible solo para `administrador`/`director`/`comite`
- [ ] Votos por hora y avance por aula disponibles vía endpoint nuevo
- [ ] Correos fallidos scoped por proceso, mismos 3 roles
- [ ] Modo proyección sin desglose por candidato, decidido en servidor
