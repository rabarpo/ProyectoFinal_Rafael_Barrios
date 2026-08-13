# Especificación: electoral-process-wizard

## Purpose

Define el asistente de 4 pasos que crea un `ProcesoElectoral` en estado `borrador`, con cálculo de
padrón en vivo y creación en lote de `ProcesoAula` para `representante_aula`, sobre el modelo de
datos existente desde `#2`. Capacidad nueva. Fuera de alcance: apertura del proceso (`#13`) y
alta de `Candidato`/`Lista`/`OpcionConsulta` (`#12`).

## Requirements

### Requirement: Persistencia de `publico_objetivo` y snapshot de segmentación
El sistema MUST persistir en `ProcesoElectoral` un campo `publico_objetivo` (enum) junto con un
snapshot de la selección de nivel/grado usada al crear el borrador, además del `ProcesoAula[]`
resultante. El sistema MUST usar este snapshot al reabrir el borrador para edición, de forma que
el asistente muestre la selección original sin recalcularla desde cero.

#### Scenario: El snapshot persiste la selección original
- GIVEN un borrador creado con `publico_objetivo = 'municipio'` y nivel/grado seleccionados
- WHEN se reabre el borrador en el asistente
- THEN el paso de segmentación muestra el mismo nivel/grado guardado en el snapshot

### Requirement: Cuatro tipos de proceso soportados
El sistema MUST soportar los 4 valores de `TipoProceso` (`municipio`, `representante_aula`,
`padres`, `consulta`) en el paso 1 del asistente, cada uno con su propia regla de segmentación
obligatoria en el paso 2.

#### Scenario: Selección de tipo determina las opciones de segmentación disponibles
- GIVEN el paso 1 del asistente
- WHEN se selecciona `TipoProceso = 'representante_aula'`
- THEN el paso 2 obliga a segmentar por aula y no ofrece alcance institucional completo

### Requirement: Reglas de elegibilidad y segmentación del padrón (configurables/revisables)
El sistema MUST calcular el padrón en vivo usando únicamente cuentas con `estado = activo` y
`Matrícula` vigente en el año escolar activo (resuelto vía `ConfiguracionLecturaService` de
`#10`). *(Regla revisable ante reglamento institucional futuro.)* El sistema MUST segmentar según
el tipo de proceso: `municipio`/`consulta` MAY alcanzar nivel/grado/aula específicos o toda la
institución; `representante_aula` MUST segmentarse obligatoriamente por aula; `padres` MUST seguir
la segmentación de estudiante-aula extendida al `Apoderado` vinculado. *(Segmentación por tipo,
configurable.)* Para `consulta` con alcance a toda la comunidad, el sistema MUST contar dos
participantes potenciales por cuenta de estudiante con padre registrado (propio + del padre),
conforme `ADR-0011`. *(No revisable — deriva de un ADR aceptado.)*

#### Scenario: Estudiante sin matrícula vigente no cuenta en el padrón
- GIVEN un estudiante con `estado = activo` pero sin `Matrícula` en el año escolar activo
- WHEN se calcula el padrón en vivo para su aula
- THEN el conteo no incluye a ese estudiante

#### Scenario: Consulta institucional cuenta doble derecho de estudiante con padre
- GIVEN un `TipoProceso = 'consulta'` con alcance a toda la comunidad
- AND un estudiante elegible con `Apoderado` vinculado y registrado
- WHEN se calcula el padrón en vivo
- THEN el conteo incluye tanto al estudiante como a su apoderado como participantes potenciales

### Requirement: Cálculo de padrón en vivo sin materialización
El sistema MUST calcular el padrón como una consulta agregada (conteo) sobre `Matrícula`/árbol
académico en el momento de la solicitud, y MUST NOT persistir filas de `DerechoVoto` durante el
asistente (eso corresponde a `#13`).

#### Scenario: El conteo no crea filas de `DerechoVoto`
- GIVEN una selección de segmentación válida en el paso 2
- WHEN se solicita el conteo de padrón en vivo
- THEN no se crea ninguna fila en `DerechoVoto`

### Requirement: Creación en lote de `representante_aula` sin validar candidatos
El sistema MUST crear, para `TipoProceso = 'representante_aula'`, un `ProcesoElectoral` más un
`ProcesoAula` por cada aula elegible de la segmentación seleccionada, en la misma transacción. El
sistema MUST NOT validar la existencia de `Candidato` durante esta creación (`Candidato` no existe
hasta `#12`; ese bloqueo se implementa en `#13`). El sistema MUST excluir de la creación en lote
toda aula sin matrícula activa: dicha aula MUST NOT generar fila de `ProcesoAula`. *(Regla
revisable.)*

#### Scenario: Aula sin matrícula activa queda excluida del lote
- GIVEN una segmentación de aulas que incluye un aula sin matrícula activa
- WHEN se confirma la creación en lote de `representante_aula`
- THEN no se crea `ProcesoAula` para esa aula, y el resto de aulas elegibles sí lo generan

#### Scenario: Creación en lote no requiere `Candidato` previo
- GIVEN una aula elegible sin ningún `Candidato` registrado
- WHEN se confirma la creación en lote de `representante_aula`
- THEN se crea el `ProcesoAula` para esa aula sin error de validación de candidatos

### Requirement: Default de `ocultar_resultados` pre-marcado por el asistente
El schema de `ProcesoElectoral` MUST mantener `ocultar_resultados` con `@default(false)`. El
asistente, en la capa de aplicación, MUST pre-marcar el checkbox de `ocultar_resultados` como
activado al iniciar la creación de un proceso nuevo, sin alterar el default del schema.

#### Scenario: El asistente pre-marca `ocultar_resultados`
- GIVEN el paso final del asistente para un proceso nuevo
- WHEN se muestra el formulario de confirmación
- THEN el checkbox de `ocultar_resultados` aparece activado por defecto

#### Scenario: Creación directa sin pasar por el asistente respeta el default del schema
- GIVEN una inserción de `ProcesoElectoral` que no pasa por la capa de aplicación del asistente
- WHEN no se especifica `ocultar_resultados`
- THEN el valor persistido es `false`

### Requirement: Roles autorizados a crear procesos vía asistente
El sistema MUST restringir la finalización del asistente (creación del borrador) a usuarios con
rol `administrador`, `director` o `comité`, verificado por `RolesGuard`.

#### Scenario: Rol no autorizado no puede finalizar el asistente
- GIVEN una sesión con rol distinto de `administrador`/`director`/`comité`
- WHEN intenta confirmar la creación del borrador
- THEN la solicitud se rechaza sin ejecutar el handler

### Requirement: Auditoría de creación dentro de la misma transacción
El sistema MUST registrar vía `AuditoriaService.log(tx, ...)`, dentro de la misma transacción que
la creación del `ProcesoElectoral` (y de cada `ProcesoAula` en lote), un evento `PROCESO_CREADO`.

#### Scenario: Creación de un borrador registra auditoría
- GIVEN una creación exitosa de `ProcesoElectoral` vía el asistente
- WHEN se inspecciona `EventoAuditoría`
- THEN existe exactamente una fila con `event_type = 'PROCESO_CREADO'` para ese proceso
