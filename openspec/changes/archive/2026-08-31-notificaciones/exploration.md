# Exploración: notificaciones (backlog #19)

## Alcance (BACKLOG.md, fila #19)

Bandeja interna y correo: inicio de votación, recordatorios, cierre próximo y publicación de
resultados; plantillas con variables y ritmo de envío por lotes. Depende de #15
(outbox-correo-comprobante-autenticado), ya archivado.

## 1. Cómo está modelado hoy el envío de correo

- **`JobCorreo`** (`apps/backend/prisma/schema.prisma:385`): `id`, `usuario_id`, `asunto`, `cuerpo`,
  `estado` (`pendiente|enviado|fallido`), `intentos`, `creado_en`, más las columnas aditivas de #15:
  `voto_id` (FK única, nullable), `proceso_id` (FK, nullable), `codigo_comprobante` (nullable). El
  diseño de #15 (D1/D15) dejó **explícitamente** `voto_id`/`proceso_id` en `NULL` como la puerta de
  entrada para #19 — no hace falta migración nueva para insertar jobs sin voto asociado.
- **`Notificacion`** (`schema.prisma:409`) **ya existe** desde #2 (`base-schema-and-migrations`,
  2026-08-07): `id`, `job_correo_id` (FK **requerida** a `JobCorreo`), `tipo TipoNotificacion
  @default(correo)`, `creado_en`. El enum `TipoNotificacion` tiene **un solo valor** (`correo`). Es
  una tabla placeholder: no tiene `usuario_id`, `titulo`, `cuerpo`, ni `leido/leido_en`, y no la
  referencia ningún servicio/controlador — solo aparece en `migration-inventory.spec.ts` (conteo de
  tablas) y en el propio schema. **No sirve como bandeja interna tal cual**; requeriría columnas
  aditivas (`usuario_id`, `titulo`, `cuerpo`, `leido_en`) y agregar un valor al enum (`ALTER TYPE …
  ADD VALUE 'interna'` — Postgres no permite reordenar/renombrar, mismo precedente que
  `TipoActa` en #17 D2).
- **Worker** (`apps/worker/src/main.ts`): patrón repetido tres veces (correo/actas/reportes) — cola
  BullMQ dedicada + `setInterval` que hace *polling* sobre `estado='pendiente'` y encola por lotes
  (`addBulk`), más un `processor` puro sobre puertos (`OutboxCorreoRepo`, `EmailSenderPuerto`) sin
  `PrismaClient` directo. El processor de correo (`outbox-correo.processor.ts`) es agnóstico del
  contenido: envía `asunto`/`cuerpo` tal cual, ya renderizados — reutilizable sin cambios para
  cualquier fila `JobCorreo`, sea del tipo que sea.

## 2. Eventos de dominio y disparo

- **No existe ningún bus de eventos.** Apertura (`apertura_real`) y cierre (`cierre_real`) son
  transiciones de `estado` selladas con reloj de Postgres **dentro** de la misma transacción que
  hace otro trabajo (congelamiento de padrón en #13; cuadre/escrutinio en #17). ADR-0018 veta de
  forma permanente cualquier dispatcher que lea estas transiciones desde fuera después del commit.
- Consecuencia: "inicio de votación" y "publicación de resultados" deben insertarse como
  `tx.jobCorreo.create(...)` (o `tx.notificacion.create(...)`) **dentro** de esas transacciones
  existentes — mismo patrón que #15 aplicó al voto, no un dispatcher reactivo nuevo.
- **"Recordatorios" y "cierre próximo" NO tienen ningún gancho transaccional**: dependen de tiempo
  transcurrido relativo a `fecha_cierre_prevista`, no de una transición de estado. Este es el
  hallazgo de mayor riesgo (ver sección 5).

## 3. Plantillas con variables

- Hoy **no existe motor de plantillas**. #15 usa `construirCorreoComprobante()`: una función pura
  con una plantilla fija hardcodeada, sin abstracción de variables ni almacenamiento en BD. #19
  necesita crear ese mecanismo desde cero (por ejemplo, funciones puras por tipo de notificación, o
  una tabla de plantillas con placeholders) — es trabajo nuevo, no una extensión de algo existente.

## 4. "Ritmo de envío por lotes"

- El worker de #15 ya batchea vía polling + `addBulk`, con `attempts:5`/backoff exponencial
  compartido. Pregunta abierta para propose: ¿#19 reutiliza la **misma** cola `correo` (riesgo: una
  ráfaga de recordatorios podría demorar los correos de confirmación de voto) o recibe **cola
  propia**, como ya hicieron `actas` (#17) y `reportes` (#18) para no bloquear un canal lento detrás
  de otro? Recomendación: cola dedicada, consistente con el precedente de una cola por dominio.

## 5. Riesgos y ambigüedades (para la ronda de preguntas de sdd-propose)

- **No hay scheduler/cron en todo el sistema.** Todos los "lotes" del worker son pollers reactivos
  a filas ya insertadas transaccionalmente — funcionan para eventos (apertura/cierre/resultados)
  pero no para condiciones de tiempo relativo ("2 horas antes del cierre"). Opciones de bajo riesgo:
  - (a) Un sweep periódico nuevo en el worker que escanee `ProcesoElectoral WHERE estado='abierto'
    AND fecha_cierre_prevista BETWEEN now() AND now()+umbral` e inserte `JobCorreo`/`Notificacion`
    de forma idempotente (mismo patrón outbox, sin infraestructura nueva).
  - (b) Jobs `delayed`/`repeatable` de BullMQ programados al momento de abrir el proceso, calculados
    como `cierre_prevista - N horas` (acopla el scheduling a BullMQ, algo más de superficie pero
    evita un poller a medida).
- **Bandeja interna** no tiene ningún endpoint de lectura hoy (`GET /notificaciones` no existe) ni
  pieza de frontend — hay que diseñarlo desde cero.
- **`Notificacion.job_correo_id` es obligatorio (`String`, no nullable)**: si la bandeja interna
  debe existir sin enviar correo (por ejemplo, solo notificación in-app), este esquema actual no lo
  permite — o se hace nullable, o cada notificación interna siempre nace acompañada de un
  `JobCorreo` (aunque no se envíe correo real), decisión que sdd-propose debe fijar explícitamente.
- El enum `TipoNotificacion` de un solo valor es evidencia de que el diseño original de #2 nunca se
  completó — cualquier ampliación debe declarar explícitamente por qué agrega valores en vez de
  rediseñar la tabla.

## Comparación de enfoques (resumen para propose)

| Enfoque | Pros | Contras | Esfuerzo |
|---|---|---|---|
| Reusar `JobCorreo`+worker de #15 para todo, agregar sweep de tiempo en worker | Reutiliza infra probada, sin nueva cola de mensajería, cumple ADR-0018 | El sweep de tiempo es un mecanismo nuevo (aunque simple) sin precedente exacto | Medio |
| BullMQ delayed/repeatable jobs para recordatorios/cierre próximo | Evita poller a medida, BullMQ ya gestiona reintentos | Acopla scheduling a la cola, requiere programar el delay al abrir el proceso (transaccional) | Medio-alto |
| Ampliar `Notificacion` a bandeja interna real (columnas aditivas + enum) | Reutiliza tabla ya existente, aditivo, sin romper nada | Tabla nunca se usó — validar que su forma actual (FK obligatoria a JobCorreo) sea la correcta antes de construir sobre ella | Bajo-medio |
| Cola dedicada `notificaciones` en vez de compartir `correo` | Evita que recordatorios bloqueen confirmaciones de voto, sigue el precedente `actas`/`reportes` | Una cola más que mantener | Bajo |

## Rutas relevantes

- `apps/backend/prisma/schema.prisma` (líneas 385-416)
- `apps/worker/src/main.ts`
- `apps/worker/src/outbox/*`
- `apps/backend/src/votos/correo-comprobante.ts`
- `openspec/changes/archive/2026-08-15-outbox-correo-comprobante-autenticado/design.md` (D15,
  preguntas abiertas)

## Resumen ejecutivo

#19 debe reutilizar el outbox `JobCorreo`/worker de #15 (ya preparado con `voto_id`/`proceso_id`
nullable) para los eventos transaccionales (apertura/cierre/resultados), pero necesita construir
desde cero un motor de plantillas y — el riesgo central — algún mecanismo de scheduling por tiempo
relativo (recordatorios, cierre próximo) que hoy no existe en ningún lado del sistema; la tabla
`Notificacion` existe pero es un placeholder inutilizable sin cambios aditivos.

**next_recommended**: sdd-propose
