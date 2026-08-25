# Especificación: configuracion-institucional

## Purpose

Define la gestión (lectura/actualización) de la identidad institucional persistida en el
singleton `Configuracion` (`clave='institucional'`): nombre, logo, director, colores, zona
horaria y dominio(s) Google Workspace permitido(s); y la lectura de los integrantes del
comité. Capacidad nueva — no hay spec previa que modificar. Fuera de alcance: CRUD completo
(el singleton solo admite `GET`/`PUT`), alta/baja de `Usuario.rol='comite'`, storage externo
del logo (S3/MinIO), tabla `Institucion` separada.

## Requirements

### Requirement: Extensión aditiva del modelo `Configuracion`
El sistema MUST extender `Configuracion` mediante una migración de Prisma aditiva con las
columnas `nombre` (`String?`), `logo` (`Bytes?`), `logo_mime` (`String?`), `director`
(`String?`), `color_primario` (`String?`), `color_secundario` (`String?`), `zona_horaria`
(`String?`), `dominios_google` (`String[]`, default `[]`). Todas las columnas nuevas MUST ser
nullable o tener un default que no requiera valor en filas existentes.

#### Scenario: La fila semilla `clave='institucional'` sobrevive la migración
- GIVEN la fila `Configuracion` con `clave='institucional'` ya sembrada por `seed.ts`
- WHEN se aplica la migración aditiva de este change
- THEN la fila sigue existiendo con el mismo `id` y `clave`
- AND las columnas nuevas quedan en su valor nulo/default sin error de migración

#### Scenario: Re-ejecutar el seed no duplica ni rompe la fila
- GIVEN la migración ya aplicada y la fila `clave='institucional'` ya sembrada
- WHEN `seed.ts` se ejecuta nuevamente
- THEN sigue existiendo exactamente una fila con `clave='institucional'`
- AND ninguna columna existente (`smtp_host`, `smtp_puerto`, `smtp_remitente`) se sobrescribe con
  datos de marcador de posición si ya tenía valores reales

### Requirement: Lectura de la configuración institucional
El sistema MUST proveer `GET /configuracion`, protegido con `@UseGuards(AuthGuard, RolesGuard)`
y `@Roles('administrador', 'director')`, que devuelve la fila `clave='institucional'` completa
(incluyendo `dominios_google`, excluyendo cualquier secreto SMTP).

#### Scenario: Administrador consulta la configuración
- GIVEN un administrador autenticado
- WHEN invoca `GET /configuracion`
- THEN la respuesta incluye nombre, director, colores, zona horaria y `dominios_google`

#### Scenario: Rol no autorizado no accede a la configuración
- GIVEN una sesión válida con rol distinto de `administrador`/`director`
- WHEN se invoca `GET /configuracion`
- THEN la solicitud se rechaza sin ejecutar el handler

### Requirement: Actualización auditada de la configuración institucional
El sistema MUST proveer `PUT /configuracion` (o `PATCH`), protegido con `@Roles('administrador',
'director')`, que actualiza campos de la fila `clave='institucional'` dentro de una
`prisma.$transaction()` que registra un evento de auditoría vía `AuditoriaService.log(tx, ...)`
en la misma transacción, con énfasis en el detalle cuando cambia `dominios_google`.

#### Scenario: Actualización exitosa se audita
- GIVEN un director autenticado
- WHEN actualiza `nombre`, `color_primario` y `dominios_google` vía `PUT /configuracion`
- THEN los campos quedan persistidos
- AND existe un `EventoAuditoria` correspondiente a la operación

#### Scenario: Fallo de auditoría revierte la actualización
- GIVEN una actualización de configuración cuyo registro de auditoría falla dentro de la
  transacción
- WHEN la transacción hace rollback
- THEN ningún campo de `Configuracion` queda modificado

### Requirement: Validación de zona horaria IANA
El sistema MUST validar que `zona_horaria`, si se envía, sea un identificador IANA válido (por
ejemplo `America/Lima`) contra una lista/motor de zonas conocido, y MUST rechazar con un error
4xx legible cualquier valor que no lo sea.

#### Scenario: Zona horaria válida se acepta
- GIVEN `zona_horaria = "America/Lima"` en el body de `PUT /configuracion`
- WHEN se envía la actualización
- THEN el valor se persiste sin error

#### Scenario: Zona horaria inválida se rechaza
- GIVEN `zona_horaria = "No/Existe"` en el body de `PUT /configuracion`
- WHEN se envía la actualización
- THEN la solicitud se rechaza con un error 4xx legible
- AND ningún campo de `Configuracion` se modifica

### Requirement: Validación de formato hexadecimal de colores
El sistema MUST validar que `color_primario` y `color_secundario`, si se envían, cumplan el
formato hex (`#RRGGBB` o `#RGB`), y MUST rechazar con un error 4xx legible cualquier valor que no
lo cumpla.

#### Scenario: Color hex válido se acepta
- GIVEN `color_primario = "#1A2B3C"`
- WHEN se envía la actualización
- THEN el valor se persiste sin error

#### Scenario: Color con formato inválido se rechaza
- GIVEN `color_primario = "azul"`
- WHEN se envía la actualización
- THEN la solicitud se rechaza con un error 4xx legible

### Requirement: Validación de dominios Google Workspace permitidos
El sistema MUST validar cada elemento de `dominios_google` como un dominio con formato válido
(sin espacios, con al menos un punto) antes de persistir, y MUST rechazar con un error 4xx
legible el arreglo si contiene un elemento con formato inválido. Un arreglo vacío es un valor
válido y representa fail-closed: ningún dominio queda permitido para login Google Workspace
hasta que se configure al menos uno.

#### Scenario: Arreglo de dominios válido se acepta
- GIVEN `dominios_google = ["colegio.edu.pe"]`
- WHEN se envía la actualización
- THEN el valor se persiste sin error

#### Scenario: Elemento con formato inválido rechaza todo el arreglo
- GIVEN `dominios_google = ["colegio.edu.pe", "no es un dominio"]`
- WHEN se envía la actualización
- THEN la solicitud se rechaza con un error 4xx legible
- AND `dominios_google` no se modifica

#### Scenario: Arreglo vacío se acepta como fail-closed explícito
- GIVEN `dominios_google = []`
- WHEN se envía la actualización
- THEN el valor se persiste sin error
- AND ningún dominio queda permitido para login Google Workspace hasta nueva configuración

### Requirement: Subida de logo institucional
El sistema MUST aceptar la subida del logo vía `multipart/form-data` (`FileInterceptor`),
reutilizando el patrón de `importacion.controller.ts`: allowlist explícita de formato (PNG, JPG,
SVG) y límite de tamaño de **2 MB**, rechazando con `BadRequestException` antes de tocar la base
cualquier archivo que no cumpla formato o tamaño.

#### Scenario: Logo válido se acepta y persiste
- GIVEN un archivo PNG de 1 MB
- WHEN se envía como logo en `POST /configuracion/logo`
- THEN el binario se persiste en la columna `logo` junto con su `logo_mime`

#### Scenario: Logo que excede el tamaño máximo se rechaza
- GIVEN un archivo de 3 MB
- WHEN se envía como logo en `POST /configuracion/logo`
- THEN la solicitud se rechaza con un error 4xx legible antes de persistir cualquier campo

#### Scenario: Formato de logo no permitido se rechaza
- GIVEN un archivo `.pdf`
- WHEN se envía como logo en `POST /configuracion/logo`
- THEN la solicitud se rechaza con un error 4xx legible

### Requirement: Listado de integrantes del comité
El sistema MUST proveer un endpoint de solo lectura, protegido con `@Roles('administrador',
'director')`, que liste `Usuario` con `rol='comite'`, reutilizando el DTO de listado de usuarios
ya existente (sin tabla nueva ni endpoint de alta/baja de rol).

#### Scenario: Listado devuelve solo usuarios con rol comité
- GIVEN usuarios con roles mixtos, algunos `rol='comite'`
- WHEN un director invoca el endpoint de listado de comité
- THEN la respuesta contiene únicamente los usuarios con `rol='comite'`

#### Scenario: Rol no autorizado no accede al listado
- GIVEN una sesión válida con rol distinto de `administrador`/`director`
- WHEN se invoca el endpoint de listado de comité
- THEN la solicitud se rechaza sin ejecutar el handler

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

### Requirement: `GET /configuracion/logo` accesible a cualquier usuario autenticado

El sistema MUST relajar únicamente el método `GET /configuracion/logo` de modo que cualquier
usuario autenticado — incluidos votantes con rol `estudiante`/`padre` — pueda obtener el logo
institucional para el Paso 1 del flujo de votación. El sistema MUST NOT relajar ningún otro
método de `ConfiguracionController`, que MUST mantener `@Roles('administrador', 'director')` sin
cambios.

Mecanismo (`Design.md` D4): `RolesGuard` (`apps/backend/src/auth/roles.guard.ts`) resuelve los
roles requeridos con `reflector.getAllAndOverride(ROLES_KEY, [handler, class])`, que devuelve el
primer valor no-`undefined` — un método sin `@Roles` propio HEREDA el `@Roles` de la clase, y
`@UseGuards` a nivel de método es aditivo (no reemplaza el guard de la clase). Por eso la
relajación NO se logra agregando `@UseGuards(AuthGuard)` al método: eso sería un no-op silencioso.
El sistema MUST anotar `obtenerLogo()` con un decorador nuevo `SinRestriccionDeRol()`
(`SetMetadata(ROLES_KEY, [])`) que entra por la rama ya existente de `RolesGuard` para
`rolesRequeridos.length === 0` (deja pasar a cualquier rol autenticado).

#### Scenario: Un votante (rol `estudiante`) obtiene el logo institucional
- GIVEN un usuario autenticado con `rol = 'estudiante'` y un logo institucional persistido
- WHEN invoca `GET /configuracion/logo`
- THEN responde `200` con el binario del logo, igual que para `administrador`/`director`

#### Scenario: Un votante (rol `padre`) obtiene el logo institucional
- GIVEN un usuario autenticado con `rol = 'padre'` y un logo institucional persistido
- WHEN invoca `GET /configuracion/logo`
- THEN responde `200` con el binario del logo

#### Scenario: El resto de `ConfiguracionController` sigue restringido a administrador/director
- GIVEN un usuario autenticado con `rol = 'estudiante'` (o `'padre'`, o `'comite'`)
- WHEN invoca `GET /configuracion`, `PUT /configuracion`, `POST /configuracion/logo`, o el
  listado de comité
- THEN cada uno de esos endpoints rechaza la petición sin ejecutar el handler, igual que antes de
  este change

#### Scenario: Petición sin sesión válida sigue siendo rechazada
- GIVEN una petición a `GET /configuracion/logo` sin sesión autenticada
- WHEN se invoca el endpoint
- THEN responde con rechazo de autenticación, sin exponer el binario del logo
