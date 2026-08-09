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
transacción por fila. El sistema MUST NOT crear filas duplicadas al reimportar el mismo archivo.

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
