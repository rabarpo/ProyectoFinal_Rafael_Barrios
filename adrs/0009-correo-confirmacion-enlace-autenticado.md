# ADR 0009: Correo de confirmación con enlace autenticado al comprobante

## Estado

Aceptado

## Contexto

El PRD tomó la decisión de que la copia por correo "incluye la elección concreta realizada (no
solo un comprobante de voto emitido)", y registró el riesgo aceptado: existe un documento fuera
del sistema que vincula identidad con elección (reenviable, visible en bandejas compartidas,
posible vía de coacción o compra de voto). El propio PRD pide "mitigar en el diseño:
cifrar/proteger el contenido si es viable", y el Design.md dejó pendiente el mecanismo
(sección 6.4: ¿PDF con contraseña, enlace autenticado, texto plano?).

## Decisión

El correo de confirmación **no contiene la elección en su cuerpo**. Contiene: código de voto,
proceso, hora del servidor de la emisión, y un **enlace autenticado al comprobante completo**
dentro del sistema — la página del comprobante muestra la elección concreta realizada y exige
iniciar sesión con la cuenta del votante.

- El requisito del PRD ("la copia incluye la elección concreta") se cumple **a través del
  enlace**: el votante accede a su elección completa en cualquier momento; lo que se elimina es
  la copia legible sin autenticación.
- **Esta decisión matiza la redacción original del PRD** (que implicaba la elección visible en
  el propio correo). Se surfaceó y aceptó explícitamente durante el diseño técnico: reduce el
  riesgo de coacción/reenvío que el PRD registró, aplicando la mitigación que el propio PRD
  solicitó. Las bases del proceso electoral deben describir el mecanismo real (correo con
  enlace, elección visible tras autenticarse). Conviene actualizar la línea correspondiente del
  PRD para reflejarlo.
- El comprobante también es accesible sin el correo, desde "Mis votaciones" (etiqueta `VOTADO` →
  comprobante, Design.md `1d`), lo que cubre el caso borde del votante sin correo o con envío
  fallido.

## Alternativas consideradas

- **Texto plano en el correo** — cumple la redacción del PRD de la forma más literal y funciona
  sin conexión al sistema; no se eligió porque asume por completo el riesgo registrado: el
  correo reenviado o leído en una bandeja compartida (frecuente en cuentas de menores
  supervisadas) expone la elección, y es la vía directa de compra/coacción de voto.
- **PDF adjunto con contraseña** (p. ej. DNI) — protege ante bandejas compartidas; no se eligió
  porque la contraseña derivada de datos conocidos es adivinable por el entorno cercano (que es
  justamente el actor del riesgo de coacción), genera carga de soporte y añade generación de un
  PDF por cada voto en la ráfaga de la jornada.

## Consecuencias

- El riesgo de coacción y reenvío queda mitigado: interceptar el correo no revela la elección;
  verla exige las credenciales del votante.
- El correo se vuelve ligero y uniforme (sin adjuntos), lo que alivia la ráfaga SMTP de la
  jornada ([ADR-0006]).
- **Costo real:** ver la elección requiere sistema disponible y sesión activa — la "copia" deja
  de ser autónoma del sistema. Si la institución diera de baja la cuenta del votante o el
  sistema se apagara definitivamente, el enlace muere; el archivo histórico oficial son las
  actas y la auditoría, no los comprobantes individuales.
- **Costo residual asumido:** quien posee las credenciales del votante (riesgo de suplantación
  ya registrado en el PRD) puede ver también su comprobante; y la coacción presencial ("muéstrame
  tu pantalla") no es evitable por diseño — se documenta en las bases del proceso. Con el voto
  del padre desde la cuenta del estudiante ([ADR-0011]), padre y estudiante comparten cuenta
  **por diseño**: dentro de la familia los comprobantes son mutuamente visibles, y las bases
  deben declararlo de forma explícita.
