# ADR 0005: Estado en el servidor y actualización por polling con React Query

## Estado

Aceptado

## Contexto

El PRD pide "resultados en tiempo real" (barras, pastel, participación, abstenciones) con opción
de ocultarlos hasta el cierre, y el Design.md describe el panel de jornada (`1e`) con votos por
hora, avance por aula y correos fallidos, el modo proyección (`3a`), y cuentas regresivas que
siempre muestran la **hora del servidor** — nunca la del dispositivo.

La audiencia de estas vistas es pequeña (comité electoral y, en su caso, una pantalla de
proyección); los ~1,000 votantes concurrentes solo ejecutan el flujo de 3 pasos, que no necesita
push. Hay que decidir dónde vive el estado y cómo se refrescan las vistas.

## Decisión

- **Toda la verdad vive en el servidor** (PostgreSQL, [ADR-0003]). El frontend no mantiene
  estado de negocio propio: solo estado de UI (paso actual de la boleta, selección aún no
  confirmada) y caché de lecturas.
- **TanStack Query (React Query)** gestiona el estado del servidor en el frontend: caché,
  reintentos y revalidación.
- **Polling** para las vistas vivas: resultados, panel de jornada y modo proyección se
  refrescan consultando sus endpoints cada 10–30 segundos (intervalo configurable por vista).
  A escala de una jornada escolar, esa frescura cumple el "tiempo real" del PRD.
- **La hora del servidor viaja en cada respuesta** de estos endpoints; las cuentas regresivas se
  calculan contra ella corrigiendo el desfase local, y la validez del voto se decide siempre en
  el backend contra el reloj del servidor (el cliente solo muestra).
- La visibilidad de resultados ("ocultos hasta el cierre") se evalúa **en el servidor**: si
  están ocultos, el endpoint devuelve solo participación, nunca conteos por candidato — ocultar
  en el cliente sería trivial de eludir.

## Alternativas consideradas

- **Server-Sent Events (SSE)** — push unidireccional con frescura de segundos; no se eligió
  porque obliga a gestionar conexiones persistentes (reconexión, proxies, límites) para un
  beneficio marginal con tan pocos espectadores.
- **WebSockets (Socket.IO)** — canal bidireccional empujando cada voto al instante; no se eligió
  porque es la opción con más piezas (gateway WS, estado de conexiones, escalado) y la
  bidireccionalidad no se necesita: el panel solo lee.

## Consecuencias

- Cero infraestructura adicional para tiempo real: los endpoints de lectura existentes bastan, y
  funcionan a través de cualquier proxy u hosting.
- El polling de N espectadores × cada 10–30 s es carga trivial; las consultas de agregados deben
  estar indexadas o pre-agregadas para no competir con la escritura de votos en el pico.
- **En la publicación de resultados al cierre la audiencia deja de ser pequeña:** los ~1,000
  votantes con la app abierta consultan el mismo endpoint de resultados. Los agregados llevan
  caché corta en el servidor (5–10 s) para que esa ráfaga cueste una consulta a la base, no mil.
- **Costo real:** la frescura máxima es el intervalo de polling — el panel puede mostrar datos
  con hasta ~30 s de atraso, y el "votos por hora" nunca será al instante. Si en el futuro se
  quisiera proyección voto-a-voto, habría que introducir SSE entonces.
- Regla de diseño derivada: ninguna decisión de negocio (proceso abierto/cerrado, resultados
  visibles/ocultos, derecho al voto) se evalúa en el cliente; el frontend solo refleja lo que el
  servidor responde.
