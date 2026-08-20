# Exploración: menu-navegacion-post-login (Backlog #25 — Menú principal y navegación post-login)

## Estado actual

El enrutador cliente es hand-rolled sin librería (`apps/frontend/src/app/rutas.ts` + `useRuta.ts` +
`Enrutador.tsx`), fijado por las decisiones **D10/D11** — que viven en
`openspec/changes/archive/2026-08-13-candidatos-listas-opciones-consulta/design.md`, no en el de
`administracion-procesos-electorales` como sugieren los comentarios inline (verificado: ese otro
`design.md` tiene un D10 distinto, sobre el proxy de Vite/Caddy). D10 es "URL real, unión
discriminada `Ruta` + `parsearRuta`/`rutaAPath` explícitos (no un motor de patrones), extensible
agregando una variante". D11 es "montado dentro de `AuthGuard` > `AppShell`; ruta desconocida ⇒
`no-encontrada` dentro del shell — nunca por encima del guard". `Enrutador()` es un `switch` total
sobre 9 variantes de `Ruta`; `parsearRuta('/')` hoy devuelve `{ nombre: 'proceso-nuevo' }`
hardcodeado (`rutas.ts:36-38`), causa raíz confirmada del bug reportado.

`AppShell.tsx` es literalmente "shell de un solo nivel... encabezado con el rol de la sesión y
'Cerrar sesión', `<main>` con children. **Sin navegación, sin menú — fuera de alcance de la
propuesta**" (comentario del propio archivo, de #24). No hay ningún componente de nav/menú en el
repo hoy.

Roles reales del sistema (`RolUsuario` en `apps/backend/prisma/schema.prisma:30-36`, reflejado en
`SesionUsuarioDto.rol` de `packages/contracts/src/generated/api.d.ts:993`): **`estudiante`,
`docente`, `comite`, `administrador`, `director`** — 5 valores. "Apoderado" (mencionado en el
TDD/backlog) **no es un rol de login**: es la entidad `Apoderado` vinculada a `Usuario` sin
credenciales propias (ADR-0011), confirmado en el schema. Ningún lugar del frontend hace hoy lógica
condicional por rol — `AppShell` solo *muestra* el rol como texto (`Rol: {rol}`), nunca decide qué
renderizar según él. #25 sería la primera pieza de rol-based rendering del cliente.

De las 9 variantes de `Ruta` (`procesos`, `proceso-nuevo`, `candidatos`, `candidato-nuevo`,
`candidato-edicion`, `apertura`, `votacion`, `comprobante`, `resultados`, `no-encontrada`), solo
`procesos` y `proceso-nuevo` son destinos de menú limpios sin dependencia de id. `votacion`
(`/votar/:derechoVotoId`) y `comprobante` (`/comprobante/:votoId`) llevan un id de instancia en la
URL y se alcanzan desde un correo o flujo puntual — no son listables. `resultados`
(`/resultados/:procesoId`) tampoco tiene listado agregado: su propio comentario dice "`/resultados`
sin id cae en `no-encontrada` — sin listado agregado en este change" (spec de #16). Un menú que
enlace a resultados necesita pasar primero por `/procesos` o #25 tiene que agregar el listado que
#16 dejó fuera de alcance — punto a decidir en propose.

`DESIGN-SYSTEM.md` no define ningún componente de nav/sidebar/menú (solo dice que "Primary (Blue)"
se usa para "headers... and navigational elements", sin spec de layout). #24 tradujo
paleta/tipografía/tokens a Tailwind pero no creó ningún componente de menú — #25 diseña ese layout
desde cero, con los tokens ya existentes (mismo criterio que D13 de #12: "exclusivamente tokens
vigentes de `index.css`, sin tokens nuevos").

#26 (aún sin implementar) construirá secciones académica/usuarios/configuración/importación-Excel
que #25 debe dejar "enlazables" sin acoplarse a la implementación futura. No existe en el repo
ningún mecanismo de flags/placeholder previo que resuelva esto.

## Áreas afectadas

- `apps/frontend/src/app/rutas.ts` — nueva variante de `Ruta` para la pantalla de inicio (o
  reemplazo del `case '/'` actual), sin romper D10 (extender agregando variante, no reescribir el
  parser).
- `apps/frontend/src/app/Enrutador.tsx` — nuevo `case` en el `switch`.
- `apps/frontend/src/app/AppShell.tsx` — hoy "sin navegación, sin menú" por contrato explícito de
  #24; #25 necesariamente contradice/extiende ese contrato.
- Componente(s) nuevo(s) de menú/nav (no existen hoy) — probablemente `apps/frontend/src/app/` o un
  módulo propio, con tokens Tailwind vigentes.
- `apps/frontend/src/auth/sesion-context.ts` / `SesionUsuario` — el único dato de rol disponible en
  cliente; no hay hoy ninguna capa de "qué puede ver cada rol", habría que introducirla (mapping
  rol→items de menú) sin duplicar la autorización real (que sigue siendo server-side vía `@Roles`).
- `apps/frontend/src/procesos/ProcesosIndexPage.tsx` (ya existe, reutilizable como destino de menú
  "Procesos").
- Ninguna pieza de backend nueva — item de enrutamiento/layout puro, según el propio backlog.

## Enfoques posibles

1. **Pantalla de inicio dedicada + AppShell extendido con barra de navegación simple** — nueva
   variante `Ruta` (p. ej. `'inicio'`) como destino de `/`, `AppShell` gana una nav
   lateral/superior con accesos condicionados por rol (whitelist declarativa rol→items), enlazando
   solo a `procesos`/`proceso-nuevo` (y, si se decide en propose, a un listado de `resultados` que
   hoy no existe). Placeholders "próximamente" para lo que dejará #26. Pros: sigue D10/D11 al pie
   de la letra (extensión por variante, montaje sin tocar el guard); reutiliza `ProcesosIndexPage`
   ya escrita; no introduce librería de routing. Cons: primera lógica de rol-based rendering del
   cliente — hay que decidir su forma (mapa estático vs. derivarlo de permisos del backend) para no
   duplicar la autorización real. Esfuerzo: Medio.
2. **Reemplazar `/` directamente por `ProcesosIndexPage`, sin pantalla de inicio ni menú propios**
   — Pros: cambio mínimo, cero componentes nuevos. Cons: no cumple el alcance de #25 ("accesos a
   lo que ya tiene frontend... y a lo que agregue #26"); no deja lugar para #26; no resuelve
   candidatos/resultados como accesos visibles. Esfuerzo: Bajo, mal alineado con el ítem del
   backlog.
3. **Menú completo con lógica de permisos por rol resuelta contra el backend (endpoint de
   "capacidades")** — Pros: fuente única de verdad de qué puede ver cada rol, sin duplicar
   `@Roles` en el cliente. Cons: introduce un endpoint/backend nuevo que el propio backlog excluye
   explícitamente ("#25 es enrutamiento/layout puro, no necesita ningún backend nuevo"). Esfuerzo:
   Alto, contradice el alcance declarado.

## Recomendación

Enfoque 1 — pantalla de inicio + navegación simple dentro de `AppShell`, con mapa estático
rol→items en el cliente (duplicación deliberada y de bajo riesgo: el backend sigue siendo la
autorización real vía `@Roles`, el cliente solo decide qué mostrar). Placeholders o ausencia total
de enlaces para lo que #26 aún no construye, a decidir explícitamente en `sdd-propose`.

## Riesgos

- Contradice literalmente el comentario de `AppShell.tsx` ("sin navegación, sin menú — fuera de
  alcance"); hay que decidir en propose si se reescribe ese comentario/contrato o se agrega un
  componente de nav separado montado junto a `AppShell` sin tocarlo.
- No hay precedente de rol-based rendering en el cliente — el diseño del mapa rol→items (dónde
  vive, cómo se testea, qué pasa si el backend cambia roles) queda abierto.
- `resultados` no tiene listado agregado (decisión explícita de #16 "sin listado agregado en este
  change") — si el menú necesita enlazar a resultados de un proceso sin pasar por
  candidatos/apertura, #25 tendría que ampliar ese alcance, lo cual el backlog no contempla.
- El enlace a lo que #26 todavía no construye (académica, usuarios, configuración, importación
  Excel) no tiene mecanismo previo en el repo (sin flags/placeholders existentes) — cualquier
  decisión acopla livianamente #25 a la futura forma de #26 si no se aísla bien.
- Ningún wireframe/Stitch de referencia visual conocido para esta pantalla (a diferencia de #12/#14
  que sí tenían mockups) — el layout se diseña sin referencia externa, solo con los tokens ya
  archivados por #24.

## Listo para propuesta

Sí — con tres decisiones a fijar explícitamente en `sdd-propose`: (1) forma del mapa rol→items de
menú (estático en cliente vs. derivado de algo del backend), (2) qué hacer con `resultados` dado
que no tiene listado agregado, (3) tratamiento de los accesos que #26 todavía no construye
(placeholder "próximamente" vs. omitir hasta que #26 exista).
