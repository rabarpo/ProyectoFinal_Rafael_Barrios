# Technical Design Document: SEEI — Sistema de Elecciones Electrónicas para Instituciones Educativas

**Tipo de proyecto:** Greenfield
**Design.md disponible:** Sí — usado como fuente para el modelo de datos y las reglas operativas
(wireframes `1a`–`1i`, `3a`–`3e` y alta fidelidad del flujo de votación).

## Resumen

SEEI digitaliza el ciclo electoral completo de una institución educativa — municipio escolar,
representantes de aula, APAFA y consultas institucionales — desde la creación del proceso hasta
el acta oficial, según el `PRD.md`. Los votantes habilitados emiten un único voto verificado
desde cualquier dispositivo (mobile-first), los resultados se calculan automáticamente con
opción de ocultarlos hasta el cierre, se generan actas exportables y todo evento queda en una
auditoría inmutable. Este documento fija la arquitectura: monolito modular en TypeScript con
worker de tareas de fondo, PostgreSQL como única fuente de verdad, API REST con OpenAPI, y
despliegue en un VPS con Docker Compose.

## Arquitectura de componentes

Tres componentes desplegables ([ADR-0001](adrs/0001-monolito-modular-con-worker.md)), todos en
TypeScript ([ADR-0002](adrs/0002-stack-typescript-full-stack.md)):

```
┌─────────────────────────────┐
│ Frontend web (React + Vite) │  SPA mobile-first · sistema visual Broadsheet
│  · flujo de votación 3 pasos│
│  · vistas del votante       │
│  · panel comité / admin     │
└──────────────┬──────────────┘
               │ HTTPS · REST + OpenAPI (ADR-0004)
┌──────────────┴──────────────┐
│ Backend NestJS (monolito    │  módulos: auth · usuarios · académico · procesos
│ modular)                    │  candidatos · padrón · votación · resultados
│                             │  actas · reportes · auditoría · configuración
└───┬──────────────┬──────────┘
    │              │ outbox → BullMQ (Redis)
┌───┴────────┐  ┌──┴───────────────┐
│ PostgreSQL │  │ Worker Node.js   │ → SMTP (Google Workspace)
│ (ADR-0003) │←─│  correos · PDFs  │
└────────────┘  │  exportaciones   │
                └──────────────────┘
```

- El backend es el único que escribe en la base de negocio; el worker consume jobs (correos,
  actas PDF, exportaciones Excel/CSV) desde el outbox en PostgreSQL vía BullMQ
  ([ADR-0012](adrs/0012-outbox-correos-postgresql.md)) y comparte la base de datos.
- Todo corre en un VPS con Docker Compose tras Caddy/Nginx con HTTPS
  ([ADR-0007](adrs/0007-despliegue-vps-docker-compose.md)).

## Decisiones de arquitectura

| # | Decisión | Estado |
|---|---|---|
| [ADR-0001](adrs/0001-monolito-modular-con-worker.md) | Monolito modular con worker de tareas de fondo | Aceptado |
| [ADR-0002](adrs/0002-stack-typescript-full-stack.md) | Stack TypeScript full-stack (Node.js/NestJS + React) | Aceptado |
| [ADR-0003](adrs/0003-base-de-datos-postgresql.md) | PostgreSQL como base de datos única del sistema | Aceptado |
| [ADR-0004](adrs/0004-api-rest-openapi.md) | API REST con contrato OpenAPI | Aceptado |
| [ADR-0005](adrs/0005-estado-y-tiempo-real-polling.md) | Estado en el servidor y actualización por polling con React Query | Aceptado |
| [ADR-0006](adrs/0006-voto-sincrono-correo-asincrono.md) | Emisión del voto síncrona y transaccional; correo asíncrono | Aceptado |
| [ADR-0007](adrs/0007-despliegue-vps-docker-compose.md) | Despliegue en VPS en la nube con Docker Compose | Aceptado |
| [ADR-0008](adrs/0008-reglas-operativas-jornada.md) | Reglas operativas de la jornada — visibilidad, voto en blanco y desbloqueo | Aceptado |
| [ADR-0009](adrs/0009-correo-confirmacion-enlace-autenticado.md) | Correo de confirmación con enlace autenticado al comprobante | Aceptado |
| [ADR-0010](adrs/0010-secreto-del-voto-auditoria.md) | Secreto del voto — contenido, acceso y retención de la auditoría | Aceptado |
| [ADR-0011](adrs/0011-voto-del-padre-cuenta-estudiante.md) | El padre vota con la cuenta del estudiante que representa | Aceptado |
| [ADR-0012](adrs/0012-outbox-correos-postgresql.md) | Outbox de correos en PostgreSQL | Aceptado |
| [ADR-0013](adrs/0013-contingencia-jornada-procedimiento.md) | Continuidad de jornada por procedimiento operativo | Aceptado |

## Modelo de datos

Entidades principales, derivadas del PRD y de lo que las pantallas del Design.md revelan
(banda "Votando por", contadores del panel, tabla de candidatos con estado, importación con
errores fila a fila):

**Identidad y estructura**

- `Usuario` — nombres, DNI, código, correo, rol (estudiante, docente, comité, administrador,
  director), estado (activo/inactivo/bloqueado), `bloqueado_hasta` (expiración corta, ADR-0008),
  registro de accesos. Los padres no tienen cuenta propia: votan con la cuenta del estudiante
  (ADR-0011).
- `Apoderado` — datos del padre o apoderado (nombres, DNI, correo de contacto) vinculados a cada
  estudiante, sin credenciales de acceso (ADR-0011); alimenta la calidad "como padre de" que la
  boleta declara en procesos de padres.
- `AñoEscolar`, `Nivel`, `Grado`, `Sección`, `Aula`, `Turno` — árbol académico para segmentar
  procesos; un solo año escolar activo a la vez.
- `Matrícula` — estudiante ↔ aula en un año escolar (fuente del cálculo de padrón).

**Proceso electoral**

- `ProcesoElectoral` — nombre, descripción, tipo (municipio, representante de aula, padres,
  consulta), fecha, hora de apertura y cierre, estado (borrador → abierto → cerrado →
  acta emitida), público objetivo, nivel/grados/aulas participantes, `ocultar_resultados`
  (congelado al abrir, ADR-0008), momento real de apertura y cierre.
- `Lista` / `Candidato` — foto, nombres, grado, aula, número de lista, símbolo, lema, propuesta,
  plan de trabajo (PDF), estado (activo / dado de baja + momento de la baja). Para municipio
  escolar la lista es cerrada: la lista agrupa los cargos (alcalde, teniente, regidores) y el
  voto es por lista (Design.md, decisión tomada).
- `OpciónConsulta` — Opción A/B/C… para consultas institucionales.
- `DerechoVoto` (padrón) — snapshot congelado al abrir el proceso: cuenta votante, proceso,
  `en_calidad_de` (estudiante / padre / docente, ADR-0011), aula al momento del congelamiento,
  estado (pendiente / ejercido). En una consulta a toda la comunidad, una cuenta de estudiante
  porta dos derechos: el propio y el de su padre. Los cambios académicos posteriores no lo
  alteran.

**Votación y trazabilidad**

- `Voto` — proceso, derecho de voto, elección (lista, opción o `BLANCO`; no existe voto nulo,
  ADR-0008), código de comprobante, hora del servidor sellada en la transacción, clave de
  idempotencia. `UNIQUE (proceso_id, derecho_voto_id)` garantiza 0 duplicados (ADR-0003).
- `EventoAuditoría` — append-only (triggers anti UPDATE/DELETE): sesiones, accesos, creación y
  apertura de procesos, altas/bajas de candidatos, votos, rechazos, desbloqueos, correos
  enviados/fallidos, generación de actas y reportes, exportaciones. Detalle en JSONB. El evento
  `VOTO` registra derecho, código y hora — **nunca la elección**; ninguna vista ni exportación
  vincula identidad con elección. Retención: append-only durante el año escolar + 2 años de
  impugnación, luego anonimización administrativa auditada (ADR-0010).
- `JobCorreo` / `Notificación` — **outbox** de envíos en PostgreSQL: la fila nace en la misma
  transacción que el hecho que notifica (ADR-0012), con estado (pendiente, enviado, fallido +
  reintentos); bandeja interna del votante; plantillas con variables (Design.md `3b`).
- `Acta` — tipo (apertura, cierre, escrutinio, oficial), proceso, contenido congelado, PDF
  generado, estado.
- `Configuración` — institución, logo, director, comité (nombres que se imprimen en actas), año
  activo, zona horaria, colores, SMTP, dominio Google Workspace.

## Criterios de aceptación por flujo

Más granulares que los del PRD; verificables uno a uno.

### Flujo 1 — Emisión del voto (3 pasos)

- [ ] Un votante del padrón, con el proceso abierto, completa paso 1 → 2 → 3 y recibe pantalla
      de comprobante con código de voto y hora del servidor.
- [ ] El `POST /votos` con la misma clave de idempotencia repetido N veces (doble clic, dos
      pestañas, reintento tras corte) produce exactamente 1 fila en `Voto` y devuelve siempre el
      mismo comprobante.
- [ ] Un reintento tras recarga de página (clave de idempotencia nueva) que choca con el
      `UNIQUE` recibe el comprobante ya emitido — nunca una pantalla de error para quien sí
      votó; la clave persiste en `sessionStorage` por proceso y derecho (ADR-0004).
- [ ] Si la transacción no confirma (corte de conexión en paso 3), no existe fila en `Voto` ni
      marca en `DerechoVoto`, y el votante puede reintentar desde el paso 2.
- [ ] Un voto confirmado a las `hh:cierre − 1s` (hora del servidor) se acepta; a `hh:cierre` o
      después se rechaza con la pantalla "Votación cerrada" y evento `RECHAZO` en auditoría.
- [ ] Intentos de voto de: usuario inactivo, usuario fuera del padrón, proceso no abierto, o
      derecho ya ejercido → rechazados con su pantalla específica y evento `RECHAZO`; ninguno
      crea fila en `Voto`.
- [ ] La opción "voto en blanco" está presente en toda boleta y se registra como voto con
      elección `BLANCO`; no existe opción de voto nulo.
- [ ] El botón de emitir queda deshabilitado hasta marcar el consentimiento de la copia por
      correo, y pasa a estado "Registrando…" al primer toque.
- [ ] Un proceso de padres se vota desde la cuenta del estudiante y la banda declara la calidad
      ("Votando como padre/apoderado de ▢") en los 3 pasos; en una consulta a toda la comunidad,
      la cuenta presenta por separado sus dos derechos (como estudiante y como padre) y cada
      voto consume solo el `DerechoVoto` de su calidad (ADR-0011).
- [ ] El flujo completo (desde inicio de sesión hasta comprobante) es realizable en < 3 minutos
      en un teléfono (validación con usuarios reales, criterio del PRD).

### Flujo 2 — Correo de confirmación

- [ ] La fila `JobCorreo` nace en la misma transacción que el voto (outbox): no puede existir un
      voto confirmado sin su job de correo, ni siquiera si el backend cae inmediatamente después
      del commit (ADR-0012).
- [ ] Cada voto confirmado genera exactamente un job de correo; el correo contiene código de
      voto, proceso, hora y enlace autenticado — nunca la elección en el cuerpo (ADR-0009).
- [ ] El enlace del correo exige sesión de la cuenta votante; autenticado, muestra el
      comprobante con la elección concreta.
- [ ] Un fallo definitivo de envío (correo inválido/inexistente) genera evento
      `CORREO_FALLIDO`, incrementa el contador del panel de jornada y **no** altera el voto.
- [ ] El comprobante es accesible sin el correo desde "Mis votaciones" → `VOTADO`.
- [ ] Los envíos masivos salen por lotes con ritmo configurable sin exceder los límites del
      proveedor SMTP.

### Flujo 3 — Creación y apertura de proceso

- [ ] El asistente de 4 pasos calcula el padrón en vivo según público/nivel/grados/aulas y lo
      muestra antes de confirmar.
- [ ] Al abrir el proceso: el padrón se materializa como filas `DerechoVoto` congeladas, la
      configuración de visibilidad queda inmutable, y la apertura se registra en auditoría con
      hora del servidor.
- [ ] Un cambio de aula/sección posterior a la apertura no modifica el padrón del proceso
      abierto y sí aplica a procesos creados después.
- [ ] La creación en lote de procesos de representante de aula genera un proceso por aula y
      bloquea las aulas sin candidatos registrados.
- [ ] "Ocultar resultados hasta el cierre" aparece activa por defecto y visible de forma
      prominente en la revisión previa a abrir.

### Flujo 4 — Resultados, escrutinio y actas

- [ ] Con resultados ocultos, el endpoint de resultados devuelve solo participación — nunca
      conteos por candidato — para cualquier rol de votante; el comité ve el estado "ocultos".
- [ ] Al cierre: votos por lista/opción + blancos + abstenciones = total del padrón congelado,
      con nulos = 0 y nota explicativa en el acta.
- [ ] El escrutinio es reproducible: un recuento directo sobre la tabla `Voto` coincide
      exactamente con el acta, y la cantidad y cronología de filas de `Voto` coinciden con los
      eventos `VOTO` de auditoría — que no contienen la elección (ADR-0010).
- [ ] Un empate entre listas/opciones queda declarado en el acta de escrutinio, sin resolución
      automática.
- [ ] Un candidato dado de baja con la votación abierta desaparece de la boleta para nuevos
      votantes, conserva sus votos ya emitidos, y el acta refleja la baja y su momento.
- [ ] Un proceso con participación cero cierra y genera sus actas reportando abstención total.
- [ ] Las 4 actas (apertura, cierre, escrutinio, oficial) se generan en PDF por el worker,
      descargables e imprimibles, y cada generación queda en auditoría.

### Flujo 5 — Autenticación y desbloqueo

- [ ] Google OAuth acepta solo cuentas del dominio institucional configurado; usuario/contraseña
      funciona como alternativa con recuperación de contraseña.
- [ ] N intentos fallidos consecutivos (configurable) bloquean la cuenta; el bloqueo expira solo
      a los 10–15 minutos.
- [ ] El comité puede desbloquear manualmente desde su panel; el desbloqueo queda en auditoría
      con autor y hora.
- [ ] Bloquear una cuenta (automático o manual) invalida su sesión activa de inmediato — la
      sesión vive en el servidor, no en un JWT sin estado (ADR-0004).
- [ ] Todos los inicios y cierres de sesión, y los intentos fallidos, generan eventos de
      auditoría.

### Flujo 6 — Importación de padrón desde Excel

- [ ] Un archivo con filas válidas e inválidas mezcladas importa todas las válidas y reporta
      cada inválida con número de fila y motivo (DNI duplicado, correo inválido, fila vacía,
      formato).
- [ ] El reporte de errores es descargable en CSV; la importación queda en auditoría con
      conteos de válidas/erróneas.
- [ ] Reimportar el mismo archivo no duplica usuarios (idempotencia por DNI/código).

### Flujo 7 — Auditoría

- [ ] Ningún endpoint ni pantalla permite modificar o eliminar eventos de auditoría; los
      triggers de PostgreSQL rechazan UPDATE/DELETE incluso desde el rol de aplicación.
- [ ] La vista de auditoría es solo lectura, filtrable por tipo (sesiones, votos, procesos,
      correos, reportes) y exportable a CSV/PDF; la exportación misma genera un evento.
- [ ] Ninguna vista ni exportación de auditoría vincula la identidad del votante con su
      elección; la elección individual solo es visible para el propio votante en su comprobante
      (ADR-0010).
- [ ] Para cualquier proceso cerrado, la cadena creación → apertura → votos/rechazos → cierre →
      actas es reconstruible completa desde la auditoría.

## Riesgos técnicos abiertos

- **Prueba de carga pendiente**: el criterio de 1,000 votantes concurrentes debe validarse
  contra el tamaño de VPS elegido antes de la primera jornada real (ADR-0007); definir la
  herramienta (k6/artillery) y el escenario (ráfaga de `POST /votos` + polling del panel).
- **Protección de datos de menores en la nube**: fotos, DNI y correos residen en el proveedor
  del VPS; revisar los requisitos de la Ley de Protección de Datos Personales del Perú (región
  del datacenter, cifrado en reposo, consentimiento de las familias). La retención de la
  auditoría ya quedó definida (ADR-0010: inmutable + anonimización tras impugnación); quedan
  pendientes región, cifrado y consentimiento — riesgo heredado del PRD.
- **Redacción del PRD sobre la copia por correo**: el ADR-0009 matiza la decisión original
  (elección visible solo tras autenticarse, no en el cuerpo del correo); actualizar el PRD y las
  bases del proceso electoral para que declaren el mecanismo real.
- **Suplantación por custodia de credenciales**: sin biometría (fuera de alcance), el voto es
  tan confiable como la credencial; mitigado con bloqueo, auditoría y OAuth de dominio, pero el
  riesgo residual persiste — en especial la cuenta compartida padre/estudiante que el PRD ya
  registra como aceptada.
- **Restauración de respaldos no ensayada**: el plan de respaldos del ADR-0007 exige un ensayo
  de restauración completa antes de la primera elección; un respaldo no probado no cuenta. El
  ensayo debe ejecutar el procedimiento de contingencia de jornada completo (ADR-0013:
  restauración a mitad de votación, anulación de códigos, revotos, extensión de cierre y acta de
  incidencias), no solo la restauración técnica.
- **Prototipos HTML desactualizados tras el ADR-0011**: el `Design.md` ya refleja el flujo nuevo
  (banda de calidad "Votando como padre de ▢", sin selección de estudiante ni salto multi-hijo,
  tweak `calidadPadre`), pero los artefactos `SEEI Wireframes.dc.html` y `SEEI Votación.dc.html`
  — que no están en este repositorio — aún muestran el flujo anterior; actualizarlos antes de
  implementar el flujo del votante.
