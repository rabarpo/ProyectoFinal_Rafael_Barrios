# ADR 0013: Continuidad de jornada por procedimiento operativo

## Estado

Aceptado

## Contexto

La revisión adversarial (hallazgo A2) señaló que la restauración de respaldos a mitad de jornada
no tenía semántica definida: el VPS único ([ADR-0007]) es un punto único de fallo asumido, y
restaurar un respaldo horario durante la votación pierde hasta una hora de votos **cuyos
comprobantes ya fueron emitidos y enviados por correo** — votantes con código válido cuyo
`DerechoVoto` volvió a "pendiente". ¿Pueden revotar? ¿Se extiende el cierre? Nadie lo había
decidido, y es un procedimiento que el comité necesita escrito antes de la primera elección, no
improvisado a las 10:30 de la jornada.

## Decisión

**No se añade redundancia de infraestructura.** Se mantienen los respaldos horarios del
[ADR-0007] y se acepta una pérdida máxima de ~1 hora de votos, cubierta por un **procedimiento
operativo de contingencia** que forma parte de las bases del proceso electoral:

1. **Distinguir el tipo de caída:** si el VPS o el proveedor caen sin pérdida de datos, se
   reinicia el servicio y la jornada continúa — solo se registra la interrupción. La
   restauración de respaldo aplica únicamente ante pérdida o corrupción de datos.
2. **Restaurar el último respaldo** y levantar acta de incidencias con hora de la caída, hora de
   restauración y respaldo utilizado.
3. **Votos perdidos:** los derechos que constaban como ejercidos después del respaldo vuelven a
   "pendiente" por la propia restauración; los votantes afectados conservan comprobantes cuyo
   código ya no existe en el sistema. El acta de incidencias declara **nulos esos códigos** y
   los votantes afectados **vuelven a votar** — el "0 duplicados" se preserva porque el voto
   original ya no existe.
4. **Extensión del cierre:** el comité extiende la hora de cierre del proceso al menos por el
   tiempo de interrupción, mediante acción registrada en auditoría, antes de reabrir el acceso.
5. **Comunicación:** aviso a la comunidad (notificación interna + correo) de la interrupción,
   la extensión y la instrucción de revotar para quien tenga un comprobante anterior a la
   restauración.

El **ensayo previo a la primera jornada** exigido por el [ADR-0007] debe ejecutar este
procedimiento completo, no solo la restauración técnica.

## Alternativas consideradas

- **Archivado continuo de WAL** (pgBackRest/wal-g) — reduciría la pérdida de una hora a
  segundos con costo bajo; no se eligió por decisión del equipo de mantener la operación mínima:
  una pieza más que configurar, monitorear y ensayar para 1–2 jornadas al año.
- **Réplica en streaming a un segundo VPS** con failover manual — pérdida ~0 y continuidad
  rápida; descartada por duplicar infraestructura y administración permanentes para un evento
  puntual, contra el espíritu del [ADR-0007].

## Consecuencias

- La contingencia queda auditada de punta a punta: acta de incidencias, códigos anulados,
  extensión de cierre y revotos, todos como eventos de auditoría.
- **Costo real — pérdida aceptada:** hasta ~1 hora de votos puede requerir revoto. Es una
  molestia real para los afectados y una cifra que el acta oficial debe explicar; la decisión la
  asume a cambio de cero infraestructura adicional.
- **Costo real — procedimiento manual bajo presión:** la calidad de la respuesta depende de que
  el comité tenga el procedimiento escrito y ensayado. Sin el ensayo, este ADR no protege nada.
- Si la frecuencia de jornadas creciera o la tolerancia a revotos bajara, el primer paso de
  mejora es el WAL continuo (alternativa 1), que no cambia la topología.
