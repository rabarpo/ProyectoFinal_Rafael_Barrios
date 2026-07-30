# ADR 0006: Emisión del voto síncrona y transaccional; correo de confirmación asíncrono

## Estado

Aceptado

## Contexto

La emisión del voto es la ruta crítica del sistema y concentra los casos borde más duros del
PRD: corte de conexión a mitad del paso 3 ("o se registra completo y se confirma, o no se
registra"), doble clic / dos pestañas registran un solo voto, la validez frente a la hora de
cierre la decide la hora de la **confirmación** según el reloj del servidor, y el fallo del
correo de copia **no invalida el voto** pero queda registrado en auditoría (100% de los votos
generan copia por correo como criterio de éxito, con la excepción auditada de correos
inválidos).

Los ADR anteriores aportan piezas: UNIQUE + transacción ([ADR-0003]), clave de idempotencia en
`POST /votos` ([ADR-0004]), worker con cola BullMQ ([ADR-0001], [ADR-0002]). Falta fijar el
patrón de procesamiento completo.

## Decisión

**Escritura síncrona en la petición + correo asíncrono en el worker:**

1. `POST /votos` (con clave de idempotencia generada al entrar al paso 3) ejecuta **una sola
   transacción** en PostgreSQL que:
   - valida derecho al voto: usuario activo, pertenencia al padrón congelado, proceso abierto
     según **hora del servidor sellada dentro de la transacción**, y no haber votado;
   - inserta el voto (protegido por `UNIQUE (proceso_id, derecho_voto_id)`);
   - marca el derecho de padrón como ejercido y registra el evento de auditoría `VOTO`.
2. Solo si la transacción confirma, responde `201` con el comprobante (código de voto, hora del
   servidor, elección). Si falla o se corta la conexión antes del commit, no existe voto y el
   votante puede reintentar; un reintento con la misma clave de idempotencia devuelve el
   comprobante ya emitido en lugar de error.
3. El job de correo nace **dentro de la misma transacción** como fila del outbox `JobCorreo`
   ([ADR-0012]): no puede existir voto confirmado sin su job. Un despachador lo entrega a BullMQ
   y el worker lo envía con reintentos y ritmo por lotes; un fallo definitivo genera evento de
   auditoría `CORREO_FALLIDO` y alimenta el contador de correos fallidos del panel — sin tocar
   el voto.
4. Los rechazos (fuera de horario, ya votó, sin padrón, doble envío) también se registran como
   eventos de auditoría `RECHAZO`, como muestra el Design.md (`1i`).

## Alternativas consideradas

- **Voto encolado (write-behind)** — el POST deja el voto en una cola y responde "recibido"; el
  worker lo persiste después. Absorbería picos extremos de escritura, pero el comprobante se
  emitiría antes de que el voto exista, contradiciendo el caso borde del PRD, y volvería ambigua
  la hora que decide la validez frente al cierre (¿encolado o persistencia?). Para ~1,000
  escrituras repartidas en una jornada, PostgreSQL no necesita ese amortiguador.

## Consecuencias

- El comprobante que ve el votante es verdad garantizada: si lo ve, su voto está en la base;
  si no lo ve, no hay voto y puede reintentar. No existen estados intermedios.
- La regla de cierre es simple y auditable: vale la hora del servidor sellada en la transacción
  de confirmación, exactamente como pide el PRD.
- El SMTP queda completamente fuera de la ruta crítica: lentitud o caída del proveedor de correo
  no afecta la votación.
- **Costo real:** la latencia de la transacción está en la ruta del usuario — en el pico de la
  jornada, la tabla de votos y sus índices deben estar afinados para que el paso 3 responda en
  décimas de segundo, y el pool de conexiones del backend dimensionado para la concurrencia
  (ver ADR de infraestructura). Además, existe una ventana en la que el voto está registrado
  pero el correo aún no salió; el comprobante en pantalla y la bandeja interna (Design.md `3b`)
  cubren esa ventana.
