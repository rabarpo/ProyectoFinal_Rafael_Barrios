# Exploration: Backlog #15 — Outbox de correo y comprobante autenticado

## Current State

`VotosService.emitir()` (`apps/backend/src/votos/votos.service.ts:327`) ya trae el marcador exacto
`// [#15] Punto de extensión JobCorreo`, ubicado justo después de `auditoria.log(tx, 'VOTO', ...)`
y antes del `return` del callback de `$transaction`. Este es el punto de inserción obligatorio,
fijado por ADR-0018 — `#15` debe agregar exactamente una llamada ahí, nunca reescribir la
transacción, nunca leer votos ya confirmados desde fuera de ella (ADR-0018 veta explícitamente un
dispatcher desacoplado por esta razón, y declara su propia condición de cierre: "Superado por #15"
una vez que esto aterrice con una prueba que demuestre que `Voto` + `JobCorreo` hacen
commit/rollback juntos).

El modelo Prisma `JobCorreo` ya existe (`apps/backend/prisma/schema.prisma:367`), entregado por
`#2 base-schema-and-migrations`:
```
model JobCorreo {
  id, usuario_id, asunto, cuerpo, estado(EstadoJobCorreo: pendiente/enviado/fallido),
  intentos, creado_en
}
```
No tiene columna `proceso_id`/`voto_id`/`codigo_comprobante` — solo `asunto`/`cuerpo` de texto
libre. Eso significa que hay dos caminos: (a) el punto de extensión renderiza el texto completo del
correo (código, hora, enlace) en `asunto`/`cuerpo` al insertar, sin migración; o (b) `#15` agrega
columnas aditivas nullable para necesidades de worker/backfill — decisión de diseño abierta, no
resuelta acá.

`apps/worker/` ya tiene andamiaje: `package.json` (bullmq + ioredis + tsx + vitest cableados,
"nada que construir/lintear todavía"), `main.ts` (un `Worker` sobre la cola `system`), y
`processors/system-ping.processor.ts`. Ese processor trae un comentario explícito y vinculante:
**"NO REUTILIZABLE COMO ANDAMIAJE DE OUTBOX (ADR-0012)... Quien implemente el outbox NO debe copiar
este archivo como punto de partida"** — nunca debe importar `PrismaClient`. El dispatcher/worker
del outbox de `#15` es código nuevo en esta app, no una extensión del walking-skeleton de ping.

La infraestructura de envío de correo ya existe y está explícitamente reservada para que `#15` la
reutilice: `apps/backend/src/email/{email-sender.ts, email.module.ts, smtp-email-sender.ts,
console-email-sender.ts, configuracion-email-sender.ts}`. El comentario de la interfaz
`EMAIL_SENDER` dice textualmente: *"el outbox real es el backlog #15."* `ConfiguracionEmailSender`
resuelve `smtp_host/puerto/remitente` desde `Configuracion` de forma perezosa en cada `send()`
(nodemailer, sin pool/verify en construcción); la contraseña SMTP viene solo de una variable de
entorno, nunca persistida en `Configuracion` (según la spec `envio-correo`, archivada bajo
`configuracion-general`, que excluye explícitamente `JobCorreo`/`Notificacion`/worker-outbox de su
propio alcance).

Datos del comprobante hoy: `POST /votos` devuelve el único `ComprobanteDto` completo (con
`eleccion_resumen`) al momento de la emisión. `GET /votos/papeleta/:derechoVotoId` (existente,
`PapeletaService.obtener`) solo devuelve `codigo_comprobante`+`hora_servidor` en una relectura —
**sin la elección**. ADR-0009 exige un enlace autenticado que muestre la elección completa después
de iniciar sesión; **hoy no existe ningún endpoint que la exponga** — es un vacío real que `#15`
debe cerrar.

"Mis votaciones" (listado agregado de todos los procesos de un usuario) no existe todavía en
ningún lugar del frontend. El propio `design.md` de `vote-casting` dejó esto abierto
explícitamente: *"Mis votaciones es #16/#20 por decisión de la propuesta... ¿#16 se adelanta, o se
acepta la brecha?"* — sin embargo el texto literal de `BACKLOG.md` para `#15` dice *"comprobante
tras autenticarse y acceso desde 'Mis votaciones'"*. Es un conflicto de alcance real que la
propuesta de `#15` debe resolver.

## Affected Areas
- `apps/backend/src/votos/votos.service.ts` — extender la transacción en el punto marcado para
  insertar `JobCorreo`.
- `apps/backend/prisma/schema.prisma` — posibles columnas aditivas a `JobCorreo` (decisión abierta).
- `apps/backend/src/email/*` — reutilizar `EmailModule`/`EmailSender` existente desde el lado del
  worker/dispatcher.
- `apps/worker/src/*` — nuevo dispatcher de outbox + processor(s) de BullMQ, explícitamente no
  modelado sobre `system-ping.processor.ts`.
- `adrs/0018-ventana-temporal-jobcorreo-diferido.md` — actualización de estado a "Superado por #15"
  una vez entregado, según su propia condición de cierre declarada.
- `apps/backend/src/votos/papeleta.service.ts` o un endpoint nuevo — exponer el comprobante
  completo post-autenticación (con elección) para el enlace autenticado.
- Frontend — página nueva de comprobante detrás de auth; alcance/ubicación del acceso a "Mis
  votaciones" necesita resolución (página agregada completa vs. acceso mínimo por enlace directo).
- `apps/backend/test/procesos/` (patrón e2e) — nueva suite e2e que verifique la atomicidad
  `Voto`+`JobCorreo` en la misma transacción (prueba de cierre de ADR-0018).

## Approaches

1. **Insert dentro de la transacción con `asunto`/`cuerpo` pre-renderizados (sin migración)** —
   construir el texto completo del correo (código, hora, enlace) como strings planos en el punto
   de extensión, reutilizando la forma actual de `JobCorreo` tal cual.
   - Pros: cero riesgo de migración, camino más rápido para cerrar la ventana de ADR-0018, diff
     más chico.
   - Contras: sin columnas estructuradas para que el código de worker/backfill razone (p. ej. a
     qué `voto_id` pertenece un job) sin parsear texto; más difícil construir el destino del enlace
     autenticado de forma confiable solo con datos guardados.
   - Esfuerzo: Bajo

2. **Insert dentro de la transacción con columnas estructuradas aditivas (`voto_id`, `proceso_id`,
   `codigo_comprobante` nullable en `JobCorreo`)** — migración aditiva pequeña junto con la
   extensión de la transacción.
   - Pros: el dispatcher/worker y la lógica de backfill pueden consultar de forma limpia; la
     construcción del enlace no depende de parsear `cuerpo`; coincide con el espíritu de
     "verificable con un JOIN, no con disciplina de código" de ADR-0012.
   - Contras: vuelve a tocar el schema después de que #2 y #14 asumieron que estaba cerrado; riesgo
     de migración pequeño, aunque aditivo/nullable según el precedente del proyecto.
   - Esfuerzo: Bajo-Medio

3. **Dispatcher desacoplado que lee votos confirmados post-commit** — vetado explícitamente por
   ADR-0018; no viable.

## Recommendation

Se recomienda el enfoque 2 (insert dentro de la transacción + columnas estructuradas aditivas):
mantiene la extensión de la transacción trivial (una llamada de insert en el marcador existente)
mientras le da al código de worker/backfill/construcción-de-enlace datos consultables en vez de
texto parseado, coincidiendo con el objetivo de verificabilidad declarado en ADR-0012. El enfoque 1
queda como fallback válido si `sdd-design` decide que las columnas extra no valen ni una migración
aditiva nullable.

El conflicto de alcance de "acceso a Mis votaciones" (texto literal de BACKLOG vs. diferimiento de
`vote-casting` a #16/#20) debe resolverse explícitamente en la propuesta de `#15` — se recomienda
acotar `#15` al camino mínimo de acceso autenticado a un solo comprobante (una ruta alcanzable
desde el enlace del correo y/o una URL directa), dejando el listado agregado completo de "Mis
votaciones" para `#16`/`#20`, y declarando este acotamiento de forma explícita en vez de
reinterpretar en silencio el texto del BACKLOG.

## Risks
- Conflicto de alcance en "Mis votaciones" entre el texto literal de `BACKLOG.md` para `#15` y el
  diferimiento de `vote-casting`/design.md a #16/#20 — debe resolverse explícitamente, no en
  silencio, según la prohibición de `openspec/config.yaml` de contradecir decisiones previas
  calladamente.
- Obligación de backfill de ADR-0018: los votos confirmados durante la ventana en la que solo #14
  existía no tienen `JobCorreo` y son indistinguibles de "ya enviado" — `#15` debe diseñar y probar
  un camino de backfill/reconciliación si existen votos reales antes de que `#15` se despliegue.
- Trampa del andamiaje de worker: copiar `system-ping.processor.ts` como punto de partida está
  explícitamente prohibido por su propio comentario de código; hay que diseñar desde cero.
- Hoy ningún endpoint expone el comprobante completo post-auth (con `eleccion_resumen`) fuera de la
  respuesta inicial de `POST /votos` — es superficie nueva, no solo cableado.
- La entrega "at-least-once" (ADR-0012) exige que el dispatcher y el worker sean idempotentes por
  id de job — necesita cobertura de pruebas explícita.
- Las columnas aditivas de schema (si se elige el enfoque 2) vuelven a abrir una superficie de
  schema que dos changes previos (#2, #14) trataron como cerrada — necesita una migración clara y
  acotada, sin reordenar ni renombrar columnas existentes.

## Ready for Proposal
Sí. El punto de extensión, la alternativa vetada, la condición de cierre de ADR-0018, la
infraestructura reutilizable existente (`EmailModule`, restricciones del andamiaje de worker), y el
único conflicto de alcance abierto ("Mis votaciones") están identificados con suficiente precisión
para escribir `sdd-propose`. La propuesta debe resolver explícitamente la pregunta de alcance de
"Mis votaciones" y elegir el enfoque 1 vs. 2 para el schema.
