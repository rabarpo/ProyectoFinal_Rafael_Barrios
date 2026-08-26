# Proposal: Notificaciones (Backlog #19)

## Intent

Hoy el sistema solo envía un correo transaccional (comprobante de voto, #15). No existe ningún
aviso para inicio de votación, recordatorios, cierre próximo ni publicación de resultados, ni una
bandeja interna donde un usuario vea esos avisos dentro de la app. #19 cierra ese hueco
reutilizando el outbox `JobCorreo`/worker ya validado por #15, sin inventar un bus de eventos
nuevo (vetado por ADR-0018).

## Scope

### In Scope
- 4 eventos de notificación: inicio de votación, recordatorio de votación pendiente, cierre
  próximo, publicación de resultados.
- Inicio de votación y publicación de resultados: insertados dentro de las transacciones
  existentes de apertura (#13) y cierre (#17) — mismo patrón que #15 aplicó al voto.
- Recordatorio y cierre próximo: **sweep periódico** nuevo en el worker que escanea
  `ProcesoElectoral WHERE estado='abierto'` y compara contra `fecha_cierre_prevista` usando
  umbrales configurables por variable de entorno (con valores por defecto razonables),
  insertando `JobCorreo`/`Notificacion` de forma idempotente (una sola vez por proceso+tipo).
- Ampliación aditiva de `Notificacion`: nuevas columnas `usuario_id`, `titulo`, `cuerpo`,
  `leido_en` (nullable); `job_correo_id` pasa a ser **nullable** (una notificación interna puede
  existir sin correo asociado); nuevo valor de enum `interna` en `TipoNotificacion` (aditivo,
  Postgres no permite reordenar/renombrar).
- Motor de plantillas mínimo: funciones puras parametrizadas por tipo de notificación (mismo
  patrón que `construirCorreoComprobante()` de #15), sin tabla de plantillas en BD.
- Cola BullMQ **dedicada** `notificaciones` (no comparte cola con `correo`), para que una ráfaga
  de recordatorios no demore los comprobantes de voto.
- Endpoint de lectura de bandeja interna: `GET /notificaciones` (propias del usuario autenticado,
  paginado) y `PATCH /notificaciones/:id/leido`.

### Out of Scope
- UI de frontend para la bandeja interna (mismo criterio de split que #17→#26-29 y #18: backend
  primero, UI en un change posterior).
- Preferencias de notificación por usuario (activar/desactivar tipos, canales) — no lo pide el
  backlog; se puede agregar después sin romper este diseño.
- Notificaciones push/SMS — solo correo + bandeja interna, como dice la fila del backlog.
- Reconfiguración de los umbrales de "recordatorio"/"cierre próximo" vía UI de administración —
  quedan como variables de entorno en esta primera vuelta.
- Reintentos/backoff distintos a los ya provistos por BullMQ (`attempts`, backoff exponencial),
  ya cubiertos por el patrón de #15/#17/#18.

## Capabilities

### New Capabilities
- `notificaciones`: bandeja interna + correo para 4 eventos del ciclo de vida de un proceso
  electoral (inicio, recordatorio, cierre próximo, resultados), con motor de plantillas propio,
  cola BullMQ dedicada y lectura vía API.

### Modified Capabilities
- None (la extensión de `Notificacion`/`JobCorreo` es aditiva a nivel de esquema, no cambia
  requisitos de spec existentes de #15).

## Approach

- Reusar el outbox `JobCorreo` + worker de #15 para los 4 tipos de evento; el processor de correo
  ya es agnóstico del contenido (envía `asunto`/`cuerpo` ya renderizados).
- Insertar filas transaccionalmente en los 2 hooks existentes (apertura/cierre) para inicio y
  resultados — sin dispatcher reactivo nuevo, respetando ADR-0018.
- Nuevo sweep de tiempo (poller adicional en el worker, mismo patrón de polling+`addBulk` que ya
  usan `actas`/`reportes`/`correo`) para recordatorio/cierre próximo, con umbrales configurables
  por env var y una restricción de unicidad (proceso_id + tipo) que evita reenvíos duplicados.
- Ampliar `Notificacion` con columnas aditivas + `job_correo_id` nullable + valor de enum
  `interna`, siguiendo el precedente de `TipoActa` en #17 (D2): nunca reordenar/renombrar valores
  de enum en Postgres.
- Cola BullMQ propia `notificaciones`, siguiendo el precedente de aislamiento por dominio de
  `actas` (#17) y `reportes` (#18).
- Motor de plantillas: funciones puras por tipo de notificación (no tabla en BD) — mínimo viable,
  evita sobrediseñar antes de tener un segundo caso de uso que lo justifique.

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `apps/backend/prisma/schema.prisma` | Modified | Columnas aditivas en `Notificacion`, `job_correo_id` nullable, nuevo valor de enum `interna` |
| `apps/backend/src/notificaciones/` | New | Módulo Nest: `GET /notificaciones`, `PATCH /notificaciones/:id/leido` |
| `apps/backend/src/procesos/apertura.ts` (o equivalente #13) | Modified | Insertar `JobCorreo`/`Notificacion` de inicio dentro de la transacción de apertura |
| `apps/backend/src/procesos/escrutinio.ts` / cierre (#17) | Modified | Insertar `JobCorreo`/`Notificacion` de resultados dentro de la transacción de cierre |
| `apps/worker/src/notificaciones/` | New | Sweep periódico de recordatorio/cierre próximo, plantillas puras |
| Cola BullMQ `notificaciones` | New | Cola propia, aislada de `correo`/`actas`/`reportes` |
| `apps/worker/src/outbox/*` | Reused (no modificado) | Processor de correo existente, agnóstico del tipo |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Sweep periódico duplica notificaciones si corre varias veces sobre el mismo umbral | Med | Constraint de unicidad (`proceso_id`, `tipo_notificacion`) + inserción idempotente con `ON CONFLICT DO NOTHING` |
| Umbrales fijos de tiempo no sirven para todos los procesos electorales | Med | Configurables por variable de entorno con default razonable, documentado como limitación de esta vuelta |
| Ampliar `Notificacion` sin validar bien su forma final bloquea futuras iteraciones | Low | Columnas aditivas + FK nullable, reversible sin down-migration destructiva |
| Cola nueva agrega superficie operativa (una cola más que monitorear) | Low | Sigue el mismo patrón ya operado para `actas`/`reportes`, sin infraestructura nueva |

## Rollback Plan

Feature aislada en un módulo nuevo (`notificaciones/`) y una cola nueva (`notificaciones`); revertir
es quitar el módulo backend, el sweep del worker, y la migración aditiva de `Notificacion` (down
migration remueve columnas nuevas; el valor de enum `interna` queda sin uso pero no se puede
eliminar de Postgres — riesgo aceptado, mismo precedente que `TipoActa`). Los hooks transaccionales
de apertura/cierre son la única modificación a código existente; revertir esas dos inserciones basta
para desactivar inicio/resultados sin afectar el resto de la transacción.

## Dependencies

- #15 (outbox-correo-comprobante-autenticado), ya archivado — `JobCorreo`, worker, processor de
  correo.
- #13 (transacción de apertura de proceso) — hook para notificación de inicio.
- #17 (cierre-escrutinio-actas), ya archivado — hook para notificación de resultados.
- ADR-0018 — veta dispatcher reactivo externo a las transiciones de estado.

## Success Criteria

- [ ] Al abrir un proceso electoral se crea exactamente una notificación (correo + bandeja
      interna) de inicio de votación por usuario habilitado.
- [ ] Al cerrar un proceso electoral se crea exactamente una notificación de publicación de
      resultados por usuario habilitado.
- [ ] El sweep periódico crea como máximo una notificación de recordatorio y una de cierre
      próximo por proceso, sin duplicados aunque el sweep corra múltiples veces.
- [ ] `GET /notificaciones` devuelve las notificaciones del usuario autenticado, y
      `PATCH /notificaciones/:id/leido` marca `leido_en`.
- [ ] Una ráfaga de recordatorios no retrasa el envío de correos de comprobante de voto (colas
      aisladas).

## Proposal question round

Confirmado por el usuario el 2026-08-25, las 5 decisiones quedan fijadas tal como las propuso
`sdd-propose`:

1. **Mecanismo de scheduling**: sweep periódico (opción a), no BullMQ delayed jobs. **Confirmado.**
2. **Umbrales de tiempo**: defaults razonables por variable de entorno (sin valor de negocio
   específico dado por el usuario), sin UI de administración en esta vuelta. **Confirmado.**
3. **Bandeja interna**: se amplía `Notificacion` existente (columnas aditivas + `job_correo_id`
   nullable + enum `interna`) en vez de una tabla nueva. **Confirmado.**
4. **Cola dedicada `notificaciones`**: se aísla de `correo`, siguiendo el precedente de
   `actas`/`reportes`. **Confirmado.**
5. **UI de bandeja interna fuera de alcance**: se defiere a un change posterior, igual que
   #17→#26-29 y #18. **Confirmado.**
