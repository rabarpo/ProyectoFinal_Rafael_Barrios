# Backlog: SEEI — Sistema de Elecciones Electrónicas para Instituciones Educativas

Derivado de `PRD.md` y `TECH-DESIGN.md` (+ `adrs/`). Cada fila es una spec independiente,
dimensionada para un único ciclo de Spec-Driven Development. El orden es por **dependencia
técnica**, no por prioridad de negocio.

| # | Item | Alcance | Depende de | Contexto extra requerido |
|---|---|---|---|---|
| 1 | Andamiaje del sistema | Monorepo TypeScript, NestJS + React/Vite, PostgreSQL, Redis, worker, Docker Compose con Caddy/HTTPS, OpenAPI generado desde el código y tipos del cliente (ADR-0001/0002/0004/0007) | — | — |
| 2 | Esquema base y migraciones | Entidades del modelo de datos del TDD, migraciones y semillas mínimas | #1 | — |
| 3 | Motor de auditoría append-only | `EventoAuditoría` con triggers anti UPDATE/DELETE y servicio de registro transaccional (ADR-0010) | #2 | — |
| 4 | Autenticación con sesión en servidor | Usuario/contraseña, cookie httpOnly con sesión en Redis, guards de autorización por rol, registro de accesos (ADR-0004) | #3 | — |
| 5 | Google OAuth de dominio y recuperación | OAuth restringido al dominio institucional configurado; recuperación y cambio de contraseña | #4 | — |
| 6 | Bloqueo y desbloqueo de cuentas | Bloqueo por N intentos fallidos, expiración automática a los 10–15 min, desbloqueo manual del comité auditado, revocación inmediata de la sesión activa (ADR-0008) | #4 | — |
| 7 | Administración de usuarios y apoderados | CRUD de estudiantes, docentes, comité, administradores y director; `Apoderado` vinculado al estudiante sin credenciales propias (ADR-0011) | #4 | — |
| 8 | Administración académica | Año escolar, nivel, grado, sección, aula, turno y matrícula; un solo año escolar activo a la vez | #7 | — |
| 9 | Importación de Excel | Carga de usuarios/matrícula con reporte fila a fila (DNI duplicado, correo inválido, fila vacía, formato), CSV de errores descargable, idempotencia por DNI/código y registro en auditoría | #8 | — |
| 10 | Configuración general | Institución, logo, director, integrantes del comité, colores, zona horaria, SMTP y dominio Google Workspace | #4 | — |
| 11 | Administración de procesos electorales | Asistente de 4 pasos, cálculo de padrón en vivo por público/nivel/grados/aulas, estado borrador, creación en lote de procesos por aula, los 4 tipos de proceso del PRD | #8, #10 | — (sin reglamento previo: la spec define las reglas por buenas prácticas — ver "Ausencia de reglamento previo") |
| 12 | Candidatos, listas y opciones de consulta | Lista cerrada agrupando cargos, foto, número, símbolo, lema, propuesta, plan de trabajo en PDF; opciones A/B/C para consultas; baja de candidato con momento registrado | #11 | — |
| 13 | Apertura del proceso y congelamiento del padrón | Materialización de `DerechoVoto` congelados, `ocultar_resultados` inmutable al abrir, doble derecho (estudiante y padre) en consultas a toda la comunidad, apertura registrada con hora del servidor (ADR-0008/0011) | #12 | — (reglas de elegibilidad derivadas del PRD y del árbol académico) |
| 14 | Emisión del voto en 3 pasos | Boleta mobile-first, banda de calidad "Votando como…", voto en blanco, `POST /votos` con clave de idempotencia y `UNIQUE (proceso, derecho)`, validación del derecho al voto, pantallas específicas de rechazo con evento en auditoría (ADR-0003/0004/0006/0008/0011) | #13 | — |
| 15 | Outbox de correo y comprobante autenticado | Fila `JobCorreo` en la misma transacción del voto, worker con envío por lotes y reintentos, correo con código/hora/enlace pero nunca la elección, comprobante tras autenticarse y acceso desde "Mis votaciones" (ADR-0009/0012) | #14 | — |
| 16 | Resultados en vivo | Endpoints de resultados con visibilidad evaluada en el servidor (ocultos ⇒ solo participación), polling con React Query, hora del servidor en cada respuesta, gráficos de barras y pastel, porcentajes y abstenciones (ADR-0005/0008) | #14 | — |
| 17 | Cierre, escrutinio y actas | Cierre del proceso, cuadre padrón = votos + blancos + abstenciones con nulos = 0 y su nota explicativa, empate declarado sin resolución automática, participación cero, candidato dado de baja reflejado; 4 actas (apertura, cierre, escrutinio, oficial) generadas en PDF por el worker | #16 | — (sin formato oficial previo: la spec define la plantilla de acta por buenas prácticas) |
| 18 | Reportes y exportaciones | Participación, votantes, abstenciones, resultados, candidatos y consultas; exportación a Excel, PDF y CSV generada por el worker y registrada en auditoría | #17 | — |
| 19 | Notificaciones | Bandeja interna y correo: inicio de votación, recordatorios, cierre próximo y publicación de resultados; plantillas con variables y ritmo de envío por lotes | #15 | — |
| 20 | Dashboard y panel de jornada | Procesos activos, cantidad de estudiantes y padres, porcentaje de participación, resultados rápidos, contador de correos fallidos y modo proyección | #16 | — |
| 21 | Vista de auditoría | Consulta solo lectura filtrable por tipo, exportación a CSV/PDF que se autoregistra como evento, garantía de que ninguna vista vincula identidad con elección, reconstrucción completa de la cadena de un proceso cerrado (ADR-0010) | #3, #14 | Ley de Protección de Datos Personales (datos de menores) — norma externa, no institucional: la spec implementa los plazos del ADR-0010 y la revisión legal se hace después, no bloquea |
| 22 | Contingencia de jornada | Extensión de la hora de cierre como acción auditada, anulación de códigos de comprobante posteriores al respaldo, revoto de los votantes afectados y acta de incidencias (ADR-0013) | #17 | — (el procedimiento del ADR-0013 es la fuente; alimentará las bases futuras) |
| 23 | Prueba de carga y ensayo de restauración | Escenario k6/artillery con 1,000 votantes concurrentes (ráfaga de `POST /votos` + polling del panel) y ensayo completo de restauración ejecutando el procedimiento de contingencia, no solo la parte técnica (ADR-0007/0013) | #22 | — |
| 24 | Aplicación del sistema de diseño visual | Traducir `DESIGN-SYSTEM.md` (paleta, tipografía Hanken Grotesk, espaciado, sombras, componentes) a variables CSS/config de Tailwind y aplicarlo a los componentes ya existentes del login (#11 PR1-PR3, hoy sin estilo) y a los que se vayan agregando (asistente de #11, candidatos de #12, boleta de #14, etc.) | #11 | `DESIGN-SYSTEM.md` (raíz del repo) — documento de estilo, no requiere spec de negocio |
| 25 | Menú principal y navegación post-login | Pantalla de inicio por rol (reemplaza la ruta raíz `/` hoy hardcodeada a `proceso-nuevo` en `apps/frontend/src/app/rutas.ts`), con accesos a lo que ya tiene frontend (procesos, candidatos, votación/resultados según rol) y a lo que agregue #26; sin lógica de negocio propia, sólo enrutamiento y layout | #11, #24 | — |
| 26 | Frontend de administración académica | UI de CRUD para año escolar, nivel, grado, sección, aula y matrícula (jerarquía de 6 entidades del backend #8), incluida activación de año escolar | #8, #25 | — |
| 27 | Frontend de administración de usuarios y apoderados | UI de CRUD de usuarios (5 roles), alta/baja de apoderados vinculados a estudiantes, bloqueo/desbloqueo de cuentas (backend #6/#7) | #6, #7, #25 | — |
| 28 | Frontend de configuración general | UI del singleton de configuración institucional (nombre, director, comité, colores, zona horaria, SMTP, dominio Google Workspace) y subida de logo (backend #10) | #10, #25 | — |
| 29 | Frontend de importación de Excel | UI de carga de archivo (`.xlsx`/`.csv`, 5 MB, 2000 filas), reporte de errores fila a fila y descarga del CSV de errores (backend #9) | #9, #25 | — |

## Ausencia de reglamento previo

La institución **no cuenta hoy con reglamento electoral escrito ni con un formato oficial de
actas**. Decisión tomada: el sistema se desarrolla sobre buenas prácticas electorales estándar y
el reglamento institucional se redactará después, adaptándose a lo implementado. Es decir, **el
sistema define la norma, no al revés**.

Consecuencias para las specs de #11, #13, #17 y #22:

- Cada spec debe **declarar explícitamente las reglas que adopta** (quién es elegible, cómo se
  segmenta el padrón, qué campos lleva cada acta, qué pasos sigue la contingencia) en una sección
  de reglas de negocio, no dejarlas implícitas en el código. Ese texto es el borrador del
  reglamento futuro.
- Toda regla adoptada por defecto se marca como **configurable o revisable**, para que la
  redacción posterior del reglamento no exija reescribir el módulo.
- Base de las buenas prácticas a aplicar: secreto del voto, un voto por derecho, padrón congelado
  al abrir, escrutinio reproducible, actas con quórum/participación/resultados/firmantes y
  observaciones, empate declarado sin resolución automática, y trazabilidad íntegra en auditoría
  — todo ya establecido en el PRD y los ADRs.
- **#21 (auditoría) es distinto**: ahí la norma pendiente es una ley externa, no una regla
  institucional. La spec implementa los plazos del ADR-0010 (inmutable durante el año escolar +
  2 años de impugnación, luego anonimización auditada); la validación legal queda como tarea
  posterior y no bloquea la implementación.

## Notas de decomposición

- **#14 no se parte.** Idempotencia, restricción `UNIQUE` y validación del derecho al voto son
  una sola garantía transaccional ("0 votos duplicados"); separarlas dejaría media garantía
  implementada y un criterio de éxito del PRD sin verificar.
- **Fuera del backlog.** Los riesgos documentales del TDD — actualizar la redacción del PRD según
  el ADR-0009 y actualizar los prototipos `SEEI Wireframes.dc.html` / `SEEI Votación.dc.html`
  tras el ADR-0011 — son trabajo de documentación, no specs de implementación.
- **#23 es un ítem de validación**, no de funcionalidad: cierra los dos riesgos técnicos abiertos
  del TDD (prueba de carga y respaldo no ensayado) y debe completarse antes de la primera
  jornada real.
- **#25/#26 nacen de un vacío detectado en 2026-08-19**, no de una regresión: al probar el login
  como administrador, la app cae directo al asistente de creación de proceso porque no existe
  ninguna otra pantalla a la que ir. Las propuestas de #7, #8 y #10 ya declaraban el frontend
  "fuera de alcance… responsabilidad de una spec de frontend posterior" — están cumplidas en su
  propio contrato, simplemente esa spec posterior nunca se agregó al backlog. Se separan en dos
  frentes porque son dependencias distintas: #25 es enrutamiento/layout puro (no necesita ningún
  backend nuevo) y ya se implementó y archivó.
- **#26 original (frontend de administración) se partió en 4 ítems (#26-#29) en 2026-08-20**, uno
  por dominio de backend (académica, usuarios/apoderados, configuración, importación Excel), tras
  explorar el alcance real: era 4-6x el tamaño de cualquier change de frontend ya completado (#12
  candidatos-listas cubrió 1 solo dominio), con un dominio (académica) de 6 entidades
  jerárquicas. Mismo criterio que ya se usó para separar el backend en #7/#8/#9/#10 en vez de un
  único "backend de administración" — cada ítem cierra su propio ciclo SDD (explore→propose→
  spec→design→tasks→apply→verify→archive) en vez de un solo change con varios PRs encadenados.
  Los 4 dependen de #25 (ya archivado) además de su backend respectivo.

## Cómo usar este backlog

Cada ítem es una spec independiente. Al implementarlo, arrancá un ciclo de Spec-Driven
Development (`sdd-new` o el flujo equivalente de tu harness) usando ese ítem como el "change" —
no el proyecto completo. Si la columna "Contexto extra requerido" tiene algo, compartilo como
contexto al generar la spec de ese ítem.
