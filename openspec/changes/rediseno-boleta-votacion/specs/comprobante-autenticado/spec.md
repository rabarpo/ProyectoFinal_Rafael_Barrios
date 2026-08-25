# Delta for comprobante-autenticado

Cross-referencia: `PRD.md` §Comprobante, `Design.md` §Boleta de 3 pasos, `DESIGN-SYSTEM.md`
§Candidate Cards.

## ADDED Requirements

### Requirement: Jerarquía visual de éxito en el comprobante, sin campos fabricados

El sistema MUST mostrar en `PanelComprobante` un ícono/badge de éxito y el mensaje "¡Voto emitido
correctamente!" junto con los detalles reales del comprobante (fecha/hora, código de comprobante,
resumen de elección). El sistema MUST mostrar un badge condicional "Ya has votado" únicamente
cuando el votante reintenta acceder tras ya haber emitido su voto. El sistema MUST NOT introducir
"periodo lectivo" ni "estado de sincronización" en el comprobante, ni ningún otro campo sin
respaldo real en `ComprobanteDto`.

#### Scenario: Comprobante recién emitido muestra ícono de éxito
- GIVEN un votante que acaba de emitir su voto
- WHEN se renderiza `PanelComprobante`
- THEN muestra el ícono/badge de éxito, "¡Voto emitido correctamente!" y los datos reales del
  comprobante (fecha/hora, código, resumen de elección)
- AND no muestra el badge "Ya has votado"

#### Scenario: Reintento tras voto ya emitido muestra el badge "Ya has votado"
- GIVEN un votante que ya ejerció su derecho y vuelve a acceder al flujo de votación
- WHEN se renderiza `PanelComprobante` para ese derecho ya `ejercido`
- THEN muestra el badge condicional "Ya has votado" junto al comprobante existente

#### Scenario: El comprobante nunca muestra periodo lectivo ni estado de sincronización
- GIVEN cualquier estado de `PanelComprobante` (recién emitido o reintento)
- WHEN se inspecciona el contenido renderizado
- THEN no aparece ningún elemento etiquetado como "periodo lectivo" ni "estado de sincronización"
  ni ningún campo ausente en `ComprobanteDto`

### Requirement: Sin campos nuevos en `ComprobanteDto`

El rediseño visual de `PanelComprobante` MUST reutilizar exclusivamente los campos ya expuestos
por `ComprobanteDto` (fecha/hora, código de comprobante, `eleccion_resumen`). El sistema MUST NOT
agregar campos nuevos al DTO del comprobante para soportar este cambio de layout.

#### Scenario: El contrato de `ComprobanteDto` no cambia
- GIVEN el `ComprobanteDto` existente antes de este change
- WHEN se compara con el `ComprobanteDto` usado por el `PanelComprobante` rediseñado
- THEN el conjunto de campos es idéntico — ningún campo nuevo se agregó
