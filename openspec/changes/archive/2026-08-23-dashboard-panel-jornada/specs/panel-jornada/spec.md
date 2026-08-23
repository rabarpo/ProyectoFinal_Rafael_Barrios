# Panel de jornada — Specification

## Purpose

Define el panel operativo de jornada electoral: procesos activos, estudiantes, vínculos
apoderado-estudiante, % participación, votos por hora, avance por aula y correos fallidos, scoped
por proceso, para `administrador`/`director`/`comite`. Incluye el modo proyección (pantalla grande,
sin desglose por candidato). No cubre `resultados-en-vivo` (#16, desglose por candidato/lista) ni
cambios de schema Prisma.

## Requirements

### Requirement: Autorización restringida a tres roles
El sistema MUST exponer todo endpoint y vista del panel de jornada bajo `AuthGuard` +
`@Roles('administrador', 'director', 'comite')`. MUST responder `403` a cualquier otro rol
autenticado (`docente`, `estudiante`) y `401` sin sesión válida.

#### Scenario: Comité consulta el panel
- GIVEN un usuario con rol `comite`
- WHEN consulta cualquier endpoint del panel de jornada
- THEN responde `200` con los datos scoped al proceso

#### Scenario: Docente intenta acceder
- GIVEN un usuario con rol `docente`
- WHEN consulta cualquier endpoint del panel de jornada
- THEN responde `403`

#### Scenario: Sin sesión válida
- GIVEN una petición sin cookie de sesión
- WHEN se invoca cualquier endpoint del panel de jornada
- THEN responde `401`

### Requirement: Procesos activos reutiliza el endpoint existente
El sistema MUST usar `GET /procesos?estado=abierto` sin cambios de contrato para listar "procesos
activos" en el panel. MUST NOT crear un endpoint nuevo para esta porción.

#### Scenario: Panel lista procesos activos
- GIVEN procesos en distintos `estado`
- WHEN el panel solicita procesos activos
- THEN recibe solo los procesos con `estado = 'abierto'` vía `GET /procesos?estado=abierto`

### Requirement: Conteo de estudiantes y vínculos apoderado-estudiante scoped por proceso
El sistema MUST exponer, scoped por `proceso_id`, el conteo de estudiantes y el conteo de filas
`Apoderado` crudas, sin deduplicar por DNI. MUST NOT deduplicar por DNI (un padre con 3 hijos
matriculados cuenta 3 veces). La UI MUST etiquetar ese conteo como "vínculos apoderado-estudiante",
nunca como "padres".

#### Scenario: Padre con múltiples hijos matriculados
- GIVEN un padre con 3 hijos matriculados en el proceso
- WHEN se consulta el conteo de vínculos apoderado-estudiante
- THEN el conteo incluye las 3 filas `Apoderado`, sin deduplicar

### Requirement: Porcentaje de participación scoped por proceso
El sistema MUST exponer `% participación` para `proceso_id`.

#### Scenario: Participación parcial durante la jornada
- GIVEN un proceso abierto con votos emitidos parciales
- WHEN se consulta el panel
- THEN el % participación refleja los votos emitidos hasta ese momento

### Requirement: Votos por hora
El sistema MUST exponer una serie temporal de votos agregados por franja horaria para
`proceso_id`, ordenada cronológicamente, basada en `Voto.hora_servidor` (`Voto.creado_en`
no existe en el modelo de datos; ver design.md D4).

#### Scenario: Serie de votos por hora
- GIVEN votos emitidos en distintas franjas horarias del mismo proceso
- WHEN se consulta la serie de votos por hora
- THEN cada franja horaria muestra el conteo de votos emitidos en esa franja, en orden cronológico

### Requirement: Avance por aula con umbral de rezagada
El sistema MUST exponer `% participación` por aula para `proceso_id`. MUST clasificar cada aula
como "rezagada" cuando su `% participación` esté por debajo de un umbral definido por el sistema
(configurable o fijo, pero explícito en el backend, nunca calculado en el cliente).

#### Scenario: Aula por debajo del umbral
- GIVEN un aula con `% participación` menor al umbral definido
- WHEN se consulta el avance por aula
- THEN esa aula aparece marcada como "rezagada"

#### Scenario: Aula por encima del umbral
- GIVEN un aula con `% participación` igual o mayor al umbral definido
- WHEN se consulta el avance por aula
- THEN esa aula no aparece marcada como "rezagada"

### Requirement: Correos fallidos scoped por proceso
El sistema MUST exponer `count(JobCorreo)` con `estado = 'fallido'` scoped por `proceso_id`, bajo
la misma autorización de tres roles (no la audiencia amplia de `ResultadosController`).

#### Scenario: Correos fallidos del proceso
- GIVEN un proceso con `JobCorreo` en estado `fallido` y otros en `enviado`/`pendiente`
- WHEN un usuario autorizado consulta el contador
- THEN recibe solo el conteo de `JobCorreo` en estado `fallido` de ese proceso

### Requirement: Modo proyección sin desglose por candidato
El sistema MUST exponer el modo proyección en una `Ruta` separada, sin controles interactivos. El
servidor MUST NOT incluir desglose por candidato/lista/opción en el payload de proyección bajo
ninguna circunstancia; la visibilidad se evalúa en el servidor, nunca en el cliente (mismo
principio que ADR-0005/`resultados-en-vivo`).

#### Scenario: Proyección muestra solo agregados
- GIVEN un usuario autorizado en la ruta de proyección
- WHEN el servidor arma el payload
- THEN el payload incluye participación, votos por hora y avance por aula, sin desglose por
  candidato

#### Scenario: Proyección no expone controles
- GIVEN la ruta de proyección montada
- WHEN el usuario la observa
- THEN no hay controles interactivos disponibles (filtros, botones de acción)

### Requirement: Sondeo periódico con intervalo configurable
El sistema MUST refrescar los datos del panel (y de proyección) por sondeo periódico, con un
intervalo configurable por vista, siguiendo el mismo patrón que `useResultadosEnVivo`.

#### Scenario: Panel se actualiza por sondeo
- GIVEN el panel de jornada montado
- WHEN transcurre el intervalo de sondeo configurado
- THEN los datos se refrescan automáticamente sin recargar la página
