# Proposal: Menú principal y navegación post-login

## Intent

Hoy `parsearRuta('/')` devuelve `{ nombre: 'proceso-nuevo' }` hardcodeado
(`apps/frontend/src/app/rutas.ts:36-38`) — cualquier usuario que inicia sesión, sin importar su
rol, cae directo en el formulario de creación de proceso. `AppShell` es "sin navegación, sin
menú" por contrato explícito de #24, así que no hay forma de volver a otra sección salvo
editando la URL a mano. Este es el bug reportado por el usuario y la causa raíz confirmada en
`exploration.md`. Este change reemplaza la ruta raíz por una pantalla de inicio por rol con
accesos a lo que el frontend ya tiene (procesos, candidatos, votación) y deja "enlazable" —sin
implementarlo— lo que agregará #26 (académica, usuarios, configuración, importación Excel), para
que el usuario vea de entrada que esas piezas existirán y dónde buscarlas.

## Scope

### In Scope
- Nueva variante `Ruta` (`'inicio'`) como destino de `/`, reemplazando el hardcode a
  `proceso-nuevo` (extensión de D10, no reescritura del parser).
- Componente de navegación (menú lateral o superior) montado junto a `AppShell`, con accesos
  condicionados por rol vía un **mapa estático rol→items en el cliente**.
- Mapa rol→items para los 5 roles reales (`estudiante`, `docente`, `comite`, `administrador`,
  `director`), enlazando únicamente a destinos que ya existen en el enrutador
  (`procesos`, `proceso-nuevo`, `candidatos`).
- Placeholders deshabilitados "próximamente" para las secciones que construirá #26 (académica,
  usuarios, configuración, importación Excel), visibles según el mismo mapa rol→items pero sin
  navegación real (sin `Ruta` asociada, sin contenido).
- Ajuste de `AppShell.tsx` para dejar de declararse "sin navegación, sin menú" — actualización
  del comentario/contrato del propio archivo para reflejar el nuevo alcance.

### Out of Scope
- Las pantallas reales de #26 (académica, usuarios, configuración, importación Excel) — este
  change sólo crea la navegación y los placeholders, nunca su contenido funcional.
- Cualquier mecanismo de autorización nuevo en el backend. La fuente de verdad de permisos sigue
  siendo `@Roles` server-side existente; el mapa rol→items del cliente es una capa de
  presentación (qué *mostrar*), no de permisos (qué *permitir*) — duplicación deliberada y de
  bajo riesgo.
- Un listado agregado de resultados. `resultados` (`/resultados/:procesoId`) no tiene listado
  propio por decisión explícita de #16 ("sin listado agregado en este change") y #25 no amplía
  ese alcance — ver decisión 2 más abajo.
- Cualquier librería de routing nueva. Se extiende el enrutador hand-rolled existente
  (`rutas.ts` + `useRuta.ts` + `Enrutador.tsx`, D10/D11), nunca se reemplaza.
- Endpoint de "capacidades"/permisos resuelto contra el backend (enfoque 3 de `exploration.md`,
  descartado por contradecir el alcance del backlog: #25 es enrutamiento/layout puro).

## Decisiones fijadas en esta propuesta

La exploración dejó tres puntos abiertos explícitamente para `sdd-propose`. Se fijan así:

1. **Forma del mapa rol→items**: mapa estático en el cliente (constante TypeScript, sin llamada
   a backend). El backend sigue siendo la única autorización real vía `@Roles` en cada endpoint;
   si el mapa del cliente queda desalineado con los roles reales, el peor caso es un enlace
   visible que el backend rechaza con 403 — nunca al revés. No hay endpoint nuevo (evita el
   enfoque 3 descartado en `exploration.md`).

2. **Tratamiento de `resultados`**: el menú principal **no** enlaza directo a una sección
   "resultados". Se llega a resultados de un proceso concreto navegando `procesos` → el proceso
   → su vista de resultados (que ya recibe `procesoId` en la URL). Ampliar esto a un listado
   agregado repetiría el problema que #16 dejó fuera de alcance a propósito; #25 no lo reabre.

3. **Tratamiento de lo que #26 aún no construye**: se muestran como **placeholders deshabilitados
   "próximamente"**, no se omiten. Justificación: el usuario reportó explícitamente esperar "un
   menú con opciones" para configurar grados/secciones antes de crear un proceso — un menú que
   no deje ver siquiera que esas opciones existirán no resuelve esa expectativa, aunque el
   contenido real llegue con #26. El placeholder es sin `Ruta` asociada (no navega a
   `no-encontrada` ni a nada real) y visualmente deshabilitado, para no simular una función que
   no existe.

## Capabilities

### New Capabilities
- Ninguna nueva independiente — la navegación es una capa de presentación sobre las
  capacidades ya existentes (`electoral-process-management`, `candidatos-listas-management`),
  no un dominio propio.

### Modified Capabilities
- Ninguna capacidad de backend se modifica — #25 es frontend puro (enrutamiento/layout), sin
  cambios a contratos, DTOs, ni endpoints.

## Approach

Nueva variante `Ruta = { nombre: 'inicio' }` en `rutas.ts`, sustituyendo el `case '/'`
hardcodeado a `proceso-nuevo`. `Enrutador.tsx` gana un `case 'inicio'` que renderiza una página
de inicio simple (saludo + accesos destacados, reutilizando el mapa rol→items). Un componente de
navegación nuevo (p. ej. `apps/frontend/src/app/NavegacionPrincipal.tsx`) se monta dentro de
`AppShell`, leyendo `rol` del mismo `SesionUsuario` que ya usa el header, y renderiza los items
del mapa estático correspondientes a ese rol — cada item real (`procesos`, `proceso-nuevo`,
`candidatos`) resuelve a una `Ruta` existente vía `rutaAPath`/navegación ya vigente en
`useRuta.ts`; cada item placeholder de #26 se renderiza deshabilitado, sin `href`/`onClick`. El
mapa rol→items vive en un módulo propio (p. ej. `apps/frontend/src/app/menu-por-rol.ts`) como
constante exportada, testeable de forma aislada sin montar componentes. Tokens Tailwind
exclusivamente de los ya vigentes (mismo criterio que D13 de #12), sin agregar tokens nuevos ni
librería de nav.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/frontend/src/app/rutas.ts` | Modified | Nueva variante `Ruta` `'inicio'`; `/` deja de resolver a `proceso-nuevo` |
| `apps/frontend/src/app/Enrutador.tsx` | Modified | Nuevo `case 'inicio'` en el `switch` |
| `apps/frontend/src/app/AppShell.tsx` | Modified | Monta la navegación; se actualiza el comentario "sin navegación, sin menú" |
| `apps/frontend/src/app/NavegacionPrincipal.tsx` | New | Componente de menú/nav condicionado por rol |
| `apps/frontend/src/app/menu-por-rol.ts` | New | Mapa estático rol→items (reales + placeholders) |
| `apps/frontend/src/app/InicioPage.tsx` (o similar) | New | Pantalla de inicio, destino de `Ruta 'inicio'` |
| `apps/frontend/src/auth/sesion-context.ts` | Read-only | Fuente del `rol` de sesión, sin cambios |
| Backend | None | Sin cambios — enrutamiento/layout puro, confirmado por el backlog |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Mapa rol→items del cliente se desalinea con los roles/permisos reales del backend con el tiempo | Medium | El backend sigue rechazando con `@Roles`/403 cualquier acceso no autorizado aunque el menú lo muestre; test de integración que recorra el mapa contra los roles reales de `RolUsuario` en `schema.prisma` |
| Placeholders "próximamente" generan expectativa sin fecha clara para el usuario final | Low | Alcance y lenguaje del placeholder se acuerdan en `sdd-spec`; no bloquea el backend |
| Ningún wireframe/Stitch de referencia visual para esta pantalla (a diferencia de #12/#14) | Low | Layout se diseña con los tokens ya archivados por #24, sin bloquear el resto del change |
| Cambiar el comentario/contrato de `AppShell.tsx` ("sin navegación, sin menú") puede sorprender a quien lo lea como invariante | Low | Se documenta explícitamente el cambio de contrato en este proposal y en el commit |

## Rollback Plan

Cambio frontend puro, sin migraciones ni datos. Revertir el/los commits restaura
`parsearRuta('/')` a `proceso-nuevo` y remueve los componentes nuevos sin efectos colaterales en
backend ni en datos existentes.

## Dependencies

- `#11` (`administracion-procesos-electorales`, archivado): fuente de la ruta `procesos`/
  `proceso-nuevo` ya enlazable.
- `#24` (archivado): estableció `AppShell` y los tokens Tailwind que este change reutiliza y cuyo
  contrato "sin navegación, sin menú" se extiende explícitamente aquí.
- `#16` (archivado): decisión "sin listado agregado de resultados" que este change respeta sin
  reabrir (ver decisión 2).
- Prepara el terreno de navegación para `#26` (aún sin implementar) sin bloquear su diseño ni
  adelantar su contenido.

## Success Criteria

- [ ] `/` ya no resuelve a `proceso-nuevo`; resuelve a la nueva pantalla de inicio para cualquier
      rol autenticado.
- [ ] La navegación muestra únicamente los items reales correspondientes al rol de la sesión
      (`procesos`, `proceso-nuevo`, `candidatos` según corresponda), sin exponer accesos que el
      backend rechazaría.
- [ ] `resultados` no aparece como sección del menú principal; se sigue alcanzando únicamente
      desde `procesos` → proceso → vista de resultados con `procesoId`.
- [ ] Los accesos de #26 aparecen como placeholders visualmente deshabilitados, sin navegar a
      ningún lado.
- [ ] `AppShell.tsx` ya no declara "sin navegación, sin menú"; el comentario refleja el nuevo
      alcance.
- [ ] Ningún endpoint de backend nuevo se agrega; `@Roles` server-side sigue siendo la única
      autorización real.

## Proposal question round

No se ofreció una ronda de preguntas interactiva antes de esta versión: el usuario ya entregó,
junto con el pedido de esta propuesta, las tres decisiones abiertas de la exploración con su
razonamiento de negocio explícito (forma del mapa, tratamiento de `resultados`, tratamiento de
lo que #26 no construye), dejando poco margen de ambigüedad de producto para resolver antes de
avanzar. Puntos abiertos para revisión del usuario, no bloqueantes:

1. ¿El lenguaje/copy exacto del placeholder "próximamente" (p. ej. tooltip, badge, texto fijo) se
   define en `sdd-spec` o el usuario quiere fijarlo ya en esta fase?
2. ¿La pantalla de inicio necesita algo más que "saludo + accesos" (p. ej. resumen de procesos
   activos), o el alcance mínimo de layout/enrutamiento puro es correcto?
3. ¿Es aceptable que el mapa rol→items viva como constante sin tests de snapshot visual, sólo
   con test de que cada rol ve exactamente los items esperados (test de datos, no de UI)?
