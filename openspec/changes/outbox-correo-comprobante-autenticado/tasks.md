# Tasks: outbox-correo-comprobante-autenticado (Backlog #15 — Outbox de correo y comprobante autenticado)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR1 ~250-350 / PR2 ~350-450 / PR3 ~200-300 / PR4 ~200-250 / PR5 ~80-150 (~1080-1500 total) |
| 400-line budget risk | PR1 Medium / PR2 High (borderline) / PR3 Low-Medium / PR4 Low-Medium / PR5 Low |
| Chained PRs recommended | Yes |
| Suggested split | PR1 transacción de `#14` (migración+insert+e2e atomicidad, aislada para revisión enfocada) → PR2 worker completo → PR3 endpoint de comprobante (backend) → PR4 página de comprobante (frontend) → PR5 reconciliación+docs+cierre ADR-0018 |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Este corte sigue el "Corte de PR sugerido" de `design.md` sin modificarlo: aísla el único toque
a la transacción ya entregada y probada de `#14` (`VotosService.emitir()`) en PR1, separado de
todo el código nuevo del worker (PR2) y del frontend (PR3/PR4), para que un revisor pueda
verificar "¿esto preservó la garantía de `#14`?" de forma independiente a "¿funciona el worker/UI
nuevo?". El cierre del ADR-0018 (D14) es la última tarea de todo el change (PR5), condicionado a
que la suite e2e de atomicidad de PR1 siga verde.

### Suggested Work Units

| Unit | Goal | PR | Base | Focused test command | Runtime harness | Rollback boundary |
|------|------|----|------|----------------------|-----------------|-------------------|
| 1 | Migración aditiva `JobCorreo` (D1), renderizador puro (D2), insert en el marcador `[#15]` (D2/D3/D4), e2e de atomicidad (cierre del ADR-0018) | PR 1 | tracker | `pnpm --filter @seei/backend test -- votos` + `pnpm --filter @seei/backend test:e2e -- outbox-atomicidad` | Postgres real (Docker) | `git revert` PR1; `#14` sigue verde sin `JobCorreo` poblado |
| 2 | Worker de outbox: puertos+processor (D6/D8), adaptador+despachador (D5/D9/D10), `main.ts`/Docker/compose/env | PR 2 | PR1 | `pnpm --filter @seei/worker test` | Vitest con dobles en memoria (sin Postgres/Redis/SMTP) | `git revert` PR2; `JobCorreo` sigue insertándose, sólo sin procesarse |
| 3 | `ComprobanteService` (D11), `GET /votos/comprobante/:votoId`, contrato regenerado, e2e | PR 3 | PR2 | `pnpm --filter @seei/backend test:e2e -- comprobante-autenticado` | Postgres real (Docker) | `git revert` PR3; PR1/PR2 no afectados |
| 4 | Ruta `/comprobante/:votoId`, `ComprobantePage`, ajuste de `PanelComprobante` (D12) | PR 4 | PR3 | `pnpm --filter @seei/frontend test -- Comprobante` | Testing Library + `vi.stubGlobal('fetch')` | `git revert` PR4; backend no afectado |
| 5 | Script de reconciliación (D13), documentación de variables, cierre del ADR-0018 (D14) | PR 5 | PR4 | `pnpm --filter @seei/backend exec tsx scripts/reconciliar-outbox.ts` | Local, sin datos reales (greenfield) | `git revert` PR5; el resto del change no depende de este cierre |

## PR 1 — Transacción del voto: migración, renderizador e insert en el marcador (base = feature/tracker branch)

### Phase 1: Migración Prisma aditiva y pruebas de schema (D1)
- [x] 1.1 Modificar `apps/backend/prisma/schema.prisma`: `voto_id String? @unique @db.Uuid`,
      `proceso_id String? @db.Uuid`, `codigo_comprobante String?`, FK `Restrict` a `Voto`/
      `ProcesoElectoral`, `@@index([estado, creado_en])`, relaciones inversas `Voto.jobCorreo`/
      `ProcesoElectoral.jobsCorreo`
- [x] 1.2 Crear migración `apps/backend/prisma/migrations/20260814030000_jobcorreo_outbox_voto/
      migration.sql`: `ADD COLUMN` ×3, 2 FK `RESTRICT`, índice único, índice de despacho — sin
      backfill
- [x] 1.3 RED schema: `UNIQUE(voto_id)` rechaza un segundo job del mismo voto (`23505`) [spec
      outbox-correo: Columnas estructuradas aditivas; threat: Entrega duplicada]
- [x] 1.4 RED schema: la FK rechaza un `voto_id` inexistente (`23503`)
- [x] 1.5 RED schema: dos filas con `voto_id NULL` conviven sin colisión
- [x] 1.6 RED schema: `UPDATE … WHERE id=$1 AND estado='pendiente'` devuelve `rowCount=0` si otra
      transacción ya lo movió (barrera CAS de D6, verificable sin código de worker)
- [x] 1.7 GREEN: aplicar migración, crear `apps/backend/test/schema/outbox.spec.ts` — pasa 1.3-1.6

### Phase 2: Renderizador puro del correo (D2)
- [x] 2.1 RED unit: `construirCorreoComprobante()` contiene código, hora y enlace
- [x] 2.2 RED unit: no contiene ninguna subcadena de `lista`/`opción`/`candidato`/`blanco`/
      `elección` ni `eleccion_resumen` (lista negra) [spec: Contenido del correo nunca revela la
      elección; threat: Secreto del voto en el correo]
- [x] 2.3 RED unit: sin `app_base_url` ⇒ cuerpo sin enlace, sin excepción [threat: Configuración
      del enlace]
- [x] 2.4 RED unit: asunto invariante ante `proceso_nombre` con `\r\nBcc: x@y` [threat: Inyección
      de cabeceras SMTP]
- [x] 2.5 GREEN: crear `apps/backend/src/votos/correo-comprobante.ts` — pasa 2.1-2.4

### Phase 3: Insert en el marcador `[#15]` (D2/D3/D4)
- [x] 3.1 RED unit: la proyección del `$queryRaw` de `emitir()` agrega `p.nombre`, sin otro cambio
      a la sentencia de `#14` D4
- [x] 3.2 RED unit: tras `auditoria.log`, `tx.jobCorreo.create` se invoca **una** vez con
      `usuario_id` de `fila.usuario_id` (no `sesion.userId`), `voto_id`, `proceso_id`,
      `codigo_comprobante`, `asunto`/`cuerpo` ya materializados [spec: Voto y `JobCorreo` nacen
      juntos]
- [x] 3.3 RED unit: no existe `try/catch` alrededor del insert de `JobCorreo` — un fallo ahí
      burbujea igual que cualquier otro paso de la transacción (D4)
- [x] 3.4 GREEN: extender `apps/backend/src/votos/votos.service.ts` en el marcador — retirar el
      comentario `// [#15] Punto de extensión JobCorreo` — pasa 3.1-3.3
- [x] 3.5 Regresión: correr `votos.service.spec.ts` completo (suite de `#14`) y confirmar 0
      regresiones en validación/idempotencia/rechazo

### Phase 4: E2E de atomicidad (prueba de cierre del ADR-0018)
- [x] 4.1 RED e2e: commit conjunto — `POST /votos` ⇒ exactamente 1 `Voto` y 1 `JobCorreo` con
      `voto_id=voto.id`, `estado='pendiente'`, `intentos=0`, `cuerpo` sin subcadenas de la
      elección [spec: Voto y `JobCorreo` nacen juntos]
- [x] 4.2 RED e2e: rollback conjunto — `ALTER TABLE "JobCorreo" ADD CONSTRAINT tmp_falla CHECK
      (false) NOT VALID` antes del `POST` ⇒ `5xx`, 0 `Voto`, 0 `JobCorreo` para ese derecho;
      eliminar la restricción al terminar [spec: Fallo en cualquier paso revierte ambas filas]
- [x] 4.3 RED e2e: idempotencia de `#14` preservada — reintento con la misma clave ⇒ `200`, sigue
      habiendo exactamente 1 `JobCorreo`
- [x] 4.4 GREEN: crear `apps/backend/test/votos/outbox-atomicidad.e2e-spec.ts` — pasa 4.1-4.3

### Phase 5: Regresión PR1
- [x] 5.1 `pnpm --filter @seei/backend test -- votos` verde (suite unit completa, incl. `#14`)
- [x] 5.2 `pnpm --filter @seei/backend test:e2e -- outbox-atomicidad` verde contra Postgres real
- [x] 5.3 `pnpm typecheck` verde en los 4 paquetes

## PR 2 — Worker de outbox (base = PR 1 branch)

### Phase 6: Puertos y processor puro (D6/D8)
- [x] 6.1 RED vitest: `estado='enviado'` ⇒ `'no-op'` sin invocar `sender.send` [spec: Reintento de
      un job ya enviado es no-op]
- [x] 6.2 RED vitest: `repo.reclamar()` devuelve `false` ⇒ `'no-op'` sin `send` (CAS perdido)
      [threat: Entrega duplicada/reentrega]
- [x] 6.3 RED vitest: camino feliz ⇒ `send` con `asunto`/`cuerpo` verbatim y `repo.marcarEnviado`
      [spec: Envío exitoso marca el job como enviado]
- [x] 6.4 RED vitest: `send` que lanza ⇒ el error propaga y **no** se marca `fallido` (BullMQ
      reintenta, D7) [spec: Fallo transitorio agota reintentos y marca `fallido`]
- [x] 6.5 GREEN: crear `apps/worker/src/processors/outbox-correo.processor.ts` (función pura sobre
      `OutboxCorreoRepo`/`EmailSender`, sin `PrismaClient`) — pasa 6.1-6.4 [spec: Worker de outbox
      MUST NOT basarse en `system-ping.processor.ts` ni importar `PrismaClient`]

### Phase 7: Adaptador Prisma y despachador (D5/D9/D10)
- [x] 7.1 RED vitest: el despachador respeta `LIMIT` y genera `jobId` determinista
      `jobcorreo:<id>`
- [x] 7.2 GREEN: crear `apps/worker/src/outbox/outbox-dispatcher.ts` (polling `estado='pendiente'
      ORDER BY creado_en LIMIT` + `queue.addBulk`) — pasa 7.1
- [x] 7.3 Crear `apps/worker/src/outbox/outbox-correo.repo.ts`: adaptador Prisma de
      `OutboxCorreoRepo` (`leer`/`reclamar` vía `updateMany` CAS/`marcarEnviado`/`marcarFallido`/
      `pendientes`)
- [x] 7.4 Crear `apps/worker/src/outbox/email-sender.factory.ts`: compone `SmtpEmailSender`/
      `ConsoleEmailSender` leyendo `Configuracion` + `SMTP_USER`/`SMTP_PASSWORD`

### Phase 8: Wiring `main.ts` y empaquetado (D5/D7/D9/D10)
- [x] 8.1 Modificar `apps/worker/src/main.ts`: `PrismaClient`, cola `correo`, segundo `Worker`,
      listener `on('failed')` marca `fallido` sólo si `attemptsMade >= attempts`, arranque del
      despachador — cola `system` intacta
- [x] 8.2 Modificar `apps/worker/package.json`: `+@seei/backend` (workspace), `+@prisma/client`,
      `+nodemailer`; dev `+prisma`; script `generate`
- [x] 8.3 Modificar `infra/docker/worker.Dockerfile`: compilar `@seei/backend` y generar el
      cliente Prisma antes del `pnpm deploy`
- [x] 8.4 Modificar `infra/docker/docker-compose.yml`: `worker` `+DATABASE_URL`/`+SMTP_USER`/
      `+SMTP_PASSWORD`, `depends_on: migrate, postgres`; `backend` `+APP_BASE_URL`
- [x] 8.5 Modificar `turbo.json`: `test:e2e.env` `+= OUTBOX_POLL_MS`, `OUTBOX_BATCH`

### Phase 9: Regresión PR2
- [x] 9.1 `pnpm --filter @seei/worker test` verde
- [x] 9.2 `pnpm typecheck` verde en los 4 paquetes
- [x] 9.3 Verificar (D10, pregunta abierta): `pnpm --filter @seei/worker deploy --legacy` conserva
      el cliente Prisma generado; si falla, aplicar la contingencia de D10 (copiar
      `apps/backend/prisma/` a la imagen y `prisma generate` en la etapa de deploy)

## PR 3 — Endpoint de comprobante autenticado (base = PR 2 branch)

### Phase 10: `ComprobanteService` y endpoint (D11)
- [x] 10.1 RED unit: voto propio ⇒ delega en `VotosService.construirComprobante()` y responde el
      `ComprobanteDto` [spec comprobante-autenticado: Usuario autenticado consulta su propio
      comprobante]
- [x] 10.2 RED unit: voto ajeno (`Voto → DerechoVoto.usuario_id !== sesion.userId`) ⇒ `403`
      [spec: Comprobante de otro usuario es rechazado; threat: IDOR/enumeración]
- [x] 10.3 RED unit: `votoId` inexistente ⇒ `403` con el **mismo** cuerpo que el caso ajeno (sin
      `404` oráculo) [threat: IDOR/enumeración]
- [x] 10.4 GREEN: crear `apps/backend/src/votos/comprobante.service.ts` — pasa 10.1-10.3
- [x] 10.5 Modificar `apps/backend/src/votos/votos.controller.ts`: `GET
      /votos/comprobante/:votoId` con `@UseGuards(AuthGuard)`, `ParseUUIDPipe`, `@ApiResponse`
      para `200/400/401/403`
- [x] 10.6 Modificar `apps/backend/src/votos/votos.module.ts`: registrar `ComprobanteService`

### Phase 11: Suite e2e de comprobante autenticado
- [x] 11.1 RED e2e: voto propio ⇒ `200` con `eleccion_resumen` correcto (incluido "Voto en
      blanco") [spec: Usuario autenticado consulta su propio comprobante]
- [x] 11.2 RED e2e: voto de otro usuario ⇒ `403` con el mismo cuerpo que un `votoId` inexistente
      [spec: Comprobante de otro usuario es rechazado; threat: IDOR/enumeración]
- [x] 11.3 RED e2e: sin cookie ⇒ `401`, sin exponer datos del comprobante [spec: Petición sin
      autenticación es rechazada]
- [x] 11.4 RED e2e: `votoId` no-UUID ⇒ `400` [threat: Enrutamiento (cliente)]
- [x] 11.5 GREEN: crear `apps/backend/test/votos/comprobante-autenticado.e2e-spec.ts` — pasa
      11.1-11.4

### Phase 12: Contrato y regresión PR3
- [x] 12.1 `pnpm openapi:extract`: regenerar `packages/contracts/openapi.json` y
      `src/generated/api.d.ts`; `GET /votos/comprobante/{votoId}` documentado con `200/400/401/403`
- [x] 12.2 `pnpm --filter @seei/backend test:e2e -- comprobante-autenticado` verde
- [x] 12.3 `pnpm typecheck` verde en los 4 paquetes

## PR 4 — Página de comprobante autenticado (base = PR 3 branch)

### Phase 13: Ruta y API cliente (D12)
- [ ] 13.1 RED unit: `parsearRuta('/comprobante/<id>')` ida y vuelta y `rutaAPath` inversa;
      `/comprobante` sin id ⇒ `no-encontrada` [threat: Enrutamiento (cliente)]
- [ ] 13.2 GREEN: modificar `apps/frontend/src/app/rutas.ts`/`rutas.spec.ts`: variante `{ nombre:
      'comprobante'; votoId }` — pasa 13.1
- [ ] 13.3 Modificar `apps/frontend/src/votos/votos-api.ts`: wrapper `comprobante(votoId)` sobre
      `createSeeiClient` (requiere el contrato regenerado en PR3)

### Phase 14: `ComprobantePage` y ajuste de `PanelComprobante` (D12)
- [ ] 14.1 RED componente: `ComprobantePage` en cargando/`403`/éxito con `eleccion_resumen` [spec:
      Acceso vía enlace del correo; Acceso vía URL directa equivalente]
- [ ] 14.2 GREEN: crear `apps/frontend/src/votos/ComprobantePage.tsx` + `.spec.tsx` — pasa 14.1
- [ ] 14.3 Modificar `apps/frontend/src/app/Enrutador.tsx`: caso `'comprobante'` ⇒
      `ComprobantePage`
- [ ] 14.4 RED componente: `PanelComprobante` ya no ofrece la casilla "Quiero recibir una
      copia…"; muestra en su lugar la línea informativa de copia ya enviada
- [ ] 14.5 GREEN: modificar `apps/frontend/src/votos/piezas/PanelComprobante.tsx` + `.spec.tsx` —
      pasa 14.4

### Phase 15: Regresión PR4
- [ ] 15.1 `pnpm --filter @seei/frontend test` verde
- [ ] 15.2 `pnpm typecheck` verde en los 4 paquetes
- [ ] 15.3 Verificación funcional: sin sesión, `/comprobante/:votoId` muestra `LoginPage`
      conservando la URL (`#12` D11); tras autenticar, renderiza la misma ruta [threat:
      Enrutamiento (cliente)]

## PR 5 — Reconciliación, documentación y cierre del ADR-0018 (base = PR 4 branch)

### Phase 16: Script de reconciliación (D13)
- [ ] 16.1 Crear `apps/backend/scripts/reconciliar-outbox.ts` (tsx): `SELECT` de sólo lectura con
      `LEFT JOIN "JobCorreo" jc ON jc.voto_id = v.id WHERE jc.id IS NULL`; imprime filas y sale
      con código ≠ 0 si hay coincidencias; sin ninguna sentencia de escritura [spec: Mecanismo de
      reconciliación disponible sin ejecución contra datos reales; threat: Pérdida silenciosa del
      job]
- [ ] 16.2 Verificación manual: correr contra la base local (greenfield, sin votos reales) ⇒ 0
      filas, código de salida 0

### Phase 17: Documentación de variables nuevas
- [ ] 17.1 Modificar `docs/onboarding.md`: documentar `DATABASE_URL`, `SMTP_USER`,
      `SMTP_PASSWORD`, `OUTBOX_POLL_MS`, `OUTBOX_BATCH` del worker
- [ ] 17.2 Modificar `README.md`: mismas variables, sección de despliegue del worker

### Phase 18: Cierre del ADR-0018 (D14 — última tarea del change)
- [ ] 18.1 Confirmar que `outbox-atomicidad.e2e-spec.ts` (PR1) sigue verde en el estado final del
      change (condición literal de cierre del ADR-0018)
- [ ] 18.2 Modificar `adrs/0018-ventana-temporal-jobcorreo-diferido.md`: campo "Estado" ⇒
      "Superado por #15 (outbox-correo-comprobante-autenticado)" + una línea citando la suite
      verde que lo habilita; Contexto/Decisión/Alternativas/Consecuencias intactos [spec: Cierre
      de ADR-0018 condicionado a prueba verde]

### Phase 19: Regresión final del change
- [ ] 19.1 `pnpm --filter @seei/backend test` y `test:e2e` completos verdes contra Postgres real
- [ ] 19.2 `pnpm --filter @seei/worker test` verde
- [ ] 19.3 `pnpm --filter @seei/frontend test` verde
- [ ] 19.4 `pnpm typecheck` verde en los 4 paquetes
