# Especificación: administracion-usuarios-apoderados

## Purpose

Define el `UsersModule`: CRUD administrativo de `Usuario` sobre los cinco roles del sistema
(`estudiante`, `docente`, `comite`, `administrador`, `director`) y CRUD del sub-recurso `Apoderado`
anidado bajo un `Usuario` con `rol = estudiante`, conforme a ADR-0011 (el apoderado es información
de contacto vinculada al estudiante, sin cuenta de acceso propia). Reutiliza `AuthGuard`/
`RolesGuard`/`@Roles()` de `auth-server-sessions` y `AuditoriaService.log(tx, ...)` de
`append-only-audit-engine`. Capacidad nueva — no hay spec previa que modificar. Fuera de alcance:
importación masiva por Excel (#9), estructura académica (#8), la transición hacia/desde
`bloqueado` (territorio exclusivo de `bloqueo-desbloqueo-cuentas`), autoservicio de perfil, y
cualquier UI de frontend.

## Requirements

### Requirement: Creación de `Usuario` para cualquiera de los cinco roles
El sistema MUST proveer un endpoint `POST /usuarios` protegido con `@Roles('administrador',
'director')` que crea un `Usuario` con `rol` en (`estudiante`, `docente`, `comite`,
`administrador`, `director`), recibiendo nombres, DNI, código, correo y rol. El sistema MUST fijar
`password_hash = null` en toda creación manual. El sistema MUST registrar `USUARIO_CREADO` vía
`AuditoriaService.log(tx, ...)` dentro de la misma transacción que el `insert`.

#### Scenario: Creación exitosa con datos válidos
- GIVEN un administrador autenticado y datos de alta válidos con `rol = 'docente'`
- WHEN invoca `POST /usuarios`
- THEN se crea el `Usuario` con `password_hash = null` y `estado = 'activo'`
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'USUARIO_CREADO'`

#### Scenario: Un rol distinto de administrador/director no puede crear usuarios
- GIVEN una sesión válida cuyo rol es `comite`
- WHEN se invoca `POST /usuarios`
- THEN la solicitud se rechaza sin ejecutar el handler y sin crear ninguna fila

### Requirement: Validación de unicidad legible en creación y edición
El sistema MUST validar, antes de tocar la base de datos, la unicidad de DNI, código y correo
contra los valores ya existentes en `Usuario`, y MUST devolver un error de aplicación legible
(4xx con detalle del campo en conflicto) en vez de propagar la violación `500` del constraint
`@unique` del esquema.

#### Scenario: DNI duplicado se rechaza con error legible
- GIVEN un `Usuario` existente con `dni = '12345678'`
- WHEN se invoca `POST /usuarios` con el mismo `dni`
- THEN la respuesta es un error 4xx que identifica `dni` como campo en conflicto
- AND ningún `Usuario` nuevo se crea

#### Scenario: Correo duplicado se rechaza con error legible
- GIVEN un `Usuario` existente con un correo dado
- WHEN se invoca `POST /usuarios` o `PATCH /usuarios/:id` con ese mismo correo para otro `Usuario`
- THEN la respuesta es un error 4xx que identifica `correo` como campo en conflicto

### Requirement: DNI como texto libre sin validación de formato
El sistema MUST aceptar `dni` como cadena de texto libre de hasta 20 caracteres, sin exigir
formato ni longitud fija, en creación y edición.

#### Scenario: DNI con formato no numérico es aceptado
- GIVEN un administrador autenticado
- WHEN invoca `POST /usuarios` con `dni = 'AB-1234-XY'` (10 caracteres, no numérico)
- THEN el `Usuario` se crea sin error de formato de `dni`

#### Scenario: DNI que excede el máximo se rechaza
- GIVEN un administrador autenticado
- WHEN invoca `POST /usuarios` con un `dni` de 21 caracteres
- THEN la respuesta es un error 4xx por longitud máxima excedida
- AND ningún `Usuario` se crea

### Requirement: Correo sin exigencia de dominio institucional en creación manual
El sistema MUST validar únicamente el formato de correo electrónico y su unicidad al crear o
editar un `Usuario` por este CRUD. El sistema MUST NOT exigir que el correo pertenezca al dominio
institucional configurado en la creación manual; esa exigencia aplica solo al login por Google
OAuth, no a este módulo.

#### Scenario: Correo fuera del dominio institucional es aceptado
- GIVEN un administrador autenticado
- WHEN invoca `POST /usuarios` con un correo de formato válido fuera del dominio institucional
  configurado
- THEN el `Usuario` se crea sin error de dominio

#### Scenario: Correo con formato inválido se rechaza
- GIVEN un administrador autenticado
- WHEN invoca `POST /usuarios` con un valor que no tiene forma de correo electrónico
- THEN la respuesta es un error 4xx por formato inválido
- AND ningún `Usuario` se crea

### Requirement: Consulta y listado de `Usuario`
El sistema MUST proveer `GET /usuarios/:id`, protegido con `@Roles('administrador', 'director')`,
que devuelve un `Usuario` por id. El sistema MUST proveer `GET /usuarios`, con la misma
protección, que lista usuarios con filtro opcional por `rol` y por `estado`.

#### Scenario: Consulta por id exitosa
- GIVEN un `Usuario` existente y un director autenticado
- WHEN invoca `GET /usuarios/:id` con ese id
- THEN la respuesta contiene los datos de ese `Usuario`

#### Scenario: Listado filtrado por rol y estado
- GIVEN varios `Usuario` con distintos roles y estados
- WHEN un administrador invoca `GET /usuarios?rol=docente&estado=activo`
- THEN la respuesta contiene únicamente los usuarios con `rol = 'docente'` y `estado = 'activo'`

#### Scenario: Un rol distinto de administrador/director no puede consultar ni listar
- GIVEN una sesión válida cuyo rol no es `administrador` ni `director`
- WHEN se invoca `GET /usuarios` o `GET /usuarios/:id`
- THEN la solicitud se rechaza sin ejecutar el handler

### Requirement: Actualización de datos básicos sin borrado físico ni transición hacia/desde `bloqueado`
El sistema MUST proveer `PATCH /usuarios/:id`, protegido con `@Roles('administrador', 'director')`,
que actualiza nombres, DNI, código, correo y rol. El sistema MUST NOT exponer ningún endpoint que
ejecute `DELETE` físico sobre `Usuario`. El sistema MUST tratar el cambio de `estado` como una
operación propia, no un campo libre de `PATCH` genérico, y MUST rechazar cualquier intento de
transición hacia o desde `bloqueado` a través de este módulo. El sistema MUST registrar
`USUARIO_ACTUALIZADO` vía `AuditoriaService.log(tx, ...)` dentro de la misma transacción que el
`update`.

#### Scenario: Actualización de datos básicos exitosa
- GIVEN un `Usuario` existente y un administrador autenticado
- WHEN invoca `PATCH /usuarios/:id` cambiando `nombres` y `correo`
- THEN el `Usuario` refleja los nuevos valores
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'USUARIO_ACTUALIZADO'`

#### Scenario: `PATCH` no acepta un campo de borrado físico
- GIVEN un `Usuario` existente
- WHEN se invoca cualquier endpoint de este módulo con intención de eliminar físicamente la fila
- THEN no existe tal operación expuesta; la fila permanece en la base de datos

#### Scenario: `PATCH` rechaza transición hacia `bloqueado`
- GIVEN un `Usuario` con `estado = 'activo'`
- WHEN se invoca `PATCH /usuarios/:id` intentando fijar `estado = 'bloqueado'`
- THEN la solicitud se rechaza y `Usuario.estado` no cambia

#### Scenario: `PATCH` rechaza transición desde `bloqueado`
- GIVEN un `Usuario` con `estado = 'bloqueado'`
- WHEN se invoca `PATCH /usuarios/:id` intentando fijar `estado = 'activo'` a través de este módulo
- THEN la solicitud se rechaza y `Usuario.estado` no cambia (esa transición pertenece solo al
  flujo de desbloqueo manual/expiración de `bloqueo-desbloqueo-cuentas`)

### Requirement: Baja lógica exclusiva vía `estado = inactivo`
El sistema MUST proveer una operación de cambio de `estado` entre `activo` e `inactivo` (en
cualquier dirección) sobre `Usuario`, protegida con `@Roles('administrador', 'director')`, que
nunca ejecuta un `DELETE` físico. El sistema MUST registrar `USUARIO_DESACTIVADO` (o el evento
equivalente de reactivación) vía `AuditoriaService.log(tx, ...)` dentro de la misma transacción.

#### Scenario: Desactivación exitosa
- GIVEN un `Usuario` con `estado = 'activo'`
- WHEN un administrador invoca la operación de cambio de estado con destino `inactivo`
- THEN `Usuario.estado` pasa a `'inactivo'` y la fila sigue existiendo en la base de datos
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'USUARIO_DESACTIVADO'`

#### Scenario: Reactivación exitosa
- GIVEN un `Usuario` con `estado = 'inactivo'`
- WHEN un director invoca la operación de cambio de estado con destino `activo`
- THEN `Usuario.estado` pasa a `'activo'`

### Requirement: Rechazo de inicio de sesión para `Usuario` en `estado = inactivo`
El sistema MUST rechazar todo intento de inicio de sesión (contraseña y Google OAuth) de un
`Usuario` con `estado = 'inactivo'`, con el mismo tratamiento que un `Usuario` inexistente o con
credenciales inválidas (sin distinguir la causa en la respuesta). El sistema MUST registrar el
intento fallido con un motivo interno distinguible (`usuario_inactivo`) dentro del mismo evento de
auditoría ya usado para fallos de login, sin exponerlo en la respuesta HTTP. El sistema MUST NOT
contabilizar este rechazo como intento fallido a efectos del bloqueo por fuerza bruta de
`bloqueo-desbloqueo-cuentas`.

#### Scenario: Login con contraseña rechazado para usuario dado de baja
- GIVEN un `Usuario` con `estado = 'inactivo'` y contraseña válida conocida
- WHEN se invoca `POST /auth/login` con esas credenciales
- THEN la respuesta es `401` sin distinguir la causa
- AND no se crea ninguna sesión
- AND el evento de auditoría de login fallido registra `motivo = 'usuario_inactivo'`

#### Scenario: Login con Google OAuth rechazado para usuario dado de baja
- GIVEN un `Usuario` con `estado = 'inactivo'` vinculado a una cuenta de Google válida
- WHEN se invoca el flujo de login por Google OAuth con un id-token válido para ese `Usuario`
- THEN la respuesta es `401` sin distinguir la causa
- AND no se crea ninguna sesión

#### Scenario: Rechazo por inactividad no incrementa el contador de bloqueo por fuerza bruta
- GIVEN un `Usuario` con `estado = 'inactivo'`
- WHEN se invoca `POST /auth/login` repetidamente con esas credenciales
- THEN el contador de intentos fallidos usado para el bloqueo automático de
  `bloqueo-desbloqueo-cuentas` no se incrementa

### Requirement: Aislamiento de rol `comite`
El sistema MUST rechazar toda solicitud de un usuario con `rol = 'comite'` sobre cualquier
endpoint de `UsersModule` (usuarios y apoderados), verificado por `RolesGuard`.

#### Scenario: Comité no accede a ningún endpoint del módulo
- GIVEN una sesión válida cuyo rol es `comite`
- WHEN se invoca cualquier endpoint de `/usuarios` o `/usuarios/:id/apoderados`
- THEN la solicitud se rechaza sin ejecutar el handler

### Requirement: Permisos idénticos entre `administrador` y `director`
El sistema MUST tratar `administrador` y `director` como equivalentes ante todo endpoint de este
módulo, sin jerarquía ni capacidad exclusiva de uno sobre el otro.

#### Scenario: Director realiza una operación reservada a administración
- GIVEN una sesión válida con `rol = 'director'`
- WHEN invoca cualquier endpoint de `UsersModule` permitido a `administrador`
- THEN la operación se ejecuta igual que si la invocara un `administrador`

### Requirement: CRUD de `Apoderado` restringido a estudiantes
El sistema MUST exponer `POST`, `GET`, `PATCH` y `DELETE` sobre `/usuarios/:id/apoderados`
(y `/usuarios/:id/apoderados/:apoderadoId` para operaciones sobre un apoderado puntual),
protegidos con `@Roles('administrador', 'director')`, operando exclusivamente cuando el `Usuario`
referenciado por `:id` tiene `rol = 'estudiante'`. El sistema MUST permitir cero, uno o más
`Apoderado` por estudiante. El `DELETE` de `Apoderado` MUST ser un borrado físico real de la fila.
El sistema MUST registrar el evento de auditoría correspondiente (p. ej. `APODERADO_CREADO`,
`APODERADO_ACTUALIZADO`, `APODERADO_ELIMINADO`) vía `AuditoriaService.log(tx, ...)` dentro de la
misma transacción que cada escritura, usando el `Usuario` administrador/director como actor.

#### Scenario: Alta de apoderado sobre un estudiante
- GIVEN un `Usuario` con `rol = 'estudiante'` y un administrador autenticado
- WHEN invoca `POST /usuarios/:id/apoderados` con nombres y DNI del apoderado
- THEN se crea el `Apoderado` vinculado a ese `Usuario`
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'APODERADO_CREADO'`

#### Scenario: Un estudiante puede tener varios apoderados
- GIVEN un `Usuario` con `rol = 'estudiante'` y un `Apoderado` ya registrado
- WHEN un director invoca `POST /usuarios/:id/apoderados` con un segundo apoderado
- THEN ambos `Apoderado` quedan vinculados al mismo `Usuario`

#### Scenario: Rechazo cuando el `Usuario` no es estudiante
- GIVEN un `Usuario` con `rol = 'docente'`
- WHEN se invoca cualquier operación de `/usuarios/:id/apoderados` sobre ese id
- THEN la solicitud se rechaza y no se crea, modifica ni elimina ningún `Apoderado`

#### Scenario: Eliminación de apoderado es un borrado físico
- GIVEN un `Apoderado` existente vinculado a un `Usuario` estudiante
- WHEN un administrador invoca `DELETE /usuarios/:id/apoderados/:apoderadoId`
- THEN la fila `Apoderado` ya no existe en la base de datos
- AND existe exactamente una fila `EventoAuditoría` con `event_type = 'APODERADO_ELIMINADO'`

### Requirement: Claves de auditoría aditivas sin tocar el trigger de ADR-0016
El sistema MUST agregar únicamente claves nuevas y aditivas a `AUDIT_EVENT_TYPES` para las
operaciones de este módulo (p. ej. `USUARIO_CREADO`, `USUARIO_ACTUALIZADO`, `USUARIO_DESACTIVADO`,
`APODERADO_CREADO`, `APODERADO_ACTUALIZADO`, `APODERADO_ELIMINADO`). El sistema MUST NOT modificar
la cláusula `WHEN` del trigger estructural de ADR-0016, que cubre exclusivamente eventos sobre
`Voto`.

#### Scenario: Nuevas claves no afectan el trigger de `Voto`
- GIVEN las claves nuevas de este módulo agregadas a `AUDIT_EVENT_TYPES`
- WHEN se inspecciona la cláusula `WHEN` del trigger estructural de ADR-0016
- THEN su contenido no incluye ninguna de las claves nuevas de este módulo

### Requirement: Método de creación reutilizable e idempotente por DNI/código
El sistema MUST exponer en `UsersService` un método de creación (o upsert) de `Usuario` que sea
idempotente por combinación de DNI y código, invocable fila a fila, sin depender de HTTP ni de
lógica de carga de archivos, para que una futura importación masiva (#9) lo reutilice sin duplicar
validación.

#### Scenario: Invocación repetida con el mismo DNI/código no duplica el usuario
- GIVEN un `Usuario` ya creado con un DNI y código dados
- WHEN se invoca el método de creación de `UsersService` nuevamente con el mismo DNI y código
- THEN no se crea una segunda fila para esa combinación

### Requirement: UI de listado central de `Usuario` con filtro por rol y estado

El sistema MUST proveer, en `Ruta 'usuarios'`, un listado central de `Usuario` que consuma
`GET /usuarios` con filtro opcional por `rol` y `estado`, reutilizando `TablaGenerica` de
`comun/piezas/`.

#### Scenario: Filtrar el listado por rol y estado

- GIVEN un administrador autenticado en `Ruta 'usuarios'`
- WHEN selecciona `rol = 'docente'` y `estado = 'activo'` en los filtros
- THEN el listado muestra únicamente usuarios que cumplen ambos filtros

#### Scenario: Listado vacío no rompe la vista

- GIVEN un filtro que no coincide con ningún `Usuario`
- WHEN se aplica ese filtro
- THEN la UI muestra un estado vacío legible, sin error

### Requirement: Alta y edición de `Usuario` sin campo de contraseña

El sistema MUST proveer un formulario de alta/edición de `Usuario` (`nombres`, `dni`, `codigo`,
`correo`, `rol`) que cubra los cinco roles del sistema (`estudiante`, `docente`, `comite`,
`administrador`, `director`), consumiendo `POST /usuarios` y `PATCH /usuarios/:id`. El formulario
MUST NOT incluir ningún campo de contraseña, porque el login real es Google OAuth y
`password_hash` siempre se fija en `null` desde este módulo.

#### Scenario: Alta de un usuario con rol docente sin campo de contraseña

- GIVEN un administrador autenticado en el formulario de alta
- WHEN completa `nombres`, `dni`, `codigo`, `correo` y `rol = 'docente'` y confirma
- THEN se invoca `POST /usuarios` sin ningún campo de contraseña en el payload
- AND el nuevo usuario aparece en el listado

#### Scenario: Errores de unicidad del backend se muestran legibles

- GIVEN un `dni` ya usado por otro `Usuario`
- WHEN se confirma el alta con ese `dni`
- THEN la UI muestra el error 4xx del backend identificando `dni` como campo en conflicto, sin
  enviar un segundo intento automático

#### Scenario: Edición de un usuario existente

- GIVEN un `Usuario` existente abierto en su ficha
- WHEN el administrador edita `correo` y confirma
- THEN se invoca `PATCH /usuarios/:id` con el nuevo `correo` y el listado refleja el cambio

### Requirement: Cambio de estado activo/inactivo sin acción de eliminar

El sistema MUST proveer una acción de cambio de estado (`activo` ↔ `inactivo`) sobre un `Usuario`,
consumiendo `PATCH /usuarios/:id/estado`, con confirmación previa. El sistema MUST NOT ofrecer
ninguna acción de "Eliminar" sobre `Usuario` en la UI, porque el backend no expone `DELETE` físico
para este recurso.

#### Scenario: Desactivar un usuario activo

- GIVEN un `Usuario` con `estado = 'activo'` en su ficha
- WHEN el administrador confirma el cambio de estado a `inactivo`
- THEN se invoca `PATCH /usuarios/:id/estado` con `estado = 'inactivo'`
- AND la ficha refleja `estado = 'inactivo'`

#### Scenario: Ningún botón "Eliminar" está disponible

- GIVEN la ficha de cualquier `Usuario`
- WHEN el administrador revisa las acciones disponibles
- THEN no existe ningún botón o acción etiquetada "Eliminar"

### Requirement: Panel de `Apoderado` visible solo para `rol === 'estudiante'`

El sistema MUST mostrar, dentro de la ficha de un `Usuario`, un panel de gestión de `Apoderado`
(crear, editar, eliminar) únicamente cuando `rol === 'estudiante'`, consumiendo
`/usuarios/:id/apoderados`. El sistema MUST NOT mostrar ese panel para ningún otro rol. La
eliminación de un `Apoderado` MUST presentarse como borrado físico real (sin cambio de estado
intermedio), con confirmación previa.

#### Scenario: Panel de apoderados visible en la ficha de un estudiante

- GIVEN un `Usuario` con `rol = 'estudiante'` abierto en su ficha
- WHEN se renderiza la ficha
- THEN el panel de apoderados es visible y lista los `Apoderado` vinculados vía
  `GET /usuarios/:id/apoderados`

#### Scenario: Panel de apoderados ausente para un rol distinto de estudiante

- GIVEN un `Usuario` con `rol = 'docente'` abierto en su ficha
- WHEN se renderiza la ficha
- THEN el panel de apoderados no se renderiza

#### Scenario: Alta de un apoderado desde la ficha del estudiante

- GIVEN el panel de apoderados visible en la ficha de un estudiante
- WHEN el administrador completa nombres y DNI del apoderado y confirma
- THEN se invoca `POST /usuarios/:id/apoderados` y el nuevo apoderado aparece en el panel

#### Scenario: Eliminar un apoderado pide confirmación y es borrado físico

- GIVEN un `Apoderado` existente listado en el panel
- WHEN el administrador confirma "Eliminar" sobre ese apoderado
- THEN se invoca `DELETE /usuarios/:id/apoderados/:apoderadoId`
- AND el apoderado desaparece del panel sin quedar en ningún estado intermedio

### Requirement: Aislamiento del rol `comite` en el cliente

El sistema MUST ocultar el item de menú `usuarios` y toda acción de escritura de este dominio
(alta, edición, cambio de estado, alta/edición/eliminación de apoderado) para una sesión con
`rol === 'comite'`, como defensa en profundidad — el backend ya rechaza `comite` en todos los
endpoints de `UsersModule` (spec `administracion-usuarios-apoderados`, "Aislamiento de rol
comite").

#### Scenario: Comité no ve el item de menú `usuarios`

- GIVEN una sesión con `rol = 'comite'`
- WHEN se renderiza el menú de navegación
- THEN el item `usuarios` no aparece

#### Scenario: Comité navegando directamente a `/usuarios` no ve botones de escritura

- GIVEN una sesión con `rol = 'comite'` que navega directamente a `Ruta 'usuarios'`
- WHEN se renderiza la vista
- THEN no se muestra ningún botón "Crear", "Editar", "Cambiar estado" ni acción sobre `Apoderado`
