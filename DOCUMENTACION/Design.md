---
title: "SEEI — Referencia de la interfaz construida (as-built)"
---

# Design.md — SEEI: Sistema de Elecciones Electrónicas para Instituciones Educativas

> **Qué es este documento.** Referencia de la interfaz **tal como está construida hoy**
> (`apps/frontend/src/`). Reemplaza a la versión anterior, que documentaba una fase de
> wireframes de baja fidelidad (sistema "Broadsheet" con Source Serif 4, opciones `1a`–`1i` /
> `3a`–`3e`); ese sistema exploratorio **nunca se implementó** y queda superado por lo que
> describe este texto.
> **Fecha:** 2026-08-31. **Fuentes:** los 20 componentes `*Page.tsx`, `apps/frontend/src/app/rutas.ts`,
> `apps/frontend/src/app/menu-por-rol.ts`, `apps/frontend/src/index.css` y `DESIGN-SYSTEM.md`.
> **Requisitos:** `PRD.md`.

---

## 1. Principios de diseño que sobrevivieron

Los principios de la fase de wireframes que el producto construido efectivamente respeta:

1. **Flujo de votación mobile-first.** `VotacionPage` y sus piezas (`PasoInformacionProceso`,
   `PasoBoleta`, `PasoConfirmacion`, `PanelComprobante`) se diseñan en ancho de teléfono y
   escalan hacia arriba. Las pantallas de gestión asumen escritorio (tablas, filtros, paginación).
2. **La irreversibilidad se declara antes, no después.** El Paso 1 (`PasoInformacionProceso` +
   `iconos-reglas`) enuncia "voto secreto / una sola vez / irreversible" antes de mostrar la
   boleta; el Paso 3 (`PasoConfirmacion`) repite la advertencia y exige consentimiento explícito
   antes de habilitar el botón de emitir.
3. **La hora manda y es del servidor.** Cierre, cuenta regresiva y sello del comprobante se
   muestran siempre como hora del servidor; el `POST /votos` sella la hora en la transacción.
4. **Identidad del votante siempre visible.** `BandaVotandoComo` acompaña los tres pasos y
   declara la calidad del derecho ("Votando como padre/apoderado de …" cuando corresponde,
   ADR-0011); en el comprobante pasa a mostrar la hora de emisión.
5. **Transparencia por defecto, resultados ocultos por defecto.** `ocultar_resultados` nace en
   `true` y queda inmutable al abrir el proceso; con resultados ocultos, `ResultadosPage` y
   `ProyeccionPage` muestran solo participación, nunca conteo por candidato.

---

## 2. Sistema visual (as-built)

Definido en `apps/frontend/src/index.css` como traducción **1:1** del front-matter de
`DESIGN-SYSTEM.md` a tokens de tema de Tailwind v4 (`@theme`). Backlog #24.

- **Tipografía:** **Hanken Grotesk**, fuente variable self-hosted (woff2, eje `wght` 100–900,
  sin itálica, licencia OFL junto al archivo). Cero CDN de tipografía. Ocho escalas
  (`display-lg`, `headline-lg`, `headline-lg-mobile`, `title-md`, `body-lg`, `body-md`,
  `label-md`, `caption`) con line-height y peso acoplados.
- **Color:** paleta de 52 claves 1:1 con `DESIGN-SYSTEM.md`. Primario = **Institution Blue**
  `#000066` (encabezados, botones primarios, borde de tarjeta seleccionada, barra de progreso).
  Secundario = **Academic Red** `#990000` / `#b41d11` (acciones críticas, énfasis institucional).
  Superficies en grises suaves sobre `#f9f9f9`, tarjetas en blanco. `status-warning` `#ffc107`,
  `border-gray` `#d1d5db`.
- **Forma:** radios suaves, base 0.25rem (4px en controles, 8px en tarjetas y bloques). Sombra
  única y muy suave con tinte azul (`0 4px 20px rgba(0,0,102,0.08)`).
- **Modo:** claro, fijo. Sensación "papel" acorde al contexto académico.

---

## 3. Inventario de pantallas construidas

20 componentes `*Page.tsx`. Rutas parseadas por el enrutador propio (`rutas.ts`, unión
discriminada + parser total: cualquier ruta no reconocida cae en `no-encontrada`). El acceso por
rol lo garantiza el backend con `@Roles(...)`; `menu-por-rol.ts` solo decide qué se muestra en la
navegación y en la pantalla de inicio.

### Acceso

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `LoginPage` | (fuera del shell) | público | Ingreso con Google institucional (`BotonGoogle`) o credenciales (`FormularioCredenciales`); recuperación de contraseña. Nunca distingue "cuenta bloqueada" de "credencial inválida". | `DialogoVinculacion` (flujo 409 vinculación Google), `IconoEscudo` |
| `InicioPage` | `/` | todos menos estudiante | Saludo por rol + grilla de tarjetas derivada del mismo `MENU_POR_ROL` que la navegación. Sin lógica de negocio. Estado vacío explícito para `docente`. | — |

### Votante

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `MisVotacionesPage` | `/mis-votaciones` (y `/` para estudiante) | estudiante | Lista `GET /votos/mis-derechos`: derechos de voto vigentes en procesos abiertos, agrupables por calidad (`en_calidad_de`), sin exponer la elección. Derecho ya ejercido se muestra bloqueado. | — |
| `VotacionPage` | `/votar/:derechoVotoId` | estudiante | Flujo de 3 pasos: información → boleta → confirmación → comprobante. Clave de idempotencia en `sessionStorage`. Rechazos con pantalla específica. | `PasoInformacionProceso`, `PasoBoleta` (`TarjetaCandidato` / `TarjetaLista` / `TarjetaOpcion` / `TarjetaVotoBlanco`), `PasoConfirmacion`, `BandaVotandoComo`, `BarraProgresoVotacion`, `PantallaRechazo`, `PanelComprobante` |
| `ComprobantePage` | `/comprobante/:votoId` | estudiante | Relee el comprobante tras autenticarse (enlace del correo de #15 o URL directa). `403` no distingue voto ajeno de id inexistente. | `PanelComprobante` |

### Gestión de procesos

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `ProcesosIndexPage` | `/procesos` | administrador, director, comité | Índice de procesos; "Abrir proceso" solo aparece en estado `borrador`. Punto de entrada a candidatos y apertura. | — |
| `ProcesoWizardPage` | `/procesos/nuevo` | administrador, director, comité | Asistente de 4 pasos: Datos → Público y segmentación → Padrón en vivo → Revisión. Navegación local sin router. | `PasoDatos`, `PasoPublico`, `PasoPadron` (`usePadronEnVivo`), `PasoRevision`, `PasoIndicador` |
| `AperturaProcesoPage` | `/procesos/:id/abrir` | administrador, director, comité | Confirmación de apertura; los conteos reales del padrón congelado viajan en el `200` de `abrir()`. | `PanelConfirmacionApertura` |

### Candidatos

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `GestionCandidatosPage` | `/procesos/:id/candidatos` | administrador, director, comité | Tabla de candidatos/listas con estado (incl. dado de baja), o panel de opciones A/B/C para consultas. Baja con momento registrado. | `TablaCandidatos`, `PanelOpcionesConsulta`, `FormularioLista` |
| `RegistroCandidatoPage` | `/procesos/:id/candidatos/nuevo` y `/:candidatoId` | administrador, director, comité | Alta/edición de candidato: foto, número, símbolo, lema, propuesta, plan de trabajo en PDF. | `FormularioCandidato`, `CampoArchivo` |

### Administración académica

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `AcademicaPage` | `/academica` | administrador, director (lectura: comité) | CRUD del árbol académico de 6 entidades por pestañas locales: años escolares, niveles, grados, secciones, aulas, matrículas. Un solo año activo. Gate fail-closed a solo lectura. | `PanelAniosEscolares`, `PanelNiveles`, `PanelGrados`, `PanelSecciones`, `PanelAulas`, `PanelMatriculas` |

### Administración de usuarios

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `UsuariosPage` | `/usuarios` | administrador, director | Listado filtrable por rol/estado con paginación en cliente; abre la ficha en estado de componente. | `TablaGenerica` |
| `FichaUsuarioPage` | (dentro de `UsuariosPage`) | administrador, director | Alta/edición de usuario (5 roles, un solo set de campos) + apoderados vinculados. | `FormularioGenerico`, `PanelApoderados`, `DialogoConfirmacion` |
| `CuentasBloqueadasPage` | `/cuentas-bloqueadas` | comité | Lista de cuentas bloqueadas y desbloqueo manual auditado (`bloqueado_hasta`). Gate `rol === 'comite'`, disjunto del de usuarios. | `TablaGenerica`, `DialogoConfirmacion` |

### Configuración

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `ConfiguracionPage` | `/configuracion` | administrador, director | Singleton institucional: datos (nombre, director, zona horaria, SMTP, dominio Google), logo, integrantes del comité (nombres que se imprimen en actas). | `PanelDatosInstitucionales`, `PanelLogo`, `PanelComite` |

### Importación

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `ImportacionExcelPage` | `/importacion-excel` | administrador, director | Carga de `.xlsx`/`.csv` (5 MB, 2000 filas) con validación previa en cliente; resumen y tabla de errores fila a fila; descarga del CSV de errores. Máquina de estados con unión discriminada. | `CampoArchivo`, `ResumenImportacion`, `TablaErroresImportacion` |

### Panel de jornada

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `PanelJornadaPage` | `/panel-jornada` | administrador, director, comité | Monitoreo en vivo (polling React Query): proceso activo, estado, métricas de participación / votos / correos fallidos, distribución de votos, votos por hora, avance por aula. Sin endpoints nuevos. | `EncabezadoPanel`, `SelectorProcesoActivo`, `FilaEstadoProceso`, `TarjetasMetricasProceso`, `PanelDistribucionVotos`, `GraficoVotosPorHora`, `TablaAvanceAulas` |
| `ProyeccionPage` | `/proyeccion/:procesoId` | administrador, director, comité | Modo kiosco para pantalla grande: sondeo cada 30 s, sin controles. El payload nunca trae desglose por candidato (ADR-0016). Se monta fuera del shell para sobrevivir a un recargo. | `GraficoVotosPorHora`, `TablaAvanceAulas` |

### Resultados

| Pantalla | Ruta | Rol | Propósito | Piezas clave |
|---|---|---|---|---|
| `ResultadosPage` | `/resultados/:procesoId` | todos (según visibilidad) | Participación siempre visible; desglose por lista/opción con votos y porcentaje solo si los resultados están visibles, si no `AvisoResultadosOcultos`. Polling React Query. | `PanelParticipacion`, `GraficoDesglose`, `AvisoResultadosOcultos` |

### Diagnóstico

| Pantalla | Ruta | Rol | Propósito |
|---|---|---|---|
| `HealthPage` | `/health` (contrato local) | operación | Estado de `db` / `redis` / último ping del worker. |

### Pantallas de rechazo y borde

`apps/frontend/src/votos/piezas/PantallaRechazo.tsx` implementa las 4 variantes con pantalla
propia dentro de `VotacionPage`:

- **`fuera-padron`** — "No estás en el padrón".
- **`cerrada`** — "Votación cerrada", con la hora exacta de cierre.
- **`ya-votaste`** — "Ya emitiste tu voto", con enlace al comprobante.
- **`sin-conexion`** — "Sin conexión al confirmar", única variante con acción de reintento
  (porque acá sí puede cambiar el resultado); nunca deja un voto a medias.

El caso `403` (sesión/derecho ajeno o inexistente) no tiene variante visible propia: se resuelve
en el enrutamiento, sin cuerpo discriminante, para no abrir un oráculo de enumeración.

---

## 4. Cobertura de los casos borde del PRD

| Caso borde (PRD) | Dónde se resuelve en el código |
|---|---|
| Corte de conexión en el paso 3 | `PantallaRechazo` variante `sin-conexion` en `VotacionPage` — reintentar, sin voto a medias; la transacción no confirmada no deja fila en `Voto`. |
| Doble clic / doble envío | Clave de idempotencia en `sessionStorage` + `UNIQUE (proceso, derecho)`; el botón de emitir se bloquea al primer toque (`PasoConfirmacion`); evento `RECHAZO` en auditoría. |
| Votante llega justo al cierre | Hora del servidor sellada en el `POST /votos`; a `hh:cierre` o después, `PantallaRechazo` variante `cerrada`. |
| Padre con varios hijos | Un inicio de sesión por hijo (ADR-0011); `BandaVotandoComo` declara la calidad; `MisVotacionesPage` agrupa por `en_calidad_de`. |
| Estudiante sin correo o correo inválido | `PanelComprobante` muestra que la copia por correo puede fallar sin invalidar el voto; evento `CORREO_FALLIDO`; contador en `PanelJornadaPage` (`TarjetasMetricasProceso`). |
| Empate | Declarado en el acta de escrutinio (worker), sin resolución automática; `GraficoDesglose` muestra el empate. |
| Participación cero | El proceso cierra y genera sus actas reportando abstención total; `PanelParticipacion` lo refleja. |
| Candidato dado de baja con votación abierta | Estado en `TablaCandidatos`; desaparece de la boleta para nuevos votantes y conserva los votos ya emitidos; el acta de escrutinio refleja la baja. |
| Excel con errores | `TablaErroresImportacion` reporta fila por fila sin abortar la carga válida; CSV de errores descargable. |
| Usuario bloqueado durante la jornada | `CuentasBloqueadasPage` (comité) para desbloqueo manual auditado; expiración automática de `bloqueado_hasta`. |
| Cambios de aula tras generar el padrón | El padrón se congela al abrir (`AperturaProcesoPage`); los cambios posteriores no afectan el proceso abierto; apertura registrada en auditoría. |
| Zona horaria / hora del servidor | Hora del servidor en encabezado del panel, cierre y comprobante. |
| Resultados ocultos a mitad del proceso | `ocultar_resultados` inmutable al abrir; `ResultadosPage` y `ProyeccionPage` degradan a solo participación. |
| Secreto del voto vs. copia por correo | Consentimiento explícito en `PasoConfirmacion` antes de habilitar el botón de emitir; el correo nunca lleva la elección (ADR-0009). |

---

## 5. Brechas conocidas frente a la visión completa

- **Sin vista de auditoría de solo lectura** (backlog #21, pendiente). El motor append-only y el
  bloqueo estructural identidad↔elección (ADR-0016) están construidos y todos los flujos
  registran eventos, pero no hay pantalla ni endpoint de consulta/exportación de la auditoría.
- **Sin pantalla de contingencia de jornada** (backlog #22, pendiente): extensión de cierre
  auditada, anulación de códigos, revoto, acta de incidencias (ADR-0013).
- **Sin ficha de candidato ampliada en la boleta**: la tarjeta enlaza al plan de trabajo (PDF)
  pero no abre una hoja inferior con propuesta y plan dentro del flujo.
- **Sin vista pública de resultados** fuera de la sesión autenticada, si la institución llegara
  a quererla.
- **Validación con usuarios reales pendiente** (backlog #23): el criterio del PRD de "flujo
  completo en menos de 3 minutos" y el ensayo de jornada completa no se pueden verificar solo
  por código.

---

## Anexo — Historia

Existió una versión anterior de este documento con wireframes de baja fidelidad (sistema visual
"Broadsheet", Source Serif 4, cian `#0088b0`; opciones etiquetadas `1a`–`1i` y `3a`–`3e`, con
artefactos `.dc.html`). Fue trabajo exploratorio de la fase de wireframes y **no se construyó**:
el producto adoptó el sistema de `DESIGN-SYSTEM.md` (Hanken Grotesk / Institution Blue) en el
backlog #24. Este documento describe únicamente lo que está en el código.
