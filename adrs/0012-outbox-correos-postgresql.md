# ADR 0012: Outbox de correos en PostgreSQL

## Estado

Aceptado

## Contexto

La revisión adversarial (hallazgo A1) detectó una ventana sin dueño: el [ADR-0006] encolaba el
job de correo en BullMQ "tras el commit" de la transacción del voto. Si el backend cae entre el
commit y el encolado, existe un voto sin job de correo — y nada lo detecta, violando
silenciosamente el criterio de éxito del PRD ("el 100% de los votos emitidos genera su copia de
confirmación"). Además, el modelo de datos tenía `JobCorreo` como tabla en PostgreSQL mientras
el [ADR-0002] declaraba la cola en BullMQ/Redis, sin definir cuál era la fuente de verdad de los
envíos pendientes.

## Decisión

**Patrón outbox con PostgreSQL como fuente de verdad y BullMQ como motor de ejecución:**

- La fila `JobCorreo` se inserta **dentro de la misma transacción** que el hecho que notifica —
  el voto ([ADR-0006]) o cualquier otra notificación transaccional. Si el voto existe, su job
  existe; si la transacción no confirma, no existe ninguno de los dos.
- Un **despachador** (proceso del worker) lee los jobs pendientes del outbox y los entrega a
  BullMQ, que ejecuta el envío con los reintentos y el ritmo por lotes ya decididos
  ([ADR-0002]).
- El estado final (enviado / fallido + reintentos) se escribe de vuelta en `JobCorreo`. Redis
  puede vaciarse o caer sin pérdida: los pendientes se redescubren desde PostgreSQL.

## Alternativas consideradas

- **Encolar en BullMQ tras el commit** (el diseño original) — más simple, sin despachador; no se
  eligió porque deja la ventana commit→encolado abierta y reparte la verdad de los envíos entre
  dos almacenes sin regla de desempate.
- **Job de reconciliación periódico** — mantener el encolado post-commit y comparar
  periódicamente votos vs. correos para reparar faltantes; no se eligió porque la garantía del
  100% pasaría a depender de que la reconciliación corra y esté bien escrita — un segundo
  mecanismo que mantener, en lugar de eliminar el hueco de raíz.

## Consecuencias

- El criterio "cada voto confirmado genera exactamente un job de correo" lo garantiza la misma
  transacción ACID que garantiza el voto — verificable con un `JOIN`, no con disciplina de
  código.
- La entrega outbox→BullMQ es **at-least-once**: despachador y worker deben ser idempotentes por
  id de job. Un correo duplicado ocasional es tolerable; un voto sin correo no lo era.
- **Costo real:** aparece un componente más (el despachador) y un polling liviano sobre la tabla
  outbox; ambos viven en el proceso del worker ya existente, no son un deployable nuevo.
