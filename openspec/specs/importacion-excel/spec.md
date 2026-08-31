# Especificación: importacion-excel

## Purpose

Define la importación masiva de padrón (`Usuario` + `Matrícula`) desde un único archivo
Excel/CSV, en un solo request HTTP síncrono, sin abortar el archivo completo ante filas
inválidas (Flujo 6 de TECH-DESIGN.md, Backlog `#9`). Reutiliza `UsersService.crearIdempotente()`
(`#7`) y el nuevo `MatriculasService.crearIdempotente()` (delta de `student-enrollment`).
Capacidad nueva — no hay spec previa que modificar. Fuera de alcance: procesamiento asíncrono vía
worker, plantilla descargable vacía, importación de `Apoderado`, reintentos parciales.

## Requirements

### Requirement: Subida de archivo de padrón con formato de columnas fijo
El sistema MUST proveer `POST /importaciones/padron`, protegido con `@Roles('administrador',
'director')`, que recibe un único archivo `.xlsx` o `.csv` vía `multipart/form-data` con la
cabecera fija `nombres, dni, codigo, correo, grado_nombre, seccion_nombre, turno,
anio_escolar_codigo`. `Aula` no tiene un campo de código propio en el esquema, así que el `Aula`
de cada fila se identifica por la clave compuesta `(grado_nombre, seccion_nombre, turno,
anio_escolar_codigo)`, no por un identificador único directo. El sistema MUST rechazar, antes de
procesar cualquier fila, un archivo cuya cabecera no coincida con ese formato, y MUST rechazar un
archivo cuyo número de filas de datos exceda **2000**, ambos con un error 4xx legible.

#### Scenario: Subida exitosa con cabecera válida
- GIVEN un administrador autenticado y un archivo `.xlsx` con la cabecera esperada y filas válidas
- WHEN invoca `POST /importaciones/padron`
- THEN la respuesta contiene el resultado del procesamiento fila a fila

#### Scenario: Cabecera de columnas incorrecta se rechaza sin procesar filas
- GIVEN un archivo cuya primera fila no coincide con la cabecera fija esperada
- WHEN se invoca `POST /importaciones/padron`
- THEN la respuesta es un error 4xx legible y ninguna fila se procesa

#### Scenario: Archivo que excede el límite de filas se rechaza
- GIVEN un archivo con más de 2000 filas de datos
- WHEN se invoca `POST /importaciones/padron`
- THEN la respuesta es un error 4xx legible y ninguna fila se procesa

### Requirement: Procesamiento fila a fila sin abortar el archivo ante filas inválidas
El sistema MUST validar y persistir cada fila de forma independiente: un error en una fila MUST
NOT impedir el procesamiento de las filas restantes. El sistema MUST reportar, por cada fila
inválida, su número de fila, el campo afectado y el motivo (entre otros: `fila_vacia`, `formato`,
`campo_duplicado`, `referencia_inexistente`), y MUST devolver en la respuesta el conteo de filas
válidas e inválidas.

#### Scenario: Archivo con filas válidas e inválidas mezcladas
- GIVEN un archivo con algunas filas válidas y otras con datos inválidos
- WHEN se invoca `POST /importaciones/padron`
- THEN todas las filas válidas se importan
- AND cada fila inválida aparece en el reporte con su número de fila y motivo
- AND las filas válidas posteriores a una fila inválida también se procesan

#### Scenario: Fila vacía se reporta sin abortar el archivo
- GIVEN un archivo con una fila completamente vacía entre filas válidas
- WHEN se invoca `POST /importaciones/padron`
- THEN esa fila se reporta con motivo `fila_vacia`
- AND las demás filas válidas se importan igual

#### Scenario: Correo con formato inválido en una fila se reporta
- GIVEN una fila cuyo valor de `correo` no tiene forma de correo electrónico
- WHEN se procesa el archivo
- THEN esa fila se reporta con `campo = 'correo'` y `motivo = 'formato'`
- AND no se crea ningún `Usuario` ni `Matrícula` para esa fila

#### Scenario: Clave compuesta de Aula que no resuelve a ningún Aula existente se reporta
- GIVEN una fila cuya combinación `(grado_nombre, seccion_nombre, turno, anio_escolar_codigo)` no
  coincide con ningún `Aula` existente
- WHEN se procesa el archivo
- THEN esa fila se reporta con `campo = 'aula'` y `motivo = 'referencia_inexistente'`
- AND no se crea ninguna `Matrícula` para esa fila (el `Usuario`, si es válido, sí se crea)

### Requirement: Idempotencia por fila reutilizando los servicios existentes
El sistema MUST invocar, para cada fila válida, `UsersService.crearIdempotente()` para la parte
`Usuario` y `MatriculasService.crearIdempotente()` para la parte `Matrícula`, dentro de una misma
transacción por fila, de modo que cualquier fallo de la parte `Matrícula` (rol de `Usuario`
inválido, incoherencia jerárquica entre `Aula` y `AnioEscolar`, u otro motivo distinto de
referencia de `Aula`/`AnioEscolar` inexistente) revierta también la parte `Usuario` recién creada
en esa misma fila. La ÚNICA excepción a esta atomicidad es la contemplada explícitamente en el
escenario "Clave compuesta de Aula que no resuelve a ningún Aula existente se reporta": cuando la
clave compuesta `(grado_nombre, seccion_nombre, turno, anio_escolar_codigo)` no resuelve a ningún
`Aula`/`AnioEscolar` existente, el sistema MUST resolver esa referencia antes de abrir la
transacción compartida y, si no resuelve, MUST crear el `Usuario` de todas formas (fuera de esa
transacción) y reportar la fila como inválida sin `Matrícula`. El sistema MUST NOT crear filas
duplicadas al reimportar el mismo archivo.

#### Scenario: Reimportar el mismo archivo no duplica datos
- GIVEN un archivo ya importado exitosamente
- WHEN se invoca `POST /importaciones/padron` nuevamente con el mismo archivo
- THEN ningún `Usuario` ni `Matrícula` se duplica
- AND la respuesta refleja las filas como ya existentes, no como error

### Requirement: Reporte de errores descargable en CSV
El sistema MUST proveer un mecanismo de descarga del reporte de errores de una importación en
formato CSV con las columnas `fila, campo, motivo, valor_recibido`, protegido con
`@Roles('administrador', 'director')`.

#### Scenario: Descarga del CSV de errores tras una importación con filas inválidas
- GIVEN una importación ya procesada con al menos una fila inválida
- WHEN un director descarga el reporte de errores
- THEN el archivo CSV contiene una fila por cada error con `fila, campo, motivo, valor_recibido`

### Requirement: Auditoría agregada por operación de importación
El sistema MUST registrar, al finalizar el procesamiento de cada archivo, exactamente un evento de
auditoría por importación (no uno por fila) vía `AuditoriaService.log(tx, ...)`, con el conteo de
filas válidas e inválidas. El sistema MUST agregar únicamente claves nuevas y aditivas a
`AUDIT_EVENT_TYPES`, sin modificar la cláusula `WHEN` del trigger estructural de ADR-0016.

#### Scenario: Importación registra un único evento agregado
- GIVEN un archivo con filas válidas e inválidas mezcladas
- WHEN termina el procesamiento de `POST /importaciones/padron`
- THEN existe exactamente una fila `EventoAuditoría` para esa importación
- AND su detalle incluye el conteo de filas válidas e inválidas

### Requirement: Restricción de rol a administrador/director
El sistema MUST rechazar toda solicitud sobre `/importaciones/padron` y sobre la descarga del
reporte de errores de un usuario cuyo rol no sea `administrador` ni `director`, verificado por
`RolesGuard`, tratando ambos roles como equivalentes.

#### Scenario: Rol no autorizado no accede a la importación
- GIVEN una sesión válida con un rol distinto de `administrador`/`director`
- WHEN se invoca `POST /importaciones/padron` o la descarga del reporte de errores
- THEN la solicitud se rechaza sin ejecutar el handler

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
