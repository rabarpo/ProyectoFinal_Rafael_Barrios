# Especificación: school-year-management

## Purpose

Define el CRUD de `AñoEscolar` y su activación exclusiva, sobre el modelo ya existente en
`base-schema` (`#2`). El invariante "un solo año activo" ya vive en Postgres como índice único
parcial (`anio_escolar_activo_unico_idx`); este módulo expone la operación de aplicación que lo
activa y traduce su violación a un error de negocio legible. Protegido por
`@Roles('administrador', 'director')`. Capacidad nueva — no hay spec previa que modificar. Fuera
de alcance: congelamiento del padrón (`#13`), cambios de esquema.

## Requirements

### Requirement: CRUD de `AñoEscolar`
El sistema MUST proveer `POST /anios-escolares`, `GET /anios-escolares`, `GET
/anios-escolares/:id` y `PATCH /anios-escolares/:id` (solo `nombre`), protegidos con
`@Roles('administrador', 'director')`. El sistema MUST validar la unicidad de `nombre` antes de
tocar la base de datos y devolver un error 4xx legible en caso de conflicto, en vez de propagar
la violación `500` del constraint `@unique`.

#### Scenario: Creación exitosa
- GIVEN un administrador autenticado y un `nombre` no usado
- WHEN invoca `POST /anios-escolares`
- THEN se crea el `AñoEscolar` con `activo = false`

#### Scenario: Nombre duplicado se rechaza con error legible
- GIVEN un `AñoEscolar` existente con un `nombre` dado
- WHEN se invoca `POST /anios-escolares` con el mismo `nombre`
- THEN la respuesta es un error 4xx que identifica `nombre` como campo en conflicto

#### Scenario: Rol no autorizado no accede al CRUD
- GIVEN una sesión con rol distinto de `administrador`/`director`
- WHEN invoca cualquier endpoint de `/anios-escolares`
- THEN la solicitud se rechaza sin ejecutar el handler

### Requirement: Activación exclusiva con desactivación atómica del año previo
El sistema MUST proveer `PATCH /anios-escolares/:id/activar`, protegido con
`@Roles('administrador', 'director')`, que dentro de una única transacción Prisma desactiva el
`AñoEscolar` previamente activo (si existe) y activa el indicado por `:id`. El sistema MUST
traducir la violación `P2002` del índice único parcial `anio_escolar_activo_unico_idx` (colisión
de activaciones concurrentes) a un error de negocio legible (4xx/409), sin dejar dos años activos
ni ninguno.

#### Scenario: Activación exitosa desactiva el año previo
- GIVEN un `AñoEscolar` A con `activo = true` y un `AñoEscolar` B con `activo = false`
- WHEN un administrador invoca `PATCH /anios-escolares/B/activar`
- THEN B queda `activo = true` y A queda `activo = false`

#### Scenario: Activación concurrente produce error de negocio legible
- GIVEN dos solicitudes de activación concurrentes sobre `AñoEscolar` distintos
- WHEN ambas colisionan contra el índice único parcial
- THEN una de ellas recibe un error de negocio legible (no un 500 crudo de Postgres) y a lo sumo
  un `AñoEscolar` queda activo

### Requirement: `DELETE` físico de `AñoEscolar` con guarda de integridad referencial
El sistema MUST proveer `DELETE /anios-escolares/:id`, protegido con `@Roles('administrador',
'director')`, que ejecuta un borrado físico real de la fila. El sistema MUST capturar la
violación de `onDelete: Restrict` cuando existan `Seccion`, `Aula`, `Matricula` o `Configuracion`
dependientes, y devolver un error de negocio legible (4xx/409) en vez de propagar el error crudo
de Postgres.

#### Scenario: Eliminación exitosa sin dependientes
- GIVEN un `AñoEscolar` sin `Seccion`, `Aula`, `Matricula` ni `Configuracion` asociadas
- WHEN un administrador invoca `DELETE /anios-escolares/:id`
- THEN la fila ya no existe en la base de datos

#### Scenario: Eliminación rechazada por dependientes
- GIVEN un `AñoEscolar` con al menos una `Seccion` asociada
- WHEN se invoca `DELETE /anios-escolares/:id` sobre ese año
- THEN la respuesta es un error de negocio legible y la fila permanece en la base de datos

### Requirement: Auditoría de escritura sobre `AñoEscolar`
El sistema MUST registrar vía `AuditoriaService.log(tx, ...)`, dentro de la misma transacción que
cada escritura, los eventos de creación, actualización, activación y eliminación de
`AñoEscolar`, agregando únicamente claves nuevas y aditivas a `AUDIT_EVENT_TYPES` sin modificar la
cláusula `WHEN` del trigger estructural de ADR-0016.

#### Scenario: Activación registra un evento de auditoría
- GIVEN una activación exitosa de `AñoEscolar`
- WHEN se inspecciona `EventoAuditoría`
- THEN existe exactamente una fila con el `event_type` de activación correspondiente a ese año

### Requirement: UI de gestión de AñoEscolar

El sistema MUST proveer, en la pestaña "Año escolar" de `Ruta 'academica'`, un listado que crea,
edita (`nombre`) y elimina `AñoEscolar` reutilizando `TablaGenerica`/`FormularioGenerico`, y MUST
mostrar en el error de eliminación el mensaje legible `409 ENTIDAD_CON_DEPENDIENTES` cuando el
backend lo devuelva.

#### Scenario: Eliminar AñoEscolar con Sección dependiente muestra el error legible
- GIVEN un `AñoEscolar` con al menos una `Sección` asociada
- WHEN el usuario confirma "Eliminar" sobre ese `AñoEscolar`
- THEN la UI muestra el mensaje de error legible del backend, no un error genérico

### Requirement: Activación de AñoEscolar con confirmación simple

El sistema MUST mostrar un botón "Activar" por cada fila de `AñoEscolar` no activo, que al hacer
click abre un diálogo de confirmación simple antes de invocar `PATCH :id/activar`. El diálogo
MUST NOT mostrar cuál año queda desactivado (decisión ya tomada: confirmación simple, no un
resumen del año previamente activo).

#### Scenario: Activar un año pide confirmación antes de invocar el backend
- GIVEN el usuario en la pestaña "Año escolar" con un `AñoEscolar` B no activo
- WHEN hace click en "Activar" sobre B
- THEN se abre un diálogo de confirmación simple, sin listar el año que se desactivará
- AND solo tras confirmar se invoca `PATCH /anios-escolares/B/activar`

#### Scenario: Cancelar el diálogo no activa ningún año
- GIVEN el diálogo de confirmación de activación abierto
- WHEN el usuario lo cancela
- THEN no se invoca `PATCH :id/activar` y el año activo no cambia

### Requirement: Defensa en profundidad del rol comité sobre AñoEscolar

El sistema MUST ocultar, para una sesión con rol `comite`, los botones "Crear", "Editar",
"Eliminar" y "Activar" en la pestaña "Año escolar", dejando visible únicamente el listado.

#### Scenario: Comité ve el listado de años sin botón Activar
- GIVEN una sesión con rol `comite` en la pestaña "Año escolar"
- WHEN observa el listado
- THEN no ve ningún botón "Crear", "Editar", "Eliminar" ni "Activar"
