# ADR 0008: Reglas operativas de la jornada — visibilidad, voto en blanco y desbloqueo

## Estado

Aceptado

## Contexto

El Design.md (sección 6) dejó explícitamente pendientes tres reglas de política electoral que
condicionan el modelo de datos, las pantallas del comité y los criterios de aceptación:

1. ¿Puede el comité cambiar la visibilidad de resultados con la votación ya abierta?
2. ¿Cómo se produce el voto nulo en una boleta digital? (el PRD lo reporta en resultados, pero
   no define cómo se origina)
3. ¿Cómo se desbloquea una cuenta bloqueada por intentos fallidos durante la jornada, sin privar
   al votante de su derecho?

## Decisión

1. **Visibilidad de resultados bloqueada al abrir el proceso.** La configuración "ocultar
   resultados hasta el cierre" (activa por defecto, como recomienda el PRD) se congela junto con
   el padrón en el momento de apertura. Durante la jornada nadie — ni el comité — puede
   cambiarla; se vuelve editable solo en procesos aún no abiertos.
2. **No existe voto nulo; solo voto en blanco explícito.** En una boleta digital no hay marcas
   inválidas posibles: la boleta ofrece candidatos/opciones más la opción "voto en blanco"
   (ya presente en la alta fidelidad del Design.md). Los reportes y actas muestran la columna de
   nulos siempre en 0, con nota explicativa en el acta de escrutinio para mantener el formato
   que el PRD exige (votos + blancos + nulos + abstenciones = padrón).
3. **Desbloqueo por doble vía.** El bloqueo por intentos fallidos expira automáticamente a los
   10–15 minutos, y además el comité puede desbloquear manualmente desde su panel (acción
   "desbloquear" del wireframe `3d`), quedando el desbloqueo registrado como evento de
   auditoría con el usuario del comité que lo ejecutó.

## Alternativas consideradas

- **Visibilidad modificable con auditoría** — más flexible ante imprevistos; no se eligió porque
  abre la puerta a revelar parciales estratégicamente a mitad de jornada, influyendo en quienes
  aún no votan. También se descartó la variante "solo ocultar, nunca revelar", más segura que la
  libre pero menos simple que el bloqueo total.
- **Opción explícita de voto nulo en la boleta** — replicaría la semántica de la papeleta física
  (nulo = rechazo activo); no se eligió porque añade una opción más que explicar a votantes
  escolares sin aportar información que el blanco no capture ya.
- **Solo expiración automática** (sin desbloqueo manual) y **solo desbloqueo manual** (sin
  expiración) — descartadas porque la primera deja sin ayuda inmediata a un votante con
  problemas reales y la segunda convierte al comité en cuello de botella; la doble vía cubre
  ambos fallos.

## Consecuencias

- Las tres reglas son simples de auditar: la visibilidad es un atributo congelado en la
  apertura, el blanco es una opción más de la boleta, y cada desbloqueo tiene autor y hora.
- El modelo de datos las recoge así: la configuración de visibilidad vive en el proceso y se
  copia al snapshot de apertura; "blanco" se registra como voto con elección especial (no como
  ausencia de registro); el bloqueo es un estado del usuario con vencimiento.
- **Costo real:** la visibilidad bloqueada no admite excepciones — si el comité configura mal un
  proceso y lo abre, no puede corregirlo sin cerrar y crear un proceso nuevo (los votos emitidos
  no se migran). Es el precio de la regla auditable; la pantalla de apertura debe mostrar la
  configuración de visibilidad de forma prominente antes de confirmar.
- La columna "nulos = 0" en actas puede requerir explicación ante autoridades acostumbradas al
  formato físico; la nota del acta cubre esto.
