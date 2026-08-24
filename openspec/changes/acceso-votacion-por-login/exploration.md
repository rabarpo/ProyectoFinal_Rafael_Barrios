# Exploration: acceso-votacion-por-login (estudiante ve "sus" procesos al loguearse y entra a
votar, sin depender de correo)

## Current State

**La premisa del usuario ("hoy debe esperar un correo para iniciar el voto") es una confusión, no
un hecho del sistema — pero el síntoma que percibe es real: hoy un estudiante no tiene forma
alguna, dentro de la app, de llegar a votar.**

1. **No existe ningún correo que preceda o habilite el voto.** `POST /votos`
   (`apps/backend/src/votos/votos.controller.ts`, `votos.service.ts`) solo exige cookie de sesión +
   pertenencia del `derecho_voto_id` al usuario (ADR-0006). El único correo implementado es
   **posterior** al voto: `outbox-correo-comprobante-autenticado` (#15, ADR-0009) — enlace
   autenticado al **comprobante**, nunca a la boleta.
2. **La notificación de "inicio de votación"** es el backlog **#19 Notificaciones**
   (`BACKLOG.md` línea 27) — no implementado. No hay `TipoCorreo`/plantilla de ese tipo en
   `apps/backend/src/email/`.
3. **ADR-0018** ("ventana temporal sin JobCorreo") está superado por #15 y es exclusivamente sobre
   el correo de comprobante posterior — sin relación con gating de acceso a la boleta.
4. La ruta a la boleta `/votar/:derechoVotoId` (`apps/frontend/src/app/rutas.ts`) existe y funciona
   (`VotacionPage.tsx`), pero **nada descubre ese `derechoVotoId` por el usuario** — hay que
   conocerlo de antemano.
5. **Qué ve hoy un estudiante al loguearse**: `InicioPage.tsx` + `MENU_POR_ROL`
   (`apps/frontend/src/app/menu-por-rol.ts`) dan `estudiante: []`, `docente: []` — literalmente
   "Todavía no tenés accesos disponibles en esta sección." `BACKLOG.md` (líneas 74-80) documenta
   que #25 cerró el vacío de aterrizaje solo para roles de gestión, dejando estudiante/docente sin
   item propio.
6. `GET /procesos`/`GET /procesos/:id` son `@Roles('administrador','director','comite')` — un
   estudiante recibe `403`. **No existe endpoint que liste los `DerechoVoto` vigentes del usuario
   autenticado.**

**Conclusión sobre la premisa**: incorrecta como descripción de un flujo existente — hoy no hay
ningún camino, ni por correo ni por UI, para que un estudiante llegue a votar sin que alguien le
pase manualmente la URL. El alcance real es más simple de lo que el usuario cree: no hay que
"reemplazar" un correo — hay que construir desde cero el descubrimiento de derechos propios
(backend) y su aterrizaje (frontend).

## Affected Areas

- `apps/backend/src/votos/votos.controller.ts`, `votos.service.ts` — candidato natural para un
  nuevo endpoint de descubrimiento (`GET /votos/mis-derechos`), sin tocar `POST /votos`.
- `apps/backend/prisma/schema.prisma` (`DerechoVoto`, líneas ~304-321) — modelo completo; falta
  solo la consulta filtrada.
- `apps/backend/src/procesos/procesos.controller.ts` — confirma exclusividad de roles de gestión;
  el nuevo endpoint no debe reusar sus DTOs.
- `apps/frontend/src/app/InicioPage.tsx`, `menu-por-rol.ts` — hoy fuerzan `[]` para
  estudiante/docente.
- `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` — necesitan una ruta nueva de listado
  (`mis-votaciones` o similar).
- `apps/frontend/src/votos/VotacionPage.tsx`, `votos-api.ts` — sin cambios de flujo interno.
- ADR-0011 (voto del padre con cuenta del estudiante) — el listado debe mostrar los dos derechos
  (`estudiante`/`padre`) por separado cuando coexisten.
- `openspec/specs/vote-casting/spec.md` — no cubre este descubrimiento; requiere extensión o spec
  nueva.

## Approaches

1. **Endpoint de descubrimiento propio + aterrizaje dedicado** — `GET /votos/mis-derechos`
   (procesos abiertos, `now() < cierre`, agrupado por `en_calidad_de`) + vista nueva reemplazando
   el estado vacío de `InicioPage` para estudiante/docente.
   - Pros: cierra el vacío real, independiente de #19, no reabre `vote-casting`, sigue el patrón
     ya establecido (ruta plana, `AuthGuard`).
   - Cons: requiere spec/DTO nuevos.
   - Effort: Medium.

2. **Ampliar roles de `GET /procesos`** — descartado: mezclaría DTOs de gestión con datos de
   estudiante, violando mínima exposición.
   - Effort: Medium-High con peor resultado de seguridad.

3. **Esperar a #19 (Notificaciones)** — descartado como única vía: no cumple "por login" pedido
   explícitamente, y deja sin camino a quien no reciba el correo (mismo caso borde que ADR-0009 ya
   resolvió con "Mis votaciones").

## Recommendation

Enfoque 1. Independiente de #19, no reabre PR2/PR3 de `vote-casting`, y deja el terreno listo para
que #19 simplemente enlace a la misma ruta `/votar/:derechoVotoId` ya existente.

## Risks

- **Oráculo de enumeración**: el endpoint debe estar scoped estrictamente a `req.usuario`, nunca
  aceptar `usuario_id` de parámetro (mismo patrón que ya cierra `VotacionPage.tsx` para el 403).
- **Secreto del voto**: no incluir la elección; verificar contra ADR-0010 el contrato exacto de
  "ya votaste" en el listado.
- **Doble derecho ADR-0011**: mostrar ambos derechos por separado, nunca colapsados.
- **Rol `docente`**: no se verificó en esta exploración si `docente` porta `DerechoVoto`
  realmente — confirmar antes del proposal.
- **No reabrir `vote-casting`**: el endpoint nuevo debe vivir aparte de la transacción de
  `emitir()`, igual criterio que siguió #15.

## Resultado

- **next_recommended**: sdd-propose, con la salvedad de comunicar antes al usuario que la premisa
  de "correo obligatorio hoy" es incorrecta, para que el alcance del proposal se redacte
  correctamente como "construir descubrimiento + aterrizaje", no como "reemplazo".
