# Delta para importacion-excel

## ADDED Requirements

### Requirement: Pantalla única de importación de padrón

El sistema MUST exponer una pantalla accesible solo para `administrador` y `director` que
concentre en una sola vista: la selección del archivo, el envío, el resultado y la descarga del
CSV de errores. El sistema MUST enviar el archivo mediante un único `POST /importaciones/padron`
(`multipart/form-data`, campo `archivo`) de forma síncrona, mostrando un indicador de progreso
mientras el request está en vuelo y sin polling ni estados asíncronos. El sistema MUST NOT
requerir recarga ni navegación para completar el flujo.

#### Scenario: Envío síncrono con indicador de progreso
- GIVEN un `administrador` o `director` en la pantalla con un archivo seleccionado
- WHEN confirma el envío
- THEN el cliente hace un único `POST /importaciones/padron` con el archivo en el campo `archivo`
- AND muestra un indicador de progreso hasta recibir la respuesta

#### Scenario: Rol no autorizado no alcanza la pantalla
- GIVEN una sesión con un rol distinto de `administrador`/`director`
- WHEN intenta abrir la ruta de importación
- THEN la pantalla no se renderiza para ese rol

### Requirement: Validación de tipo y tamaño en cliente como feedback

El sistema MUST validar en el cliente, antes de enviar, que el archivo tenga extensión `.xlsx` o
`.csv` (nunca `.xlsm`) y no supere 5 MB, y MUST mostrar un mensaje inmediato cuando no se cumpla,
bloqueando el envío. Esta validación MUST tratarse solo como feedback de UX: el allowlist del
backend (`filtroArchivoPadron`, `TAMANIO_MAXIMO_BYTES`) sigue siendo la fuente de verdad, y el
sistema MUST mostrar de forma legible cualquier rechazo `400` del backend
(`EXTENSION_NO_PERMITIDA`, `ARCHIVO_REQUERIDO`, `CABECERA_INVALIDA`, `LIMITE_FILAS_EXCEDIDO` de
`IMPORTACION_ERROR_CODES`).

#### Scenario: Archivo con extensión no permitida
- GIVEN el usuario selecciona un archivo `.xlsm`
- WHEN el cliente evalúa la selección
- THEN muestra un mensaje inmediato de tipo no permitido
- AND no realiza el `POST`

#### Scenario: Archivo que supera 5 MB
- GIVEN el usuario selecciona un archivo de más de 5 MB
- WHEN el cliente evalúa la selección
- THEN muestra un mensaje inmediato de tamaño excedido y no realiza el `POST`

#### Scenario: Rechazo del backend pese a pasar la validación de cliente
- GIVEN un archivo que pasa la validación de cliente pero el backend responde `400` con un
  `codigo` de `IMPORTACION_ERROR_CODES`
- WHEN el cliente recibe la respuesta
- THEN muestra ese motivo de forma legible sin romper la pantalla

### Requirement: Presentación del resultado de importación

El sistema MUST renderizar, a partir del `ResultadoImportacionDto` devuelto, los cuatro
contadores `filas_totales`, `filas_creadas`, `filas_existentes` y `filas_invalidas`. Cuando
`errores` no está vacío, el sistema MUST mostrar una lista o tabla simple con una entrada por
elemento de `ErrorFilaDto`, exponiendo `fila`, `campo`, `motivo` y `valor_recibido`. El sistema
MUST NOT paginar ni virtualizar esa lista. El resultado MUST permanecer visible tras la
importación hasta que el usuario inicie un nuevo envío.

#### Scenario: Importación con filas válidas e inválidas
- GIVEN un `POST /importaciones/padron` que responde con `filas_invalidas > 0` y `errores`
  poblado
- WHEN el cliente renderiza el resultado
- THEN muestra los cuatro contadores
- AND una fila por cada `ErrorFilaDto` con `fila`, `campo`, `motivo` y `valor_recibido`

#### Scenario: Importación sin errores
- GIVEN una respuesta con `filas_invalidas` igual a `0` y `errores` vacío
- WHEN el cliente renderiza el resultado
- THEN muestra los contadores y no muestra ninguna lista de errores

### Requirement: Descarga del CSV de errores con manejo de reporte vencido

El sistema MUST ofrecer un control de descarga que invoque `GET /importaciones/:id/errores.csv`
usando el `importacion_id` del `ResultadoImportacionDto`, únicamente cuando `filas_invalidas > 0`.
Cuando la respuesta sea `404` (`REPORTE_NO_ENCONTRADO`, TTL de 24 h vencido), el sistema MUST
mostrar un mensaje legible indicando que el reporte expiró, sin romper la pantalla ni perder el
resultado ya visible.

#### Scenario: Descarga disponible con filas inválidas
- GIVEN un resultado con `filas_invalidas > 0` e `importacion_id` presente
- WHEN el usuario activa la descarga
- THEN el cliente solicita `GET /importaciones/:importacion_id/errores.csv` y entrega el archivo

#### Scenario: Sin control de descarga cuando no hay errores
- GIVEN un resultado con `filas_invalidas` igual a `0`
- WHEN el cliente renderiza el resultado
- THEN no se muestra ningún control de descarga de CSV

#### Scenario: Reporte de errores expirado
- GIVEN un resultado previo cuyo CSV ya no está disponible en Redis
- WHEN el usuario activa la descarga y el backend responde `404`
- THEN el cliente muestra un mensaje de reporte vencido y conserva el resultado visible

### Requirement: Reintento con archivo corregido sin recargar

Tras una importación, el sistema MUST mantener disponible el selector de archivo para que el
usuario elija un archivo corregido y ejecute un nuevo `POST /importaciones/padron` sin recargar
la página ni navegar. El sistema MUST reemplazar el resultado anterior por el nuevo al completar
el reenvío. El sistema MUST NOT persistir el resultado entre recargas del navegador.

#### Scenario: Segundo envío reemplaza el resultado
- GIVEN una importación ya mostrada en pantalla
- WHEN el usuario selecciona un archivo corregido y vuelve a enviar
- THEN el cliente ejecuta un nuevo `POST /importaciones/padron` sin recarga ni navegación
- AND el resultado mostrado pasa a ser el de la nueva respuesta

#### Scenario: Recargar la página reinicia la pantalla
- GIVEN un resultado de importación visible
- WHEN el usuario recarga el navegador
- THEN la pantalla vuelve al estado inicial sin resultado previo
