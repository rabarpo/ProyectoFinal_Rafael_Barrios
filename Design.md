---
title: "SEEI — Documento de Diseño (fase de wireframes)"
---

# Design.md — SEEI: Sistema de Elecciones Electrónicas para Instituciones Educativas

> Fase: **wireframes de baja fidelidad**. Este documento registra las vistas propuestas, las decisiones de estructura y flujo, y lo que queda pendiente de definir.
> Artefactos: `SEEI Wireframes.dc.html` (wireframes)  ·  `SEEI Votación.dc.html` (alta fidelidad del flujo de votación)
> Lienzo de wireframes: `SEEI Wireframes.dc.html` (lienzo con zoom libre; cada opción tiene un id estable `1a`…`1i`).
> Fuente de requisitos: `uploads/PRD.md`.

---

## 1. Principios de diseño

1. **Mobile-first real, no adaptado.** El flujo de votación se diseña en un ancho de teléfono (~280–390 px) y escala hacia tablet y escritorio. Las vistas de gestión del comité nacen en escritorio, donde se trabaja con tablas y padrones.
2. **El voto es irreversible: el diseño lo declara antes, no después.** Cada paso previo a la confirmación repite que el voto es único e inmodificable; la pantalla de confirmación es la única con acción destructiva-irreversible y se separa visualmente del resto.
3. **La hora manda y es del servidor.** Cierre, cuenta regresiva y sello del comprobante siempre se muestran como "hora del servidor" para que el votante no discuta con el reloj de su teléfono.
4. **Identidad del votante siempre visible.** En especial para el padre que representa a varios estudiantes: una banda fija indica "Votando por ▢ nombre · 3° A" durante los tres pasos.
5. **Transparencia por defecto, resultados ocultos por defecto.** Auditoría y actas siempre accesibles; los resultados en vivo se ocultan hasta el cierre como configuración recomendada.
6. **Sistema visual Broadsheet.** Fondo papel `#f3f2f2`, tinta `#201e1d`, Source Serif 4 en todo (también en la interfaz), cian `#0088b0` como único color interactivo y magenta `#d6006c` reservado para advertencias y estados de rechazo. Jerarquía por escala tipográfica y espacio en blanco, sin cajas decorativas.
7. **Baja fidelidad intencional.** Fotos como marcos con cruz, textos como barras grises, `▢` para datos por definir. La discusión en esta fase es de estructura y flujo, no de arte final.

---

## 2. Inventario de vistas propuestas

### 2.1 Flujo de votación (móvil) — tres enfoques alternativos

Los tres cubren el requisito de "votación en 3 pasos" del PRD; hay que **elegir uno**.

| id | Enfoque | Cómo funciona | A favor | En contra |
| --- | --- | --- | --- | --- |
| `1a` ✅ | **Boleta en tarjetas** | Una tarjeta por candidato con foto, número, símbolo, enlaces a propuesta y plan, y botón "Votar por esta lista" dentro de la tarjeta. Incluye paso 1 (info), paso 2 (boleta), paso 3 (confirmación) y comprobante. | Máxima información por candidato; se parece a la papeleta física; el botón está donde está la atención. | Scroll largo con 4+ listas; comparar candidatos exige recorrer la pantalla. |
| `1b` | **Boleta compacta + ficha** | Lista de una línea por candidato con radio de selección; `›` abre la ficha completa en hoja inferior sin salir de la boleta. Paso 3 como revisión con cuenta regresiva. | Todo el cargo cabe sin scroll; comparar es inmediato; separa "elegir" de "informarse". | La foto se ve pequeña en la boleta; requiere un segundo toque para ver propuestas. |
| `1c` | **Asistente por cargo** | Un cargo por pantalla con rejilla de fotos, indicador de progreso, y resumen final de los N cargos que se confirman en una sola transacción. | Ideal para municipio escolar con varios cargos; imposible saltarse un cargo por error. | Más pantallas; se siente largo cuando el proceso tiene un solo cargo. |

**Decisión tomada: `1a` — boleta en tarjetas.** Es el enfoque más cercano a la papeleta física, lo que reduce la curva de aprendizaje en toda la comunidad educativa. Desarrollado en el turno 2 del lienzo (`2a`): banda fija de contexto del votante (desde el ADR-0011, banda de **calidad**: "Votando como padre/apoderado de ▢" cuando el derecho es del padre), tarjeta = lista con sus cargos, variante de consulta institucional con Opción A/B/C, y comprobante. El enlace del comprobante al siguiente estudiante pendiente quedó retirado (ADR-0011: un inicio de sesión por hijo). `1b` y `1c` quedan archivados como referencia.

**Pantallas de rechazo y borde** (incluidas en `1c`, aplican a los tres enfoques):

- Ya emitiste tu voto — con fecha y hora del registro.
- Votación cerrada — con la hora exacta de cierre según servidor.
- No estás en el padrón — con acción "reportar al comité".
- Sin conexión al confirmar — "tu voto no se registró", botón reintentar; nunca estado intermedio.
- Cuenta bloqueada — expiración corta o desbloqueo por el comité durante la jornada.

### 2.2 Acceso y contexto del votante — `1d`

- **Inicio de sesión:** Google institucional como acción primaria; usuario/DNI/código + contraseña como alternativa; recuperación de contraseña; aviso de bloqueo por intentos fallidos.
- **Mis votaciones:** procesos abiertos con cuenta regresiva y botón "Votar"; procesos ya votados con etiqueta `VOTADO` y acceso al comprobante; próximas y cerradas agrupadas aparte. Navegación inferior: Votar · Resultados · Perfil.
- **Calidad del derecho (reemplaza a la selección de estudiante representado, ADR-0011):** no existe vista de selección de estudiante — el padre inicia sesión en la cuenta de cada hijo. En "Mis votaciones", una consulta a toda la comunidad muestra **dos entradas separadas** — el derecho propio del estudiante y el derecho "como padre/apoderado" — cada una con su estado pendiente/`VOTADO` y su comprobante.

### 2.3 Gestión — comité electoral y administración (escritorio)

| id | Vista | Contenido clave |
| --- | --- | --- |
| `1e` | **Panel de jornada** | Hora del servidor y cierre; participación, votos emitidos, pendientes y correos fallidos; votos por hora; avance por aula (aulas rezagadas en magenta); acciones "acta de cierre" y "nuevo proceso"; recordatorio a pendientes. |
| `1f` | **Crear proceso electoral** | Asistente de 4 pasos (datos → público → cargos y candidatos → revisión). En el paso mostrado: tipo de proceso, quiénes votan, nivel/grados/aulas como etiquetas, apertura y cierre, casilla "ocultar resultados hasta el cierre" activa por defecto, y **padrón calculado en vivo** con el aviso de que se congela al abrir. |
| `1g` | **Candidatos y padrón** | Tabla de candidatos con número, foto, cargo, aula y estado (incluye `DADO DE BAJA` y su regla); formulario de registro con foto, número de lista, símbolo, lema, propuesta y plan de trabajo en PDF. Debajo: **importación de Excel** con conteo de filas válidas/erróneas, tabla de errores fila por fila (DNI duplicado, correo inválido, fila vacía), importar solo las válidas y descargar errores en CSV. |
| `1h` | **Resultados y escrutinio** | Barras por lista con votos y porcentaje; blancos, nulos, abstenciones y padrón; dona de participación; nota de empate declarado en acta; exportación PDF/Excel y "publicar resultados"; y la vista que ve el votante mientras los resultados están ocultos. |
| `1i` | **Actas y auditoría** | Actas de apertura, cierre, escrutinio y acta oficial, con estado, descarga en PDF, previsualización e impresión directa. Auditoría filtrable (sesiones, votos, procesos, correos, reportes) en **solo lectura**, sin acciones de editar ni eliminar, exportable a CSV/PDF. |

---

## 3. Cómo los wireframes cubren los casos borde del PRD

| Caso borde (PRD) | Dónde se resuelve en el diseño |
| --- | --- |
| Corte de conexión en el paso 3 | Pantalla "Sin conexión al confirmar" (`1c`) — reintentar, nunca voto a medias. |
| Doble clic / doble envío | Nota de bloqueo del botón al primer toque (`1a` paso 3) + evento `RECHAZO` en auditoría (`1i`). |
| Votante llega justo al cierre | Cuenta regresiva en el paso 3 (`1b`) con la regla explícita: vale la hora de la confirmación. |
| Padre con varios hijos | Un inicio de sesión por hijo (ADR-0011); la banda fija declara la calidad "Votando como padre de ▢" y "Mis votaciones" separa el derecho del estudiante del derecho del padre (`1d`). |
| Estudiante sin correo o correo inválido | Comprobante con estado de envío (`1a`) y evento `CORREO` fallido en auditoría (`1i`); contador de correos fallidos en el panel (`1e`). |
| Empate | Nota en resultados: el sistema declara el empate en el acta, el comité resuelve (`1h`). |
| Participación cero | El panel y las actas se generan igual; abstención total se lee en los contadores (`1e`, `1h`). |
| Candidato dado de baja con votación abierta | Estado `DADO DE BAJA` y regla en `1g`; el acta de escrutinio lo refleja (`1i`). |
| Excel con errores | Reporte fila por fila sin abortar la carga válida (`1g`). |
| Usuario bloqueado durante la jornada | Pantalla de cuenta bloqueada con expiración corta o desbloqueo por el comité (`1c`). |
| Cambios de aula tras generar el padrón | Aviso de congelamiento del padrón al abrir el proceso (`1f`); apertura registrada en auditoría (`1i`). |
| Zona horaria / hora del servidor | Etiqueta "hora del servidor" en panel, cierre y comprobante (`1a`, `1e`). |
| Resultados ocultos a mitad del proceso | Configuración visible en `1f` y estado del votante en `1h` — falta decidir si es modificable con la votación abierta. |
| Secreto del voto vs. copia por correo | Casilla de consentimiento en el paso 3 (`1a`): el votante reconoce que recibirá una copia con su elección. |

---

## 4. Sistema visual aplicado (Broadsheet)

- **Color:** fondo `#f3f2f2`; texto `#201e1d` y grises `#4c4846` / `#8c8886`; relleno de marcador `#dedbd8` / `#e8e6e3`; cian `#0088b0` (interacción, estado positivo, énfasis de dato) y magenta `#d6006c` / `#a30053` (advertencia, rechazo, dato crítico). Nunca los dos acentos en el mismo componente pequeño.
- **Tipografía:** Source Serif 4 en toda la interfaz, incluida la interfaz de gestión; monoespaciada solo para etiquetas de estructura, códigos, horas y números de lista. Cursiva del serif para lemas y citas.
- **Estructura:** alineación a la izquierda, jerarquía por escala y espacio en blanco; sin divisores decorativos. Reglas finas solo como cabecera de tabla o separador de filas de datos.
- **Radios:** 2–3 px en controles; 10 px solo en el marco del teléfono, que es andamiaje del wireframe, no del producto.

---

## 5. Decisiones tomadas

- **Enfoque de votación: `1a` / `2a`** — boleta en tarjetas.
- **Municipio escolar: lista cerrada.** Un solo voto por lista cubre alcalde, teniente alcalde y regidores; la tarjeta enumera los tres cargos y el escrutinio se reporta por lista, no por cargo.
- **Voto del padre: con la cuenta del estudiante (ADR-0011, fase de arquitectura).** Este documento ya está alineado a esa decisión: se retiraron la vista de selección de estudiante representado (`1d`), el salto "votar por mi otro hijo" del comprobante y el tweak `contextoPadre` (→ `calidadPadre`). La banda fija declara la calidad — "Votando como padre/apoderado de ▢ · 3° A" — y, en consultas a toda la comunidad, "Mis votaciones" muestra por separado el derecho propio del estudiante y el derecho en representación del padre. Un padre con N hijos inicia sesión en la cuenta de cada uno. **Pendiente:** reflejar el cambio en los artefactos HTML (`SEEI Wireframes.dc.html`, `SEEI Votación.dc.html`), que aún muestran el flujo anterior.

## 6. Decisiones pendientes

1. **Visibilidad de resultados:** ¿puede el comité cambiarla con la votación ya abierta? El diseño actual la muestra como configuración previa.
2. **Voto nulo:** el PRD lo reporta en resultados, pero no está definido cómo se produce en una boleta digital (¿existe la opción explícita o solo blanco?).
3. **Desbloqueo de cuenta durante la jornada:** definir el mecanismo (expiración corta vs. desbloqueo manual del comité) para poder diseñar la pantalla del comité.
4. **Protección del contenido del correo** que incluye la elección realizada (¿PDF con contraseña, enlace autenticado, texto plano?).

---

## 7. Turno 3 — vistas completadas

| id | Vista | Contenido clave |
| --- | --- | --- |
| `3a` | **Resultados de consulta + modo proyección** | Barras por Opción A/B/C con votos y porcentaje, desglose por público (estudiantes/padres/docentes), participación, y nota de que las consultas solo generan acta de resultados. Debajo, el modo proyección para pantalla grande: participación, votos y aulas rezagadas — **sin resultados por candidato**, para no influir en quienes aún no votan. |
| `3b` | **Notificaciones** | Tabla de disparadores (inicio, recordatorio, cierre próximo, publicación, copia del voto) con destino y estado; editor de plantilla con variables; ritmo de envío por lotes para no chocar con los límites del SMTP; y la bandeja interna del votante en móvil como respaldo cuando el correo falla. |
| `3c` | **Configuración general** | Institución, director, año escolar activo, zona horaria, comité electoral (los nombres que se imprimen en las actas), logo, SMTP con correo de prueba, y Google Workspace restringido al dominio institucional. |
| `3d` | **Académico, usuarios y lote por aula** | Árbol nivel/grado/sección/turno con conteos; usuarios filtrables por rol con estado y acción rápida "desbloquear" durante la jornada; y creación **en lote** de los procesos de representante de aula, bloqueando las aulas sin candidatos. |
| `3e` | **Reportes** | Selector de tipo (participación, votantes, abstenciones, resultados, candidatos, consultas), filtros y agrupación, previsualización con gráfico y tabla totalizada, y exportación a Excel/PDF/CSV registrada en auditoría. |

### Aún sin wireframe

- Recuperación y cambio de contraseña (pantallas de correo y formulario).
- Perfil del votante (datos, correo de contacto, historial de participación).
- Vista de resultados públicos para la comunidad (fuera de la sesión del comité), si la institución la quiere.

---

## 8. Alta fidelidad — flujo de votación (`SEEI Votación.dc.html`)

Prototipo **funcional** del enfoque `2a`, mobile-first: una columna de 430 px máximo centrada en la hoja, que a ancho de teléfono ocupa la pantalla completa.

### Recorrido implementado

1. **Paso 1 · información** — kicker de tipo de proceso, título en serif a 31 px, bajada, y tres datos en filas con regla fina: cierre, votante y padrón. Aviso en tinte cian: "tu voto es único e inmodificable".
2. **Paso 2 · boleta** — una tarjeta por lista con foto (hueco de imagen que el usuario rellena), número en recuadro, símbolo, título, lema, y los **tres cargos de la lista cerrada** listados bajo una regla fina. Enlaces a propuesta y plan de trabajo. El botón "Votar por la lista N" cambia a "✓ Elegida" y la tarjeta gana borde cian de 2 px. Voto en blanco como opción de borde discontinuo al final. "Continuar" deshabilitado hasta que haya selección.
3. **Paso 3 · confirmación** — advertencia en tinte magenta ("este paso no tiene vuelta atrás"), resumen de la selección en marco de 2 px con enlace "cambiar mi elección", datos del proceso/votante/hora del servidor, y casilla de consentimiento de la copia por correo. El botón de emitir permanece deshabilitado hasta aceptar, y durante el registro muestra "Registrando tu voto…" ignorando toques repetidos.
4. **Comprobante** — código de voto, hora del servidor, proceso y elección concreta; aviso de la copia por correo y de que un fallo de envío no invalida el voto. Si la cuenta tiene otro derecho pendiente en la misma jornada (consulta a toda la comunidad: estudiante + padre), enlaza a ese derecho; para votar por otro hijo se cierra sesión y se entra con su cuenta (ADR-0011 — el salto "votar por mi otro hijo" quedó retirado).

### Estado y comportamiento

- Banda superior fija en tinta con la calidad del derecho — "Votando como padre/apoderado de ▢ · 4° B" cuando el derecho es del padre; en el voto propio del estudiante la banda muestra solo su nombre y aula — y el cierre a la derecha; en el comprobante pasa a mostrar la hora de emisión (ADR-0011).
- Indicador de progreso de tres barras: paso actual en cian, pasos completados en cian claro.
- El botón de emitir se bloquea al primer toque (estado `emitiendo`), cumpliendo la regla de doble envío.
- Al pasar al siguiente derecho pendiente de la misma cuenta (estudiante → como padre) se reinician selección y consentimiento; no hay contador de hijos pendientes (ADR-0011).

### Tweaks expuestos

| Prop | Efecto |
| --- | --- |
| `tipoProceso` | Alterna entre municipio escolar (listas con foto y cargos) y consulta institucional (Opción A/B/C sin fotos), reescribiendo títulos, instrucciones y textos de botón. |
| `calidadPadre` | Muestra la banda "Votando como padre/apoderado de ▢" cuando el derecho votado es del padre; sin salto entre hijos (ADR-0011 — reemplaza al antiguo `contextoPadre`, obsoleto en el prototipo HTML). |
| `horaCierre` | Hora de cierre en banda, paso 1 y comprobante. |
| `votanteNombre` | Nombre y aula del votante. |

### Tokens usados

Ground `--color-bg` con la hoja sobre `--color-neutral-200`; tinta `--color-text`; cian `--color-accent` para toda acción y `--color-accent-100/900` para el aviso informativo; magenta solo como `--color-accent-2-100/900` en la advertencia de irreversibilidad. Tipografía `--font-heading`/`--font-body` (Source Serif 4), espaciado `--space-*`, radios `--radius-sm/md`, sombra `--shadow-lg` en la hoja y `--shadow-sm` en la tarjeta elegida.

### Pendiente en alta fidelidad

- Pantallas de rechazo y borde (ya votó, fuera de horario, sin padrón, sin conexión, cuenta bloqueada) — wireframeadas en `1c`, aún sin versión final.
- Ficha de candidato completa (propuesta y plan de trabajo): los enlaces existen pero no abren la hoja inferior.
- "Mis votaciones" con los dos derechos separados de una consulta a toda la comunidad — propio y "como padre/apoderado" — con estado y comprobante por derecho (ADR-0011; reemplaza a la antigua selección de estudiante representado de `1d`).
- Ingreso con Google / credenciales.
- Vistas del comité en alta fidelidad (`1e`–`1i`, `3a`–`3e`).

---

## 9. Siguientes pasos sugeridos

1. Completar en alta fidelidad las pantallas de rechazo y la ficha de candidato, que son lo que falta para probar el flujo completo del votante.
2. Cerrar los tres wireframes restantes de la sección 7 si entran en el alcance de esta versión.
3. Llevar a alta fidelidad el panel del comité (`1e`) y los resultados (`1h`), que son las vistas con más carga de datos.
4. Validar el flujo con 5 estudiantes y 3 padres en teléfono propio, midiendo el criterio de éxito: flujo completo en menos de 3 minutos.
5. Revisar accesibilidad en la implementación: tamaños de toque ≥ 44 px, foco visible con el anillo cian de 2 px, y texto de párrafo en acento siempre en el paso 700 o más oscuro.
