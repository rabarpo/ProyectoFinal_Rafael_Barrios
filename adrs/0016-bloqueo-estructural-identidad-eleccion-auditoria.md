# ADR 0016: Bloqueo estructural identidad↔elección en el payload de auditoría

## Estado

Aceptado

## Contexto

El [ADR-0010] §1 decide que "el evento `VOTO` de auditoría no contiene la elección [...] nunca la
lista u opción elegida", pero no fija **cómo** se impone. El hallazgo C1 de REVISION-ADVERSARIAL.md
—el hallazgo que originó el ADR-0010— ya mostró que confiar en que cada DTO futuro omita el campo es
insuficiente: `EventoAuditoria.payload` es `JSONB` y quien implemente los backlog #14/#16/#18 puede
violar la regla agregando una clave, sin que ninguna restricción de columna lo note. El [ADR-0003]
impone las demás garantías de auditoría en el motor, no en el código de aplicación; esta quedó como
la única garantía de auditoría sostenida solo por convención de revisión.

## Decisión

Un trigger `BEFORE INSERT ... FOR EACH ROW` sobre `EventoAuditoria`, activo cuando
`event_type IN ('VOTO','RECHAZO')`, que rechaza el insert con SQLSTATE `AU002` si el `payload`
contiene, **en cualquier nivel de anidamiento**, alguna de las claves `candidato_id`, `lista_id`,
`opcion_id`, `blanco` o `eleccion`.

1. **Alcance `VOTO` + `RECHAZO`.** Un rechazo nunca necesita transportar la elección —el voto jamás
   se emitió—, pero un implementador podría volcar el estado del formulario en su payload y filtrar
   intención de voto, tan sensible como la elección misma en un entorno escolar.
2. **Verificación recursiva, no solo de primer nivel.** Una verificación de raíz se evade con
   `{"detalle": {"candidato_id": "..."}}`, que es exactamente la clase de error que este trigger
   existe para detener.
3. **Obligación para tipos de evento futuros.** Todo tipo de evento nuevo que toque un `Voto` DEBE
   agregarse a la cláusula `WHEN` de este trigger en su propia migración. El trigger no se aplica a
   todos los tipos porque eventos legítimos sobre `Candidato`/`Lista` (backlog #12, #13) llevan
   `candidato_id`/`lista_id` con toda propiedad.

## Alternativas consideradas

- **Disciplina de DTO y revisión de código** — costo cero; no se eligió porque es exactamente lo que
  el hallazgo C1 declaró insuficiente, y la garantía quedaría dependiendo de que cada contribuyente
  futuro conozca el ADR-0010.
- **Columnas tipadas en vez de `JSONB`** — el motor impondría la forma; no se eligió porque los tipos
  de evento son heterogéneos (un `VOTO` no se parece a un `CORREO_FALLIDO`) y el propio [ADR-0003] ya
  se comprometió con "columna JSONB para el detalle del evento".
- **Verificación solo de claves de primer nivel** (`payload ?| array[...]`) — más simple y barata; no
  se eligió porque se evade anidando una clave un nivel más abajo.
- **Aplicar el trigger a todos los tipos de evento** — máxima cobertura; no se eligió porque
  convertiría en falso positivo permanente cualquier evento legítimo de gestión de candidatos.

## Consecuencias

- La garantía identidad↔elección del [ADR-0010] pasa de convención a imposición del motor: se dispara
  sin importar qué módulo del backend escriba el evento.
- Como el insert de auditoría comparte transacción con la escritura de negocio, un payload malformado
  **aborta la operación de negocio completa**. Es deliberado y coherente con el precedente de outbox
  del [ADR-0012]: una operación que no puede auditarse de forma durable no ocurrió.
- **Costo real:** el trigger impone **nombres de clave canónicos, no semántica**. Un payload que
  escriba la elección bajo un nombre sinónimo (`opcion`, `elegido`) o dentro de un valor de texto
  libre pasa. Cierra la filtración accidental y descuidada —el caso realista—, no a un implementador
  determinado a codificar la elección; ese límite se mitiga en revisión de código, no aquí.
- **Costo real:** la cláusula `WHEN` es una lista que hay que mantener. Un tipo de evento futuro que
  toque un `Voto` y no se agregue a ella queda fuera de la garantía. El test de catálogo del backlog
  #3 aserta el contenido literal de la cláusula para que su alcance sea visible y versionado.
