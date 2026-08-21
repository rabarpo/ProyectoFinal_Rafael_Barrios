# Delta for configuracion-institucional

## ADDED Requirements

### Requirement: Formulario de edición del singleton institucional

El sistema MUST proveer, en `Ruta 'configuracion'`, un formulario que consuma `GET /configuracion`
para precargar valores y `PUT /configuracion` para guardar, cubriendo `nombre`, `director`,
`color_primario`, `color_secundario`, `zona_horaria` y `dominios_google`. Los campos SMTP
(`smtp_host`, `smtp_puerto`, `smtp_remitente`) son escritura pura: `ConfiguracionRespuestaDto`
(verificado contra el backend real) NO los devuelve en el `GET`, así que el formulario los renderiza
vacíos y solo los envía en el `PUT` si el usuario los completó — no hay valor previo que precargar
ni forma de que la UI muestre o borre un SMTP ya guardado. El formulario MUST enviar únicamente los
campos modificados por el usuario (merge parcial), sin reenviar valores no tocados como si fueran
una actualización explícita salvo que el usuario los haya editado.

#### Scenario: Editar nombre y director sin tocar el resto

- GIVEN un director autenticado en `Ruta 'configuracion'` con el formulario precargado
- WHEN edita `nombre` y `director` y confirma
- THEN se invoca `PUT /configuracion` con esos dos campos
- AND el resto de campos existentes en el backend permanece sin cambios

#### Scenario: Guardado exitoso refleja los valores persistidos

- GIVEN un cambio válido enviado vía `PUT /configuracion`
- WHEN el backend responde 200 con la configuración actualizada
- THEN el formulario refleja los valores devueltos por el backend, no solo los enviados

#### Scenario: Error 4xx del backend se muestra legible sin perder los datos ingresados

- GIVEN un `color_primario` con formato inválido enviado por el usuario
- WHEN el backend rechaza la actualización con un error 4xx
- THEN la UI muestra el error de forma legible
- AND los valores ingresados por el usuario permanecen en el formulario, sin recargar

### Requirement: Sin campo de contraseña SMTP en el formulario

El sistema MUST NOT ofrecer ni sugerir ningún campo de contraseña SMTP en el formulario, porque
`ActualizarConfiguracionDto` nunca incluye ese campo — la contraseña proviene exclusivamente de
`SMTP_USER`/`SMTP_PASSWORD` en variables de entorno del backend.

#### Scenario: El formulario no renderiza ningún campo de contraseña SMTP

- GIVEN el formulario de configuración renderizado con la sección SMTP visible
- WHEN se inspeccionan sus campos
- THEN no existe ningún campo etiquetado como contraseña, clave o `password` para SMTP

### Requirement: Edición de `dominios_google` como arreglo, incluyendo vacío explícito

El sistema MUST permitir editar `dominios_google` como un arreglo de strings (alta y baja de
elementos), y MUST permitir guardar explícitamente un arreglo vacío (`[]`) como una acción
intencional distinta de no tocar el campo, dado que el backend trata `[]` como fail-closed válido
(ningún dominio permitido) y "campo ausente" como "no modificar".

#### Scenario: Agregar un dominio válido

- GIVEN el formulario con `dominios_google` inicialmente vacío en la UI
- WHEN el usuario agrega `colegio.edu.pe` y confirma
- THEN se invoca `PUT /configuracion` con `dominios_google: ["colegio.edu.pe"]`

#### Scenario: Quitar el último dominio y guardar arreglo vacío explícito

- GIVEN el formulario con `dominios_google = ["colegio.edu.pe"]` precargado
- WHEN el usuario quita ese dominio y confirma el guardado
- THEN se invoca `PUT /configuracion` con `dominios_google: []` explícito en el payload
- AND la UI comunica que ningún dominio queda permitido para login Google Workspace

#### Scenario: Dominio con formato inválido se rechaza antes o después del envío

- GIVEN el usuario intenta agregar `"no es un dominio"` a `dominios_google`
- WHEN confirma el guardado y el backend rechaza con un error 4xx
- THEN la UI muestra el error identificando `dominios_google` como campo inválido
- AND el arreglo previamente guardado no se pierde en la UI

### Requirement: Subida y reemplazo del logo institucional con validación cliente

El sistema MUST proveer, en la misma página, un control de subida de logo reutilizando
`CampoArchivo` (`apps/frontend/src/candidatos/piezas/CampoArchivo.tsx`) que invoque
`POST /configuracion/logo` vía `FormData`, y MUST validar del lado cliente el tipo MIME (PNG, JPG,
SVG) y el tamaño máximo (2 MB) antes de iniciar la subida, para dar feedback inmediato sin esperar
el rechazo del backend.

#### Scenario: Subir un logo válido reemplaza el existente

- GIVEN un administrador con un logo ya persistido
- WHEN selecciona un archivo PNG de 1 MB y confirma la subida
- THEN se invoca `POST /configuracion/logo` con ese archivo
- AND la vista previa del logo se actualiza con el nuevo archivo tras la respuesta 200

#### Scenario: Archivo que excede 2 MB se rechaza en el cliente sin llamar al backend

- GIVEN un archivo de 3 MB seleccionado para el logo
- WHEN el usuario intenta confirmar la subida
- THEN la UI rechaza el archivo con un mensaje legible antes de invocar `POST /configuracion/logo`

#### Scenario: Formato no permitido se rechaza en el cliente sin llamar al backend

- GIVEN un archivo `.pdf` seleccionado para el logo
- WHEN el usuario intenta confirmar la subida
- THEN la UI rechaza el archivo con un mensaje legible antes de invocar `POST /configuracion/logo`
- AND ningún request multipart se envía

### Requirement: Lista de comité solo lectura, sin acciones de edición

El sistema MUST mostrar, en la misma página, la lista de integrantes del comité obtenida vía
`GET /configuracion/comite`, en modo estrictamente solo lectura. El sistema MUST NOT ofrecer
ninguna acción de alta, edición, cambio de estado ni eliminación sobre esa lista desde esta
pantalla — esa capacidad pertenece al dominio de administración de usuarios.

#### Scenario: La lista de comité se renderiza sin controles de escritura

- GIVEN un director autenticado en `Ruta 'configuracion'`
- WHEN se renderiza la lista de comité obtenida de `GET /configuracion/comite`
- THEN no existe ningún botón o acción de "Crear", "Editar", "Cambiar estado" ni "Eliminar" sobre
  esa lista

#### Scenario: Lista de comité vacía no rompe la vista

- GIVEN ningún `Usuario` con `rol = 'comite'` registrado
- WHEN se renderiza la sección de comité
- THEN la UI muestra un estado vacío legible, sin error

### Requirement: Aislamiento del rol `comite` en el cliente

El sistema MUST ocultar el item de menú `configuracion` para una sesión con `rol === 'comite'`,
como defensa en profundidad — el backend ya rechaza `comite` en las tres rutas de
`ConfiguracionController` (`@Roles('administrador', 'director')` a nivel de clase), que no expone
ningún endpoint accesible a ese rol.

#### Scenario: Comité no ve el item de menú `configuracion`

- GIVEN una sesión con `rol = 'comite'`
- WHEN se renderiza el menú de navegación
- THEN el item `configuracion` no aparece

#### Scenario: Comité navegando directamente a `/configuracion` no ve la página

- GIVEN una sesión con `rol = 'comite'` que navega directamente a `Ruta 'configuracion'`
- WHEN el enrutador resuelve esa ruta
- THEN no se renderiza el formulario de configuración ni la lista de comité
