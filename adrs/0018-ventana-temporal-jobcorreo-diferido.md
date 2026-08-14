# ADR 0018: Ventana temporal sin `JobCorreo` en la transacción del voto (#14 antes de #15)

## Estado

Aceptado — **temporal y acotado**: queda derogado por la implementación del backlog #15, sin
necesidad de un ADR posterior que lo revierta (ver "Condición de cierre").

## Contexto

El [ADR-0006] §3 y el [ADR-0012] exigen, de forma independiente, que la fila `JobCorreo` del
correo de confirmación nazca **dentro de la misma transacción** que el voto que notifica: "si el
voto existe, su job existe". Esa regla nació del hallazgo A1 de `REVISION-ADVERSARIAL.md` — encolar
"tras el commit" deja una ventana en la que un voto confirmado no tiene job y nada lo detecta.

El `BACKLOG.md` asigna literalmente el outbox de correo —**incluida la inserción de la fila**, no
solo el despachador que la consume— al ítem **#15** ("Outbox de correo y comprobante autenticado"),
mientras que el ítem **#14** ("Emisión del voto en 3 pasos") entrega la transacción del voto. El
usuario decidió de forma explícita respetar esa asignación literal en vez de adelantar la inserción
a #14, como había recomendado la exploración de #14.

En consecuencia, entre el despliegue de #14 y el de #15 existe una ventana en la que un voto
confirmado puede quedar sin su job de correo. Es exactamente el hallazgo A1 que el [ADR-0012] había
cerrado. `openspec/config.yaml` prohíbe contradecir un ADR en silencio; esta desviación es
consciente, acotada en el tiempo y necesita constancia propia.

## Decisión

**#14 no inserta `JobCorreo`. La regla de los [ADR-0006]/[ADR-0012] no se deroga: se difiere, con
tres obligaciones vinculantes para #15.**

1. **Punto de extensión obligatorio.** La transacción de `VotosService.emitir()` deja un marcador
   explícito (`// [#15] Punto de extensión JobCorreo`) inmediatamente después del
   `auditoria.log(tx, 'VOTO', …)` y antes del retorno del callback de `$transaction`. #15 agrega
   **una** llamada en ese punto; no reescribe la transacción.
2. **Prohibición explícita del despachador desacoplado.** #15 **DEBE** insertar la fila dentro de
   esa transacción existente. Un mecanismo que lea votos ya confirmados desde fuera de la
   transacción original (barrido periódico, trigger `AFTER COMMIT`, cola externa) reproduce el
   hallazgo A1 de forma permanente y queda vetado por este ADR, no solo desaconsejado.
3. **La ventana es de disponibilidad, nunca de integridad.** Ningún voto se pierde, se duplica ni
   cambia de contenido por esta desviación: el voto, su cambio de estado y su evento `VOTO` siguen
   siendo atómicos. Lo único que puede faltar es la notificación por correo de un voto emitido en
   la ventana, y el comprobante en pantalla ([ADR-0009]) sigue siendo la prueba inmediata para el
   votante.

## Alternativas consideradas

- **Adelantar la inserción mínima de `JobCorreo` a #14** (recomendación de la exploración de #14) —
  cerraría la ventana de inmediato y cumpliría los [ADR-0006]/[ADR-0012] al pie de la letra. No se
  eligió por decisión explícita del usuario: la asignación del `BACKLOG.md` es literal y adelantar
  la fila arrastraría a #14 decisiones de plantilla, destinatario y estado que pertenecen a #15.
- **Enmendar el [ADR-0006] y el [ADR-0012]** para permitir el encolado post-commit — no se eligió:
  convertiría una desviación temporal en un cambio de rumbo permanente y reabriría el hallazgo A1
  de forma definitiva, que es justamente lo que el [ADR-0012] existe para impedir.
- **Bloquear #14 hasta que #15 esté listo** — cero ventana, pero deja el criterio de éxito central
  del PRD ("0 votos duplicados") sin implementar por depender de una funcionalidad de notificación,
  invirtiendo la prioridad real del sistema.
- **Registrar la desviación solo como riesgo en la propuesta de #14** — no se eligió: un riesgo en
  un artefacto de change se archiva con el change y deja de ser visible; la regla que se desvía
  vive en dos ADR y su desviación debe ser igual de visible.

## Consecuencias

- Mientras #14 esté desplegado sin #15, **un voto confirmado puede no generar copia por correo** si
  el proceso cae inmediatamente después del commit. El criterio de éxito del PRD ("el 100% de los
  votos emitidos genera su copia de confirmación") **no es exigible** en esa ventana, y no debe
  reportarse como cumplido.
- **Costo real:** durante la ventana no existe ningún mecanismo de detección — no hay fila
  `JobCorreo` que quede `pendiente`, así que un voto sin correo es indistinguible de un voto con
  correo ya enviado. La reparación tras implementar #15 exige un backfill manual desde las filas
  `Voto` sin `JobCorreo` asociado; #15 **DEBE** contemplarlo si ya existen votos reales.
- **Mitigación operativa:** mientras la ventana esté abierta, no abrir un proceso electoral real en
  producción sin #15 desplegado. Es una restricción de despliegue, no de código.
- **Condición de cierre:** este ADR queda derogado en el momento en que #15 inserte la fila en el
  punto de extensión de la transacción de #14. La verificación de #15 debe asertar que un `Voto`
  y su `JobCorreo` nacen en la misma transacción (rollback ⇒ ninguno de los dos), y con esa prueba
  verde el estado de este ADR pasa a "Superado por #15".
