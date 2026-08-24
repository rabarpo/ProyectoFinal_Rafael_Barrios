# Descubrimiento de derechos de voto propios — Specification

## Purpose

Define `GET /votos/mis-derechos`: el listado de `DerechoVoto` vigentes del usuario autenticado en
procesos abiertos, y su aterrizaje en frontend. Cierra el vacío real de descubrimiento (hoy no hay
forma de llegar a `/votar/:derechoVotoId` sin conocer el UUID de antemano). No cubre `POST /votos`
ni la transacción `emitir()` (`vote-casting`).

## Requirements

### Requirement: Listado propio scoped al usuario de sesión

El sistema MUST exponer `GET /votos/mis-derechos` protegido por `AuthGuard`, que responde
`401` sin sesión válida. El sistema MUST resolver el usuario exclusivamente desde `req.usuario`
(sesión) y MUST NOT aceptar `usuario_id` como query param, path param ni body en ningún caso —
ningún valor de entrada puede sustituir al usuario de sesión.

#### Scenario: Sin sesión
- GIVEN una petición sin cookie de sesión válida
- WHEN se invoca `GET /votos/mis-derechos`
- THEN responde `401`

#### Scenario: Parámetro `usuario_id` ignorado
- GIVEN un usuario autenticado A
- WHEN invoca `GET /votos/mis-derechos?usuario_id=<id-de-otro-usuario>`
- THEN la respuesta solo contiene los `DerechoVoto` de A; el parámetro no tiene efecto alguno

### Requirement: Filtro por procesos abiertos y orden por cierre

El sistema MUST listar únicamente `DerechoVoto` del usuario cuyo `ProcesoElectoral` tenga estado
`abierto` con `now() < fecha_cierre_prevista`. Esta es la misma ventana que ya aplica
`votos.service.ts::emitir()` (`apps/backend/src/votos/votos.service.ts:240-241`); `cierre_real`
queda descartado como filtro porque es `NULL` mientras el proceso está `abierto` (solo se escribe
al cerrar) y `now() < NULL` evalúa `NULL`, lo que dejaría el listado siempre vacío. El sistema MUST
ordenar el listado por cierre más próximo primero.

#### Scenario: Múltiples procesos abiertos ordenados
- GIVEN un estudiante con `DerechoVoto` en dos procesos abiertos, con cierres distintos
- WHEN invoca `GET /votos/mis-derechos`
- THEN responde `200` con ambas entradas, la de cierre más próximo primero

#### Scenario: Proceso cerrado excluido
- GIVEN un `DerechoVoto` del usuario en un proceso con `now() >= fecha_cierre_prevista`
- WHEN invoca `GET /votos/mis-derechos`
- THEN esa entrada no aparece en la respuesta

### Requirement: Separación por calidad de derecho (ADR-0011)

Cuando el usuario porta dos filas `DerechoVoto` (`estudiante` y `padre`) para el mismo proceso, el
sistema MUST devolver ambas como entradas separadas, agrupadas o etiquetadas por `en_calidad_de`.
El sistema MUST NOT colapsarlas en una sola entrada.

#### Scenario: Estudiante y padre coexisten
- GIVEN un usuario con `DerechoVoto` `en_calidad_de: estudiante` y `en_calidad_de: padre` en el
  mismo proceso abierto
- WHEN invoca `GET /votos/mis-derechos`
- THEN la respuesta contiene dos entradas distintas, una por cada `en_calidad_de`, cada una con su
  propio `derecho_voto_id`

### Requirement: Estado "ya votaste" sin exponer la elección

Cada entrada MUST incluir `ya_voto: boolean`, derivado de la existencia de una fila `Voto`
asociada al `derecho_voto_id`. El payload de cada entrada MUST NOT incluir `lista_id`,
`opcion_id`, `candidato_id`, `blanco`, `codigo_comprobante` ni ningún otro campo que revele la
elección (mismo criterio de secreto del voto que `vote-casting`).

#### Scenario: Derecho ya ejercido
- GIVEN un `DerechoVoto` del usuario con una fila `Voto` asociada
- WHEN invoca `GET /votos/mis-derechos`
- THEN la entrada correspondiente tiene `ya_voto: true` y no contiene ninguna clave relacionada a
  la elección

#### Scenario: Derecho pendiente
- GIVEN un `DerechoVoto` del usuario sin fila `Voto` asociada, en proceso abierto
- WHEN invoca `GET /votos/mis-derechos`
- THEN la entrada correspondiente tiene `ya_voto: false`

### Requirement: Estado vacío genérico

Cuando el usuario no tiene ningún `DerechoVoto` en procesos abiertos, el sistema MUST responder
`200` con una lista vacía. El sistema MUST NOT distinguir en la respuesta si la causa es ausencia
de derecho, proceso aún no abierto o proceso ya cerrado.

#### Scenario: Sin derechos vigentes
- GIVEN un usuario autenticado sin `DerechoVoto` en ningún proceso `abierto`
- WHEN invoca `GET /votos/mis-derechos`
- THEN responde `200` con lista vacía

#### Scenario: Rol sin `DerechoVoto` (docente y roles de gestión)
- GIVEN un usuario autenticado con rol `docente`, `comite`, `administrador` o `director` (roles
  para los que `DerechoVoto` nunca se genera)
- WHEN invoca `GET /votos/mis-derechos`
- THEN responde `200` con lista vacía, sin distinción de motivo respecto al estado vacío genérico

### Requirement: Aterrizaje frontend con navegación bloqueada en derechos usados

El sistema MUST presentar, al ingresar a la pantalla, una carga única del listado (sin polling ni
refresco automático). Cada entrada con `ya_voto: true` MUST mostrarse bloqueada ("Ya votaste") sin
click habilitado. Cada entrada con `ya_voto: false` MUST navegar a la ruta existente
`/votar/:derechoVotoId` al hacer click, sin modificar `VotacionPage.tsx`. Cuando el listado está
vacío, el sistema MUST mostrar el mensaje genérico "no tenés votaciones activas en este momento".

#### Scenario: Click en derecho pendiente navega a la boleta
- GIVEN una entrada con `ya_voto: false` en el listado
- WHEN el usuario hace click sobre ella
- THEN navega a `/votar/:derechoVotoId` con el `derechoVotoId` de esa entrada

#### Scenario: Entrada ya votada no es clickeable
- GIVEN una entrada con `ya_voto: true` en el listado
- WHEN se renderiza la pantalla
- THEN la entrada se muestra bloqueada, con etiqueta "Ya votaste", sin handler de navegación
  asociado
