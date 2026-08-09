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
- WHEN se envía como logo en `PUT /configuracion`
- THEN el binario se persiste en la columna `logo` junto con su `logo_mime`

#### Scenario: Logo que excede el tamaño máximo se rechaza
- GIVEN un archivo de 3 MB
- WHEN se envía como logo en `PUT /configuracion`
- THEN la solicitud se rechaza con un error 4xx legible antes de persistir cualquier campo

#### Scenario: Formato de logo no permitido se rechaza
- GIVEN un archivo `.pdf`
- WHEN se envía como logo en `PUT /configuracion`
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
