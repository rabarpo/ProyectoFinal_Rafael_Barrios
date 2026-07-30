# ADR 0011: El padre vota con la cuenta del estudiante que representa

## Estado

Aceptado

## Contexto

La revisión adversarial (hallazgo C2) detectó una contradicción sin declarar: el PRD registra
como confirmado que "los padres votan **usando la cuenta del estudiante** que representan (un
voto por estudiante)", pero el modelo de datos del TDD (entidad `Representación`, rol `padre` en
`Usuario`) y el flujo estrella del Design.md — banda "Votando por ▢ · 3° A" y salto "votar por
mi otro hijo (N pendiente)" — asumían que el padre tiene cuenta propia desde la que encadena los
votos de sus hijos. Había que elegir una de las dos interpretaciones y corregir la otra.

## Decisión

Se **ratifica el PRD literal**: el padre vota con la cuenta del estudiante que representa. El
modelo y las pantallas se corrigen en consecuencia:

- **Los padres no tienen cuenta de acceso propia.** La entidad `Representación` se elimina; en
  su lugar, `Apoderado` guarda los datos del padre o apoderado (nombres, DNI, correo de
  contacto) como información vinculada al estudiante, sin credenciales.
- **`DerechoVoto` gana el atributo `en_calidad_de`** (estudiante / padre / docente). En procesos
  de padres (APAFA, comité de aula), el derecho se asigna a la cuenta del estudiante con calidad
  `padre`. En consultas dirigidas a toda la comunidad, una misma cuenta de estudiante porta
  **dos derechos** — el propio y el de su padre — y la interfaz los presenta por separado.
- **La banda fija declara la calidad, no el hijo:** "Votando como padre/apoderado de ▢ · 3° A".
  Se retiran la vista de selección de estudiante representado (Design.md `1d`) y el salto
  "votar por mi otro hijo" (el tweak `contextoPadre` del prototipo queda obsoleto): un padre con
  N hijos inicia sesión en la cuenta de cada uno.
- La copia del voto por correo ([ADR-0009]) va al correo institucional del estudiante, único
  correo de la cuenta.

## Alternativas consideradas

- **Cuenta propia del padre** (lo que el diseño asumía implícitamente) — separa identidades,
  habilita el flujo multi-hijo sin cambiar de sesión y da al padre su propio correo de
  confirmación; no se eligió por decisión de producto: mantiene el supuesto confirmado del PRD y
  evita crear, distribuir y custodiar credenciales para cientos de padres (alta de usuarios,
  recuperaciones, soporte) en una plataforma que usan una o dos veces al año.

## Consecuencias

- El padrón y la administración de usuarios se simplifican: una cuenta por estudiante cubre a la
  familia; no hay ciclo de vida de cuentas de padres.
- **Costo real — indistinguibilidad estructural:** el sistema no puede saber si votó el padre o
  el estudiante con esa cuenta. El PRD ya lo registraba como riesgo aceptado; esta decisión lo
  vuelve estructural: en consultas donde ambos votan, la separación de los dos derechos depende
  íntegramente de la conducta de la familia.
- **Costo real — comprobantes compartidos por diseño:** el enlace autenticado del [ADR-0009] no
  protege nada dentro de la familia — padre y estudiante ven los comprobantes (con elección) del
  otro, porque comparten la cuenta. Las bases del proceso deben declararlo explícitamente.
- Un padre con N hijos realiza N inicios de sesión (fricción asumida); el bloqueo por intentos
  fallidos ([ADR-0008]) afecta simultáneamente al estudiante y a su padre — el desbloqueo por
  doble vía cubre el caso.
- El Design.md debe actualizarse: banda de calidad en lugar de banda de hijo, sin selección de
  estudiante ni salto multi-hijo, y "Mis votaciones" mostrando por separado los derechos de una
  consulta a toda la comunidad.
