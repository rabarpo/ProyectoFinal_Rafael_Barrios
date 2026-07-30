---
title: "SEEI — Sistema de Elecciones Electrónicas para Instituciones Educativas"
---

# PRD: SEEI — Sistema de Elecciones Electrónicas para Instituciones Educativas

## Problema

Los procesos electorales dentro de una institución educativa (municipio escolar, representantes de aula, APAFA, consultas institucionales) se realizan hoy con papeletas físicas: son lentos de organizar, propensos a errores de conteo, difíciles de auditar y consumen tiempo del personal en escrutinio manual. Además, la participación se limita a quienes están físicamente presentes el día de la votación. La institución necesita una forma segura, transparente y eficiente de ejecutar todo el ciclo electoral — desde la inscripción de candidatos hasta la publicación oficial de resultados — sin papel y con trazabilidad completa.

## Usuario objetivo

Comunidad educativa de una institución escolar:

- **Estudiantes** — votan en elecciones de municipio escolar, representante de aula y consultas.
- **Padres de familia** — votan en elecciones de APAFA, comités de aula y consultas, usando la cuenta asociada al estudiante que representan (un voto por estudiante).
- **Docentes** — participan en consultas institucionales.
- **Comité Electoral** — configura procesos, supervisa la jornada y emite actas oficiales.
- **Administradores / Dirección** — gestionan usuarios, estructura académica y configuración general.

El acceso será desde cualquier dispositivo con Internet (computadora, tablet o teléfono móvil).

## Objetivo / resultado esperado

La institución puede crear, ejecutar y cerrar cualquier proceso electoral o consulta de forma 100% digital: los votantes habilitados emiten un único voto verificado desde su dispositivo, los resultados se calculan automáticamente (con opción de ocultarlos hasta el cierre), se generan actas oficiales exportables, y todo evento queda registrado en una auditoría inmutable. Se elimina el conteo manual y las papeletas físicas.

## Alcance (qué sí incluye esta versión)

**Tipos de proceso soportados:**

- Elección del Municipio Escolar (alcalde, teniente alcalde, regidores y otros cargos definidos por la institución).
- Elección de Representante de Aula (delegado, subdelegado, representante), con un proceso independiente por aula.
- Elección de Representantes de Padres de Familia (delegado de aula, junta directiva, APAFA, comité de aula).
- Consultas institucionales (uniforme, paseos, actividades, horarios, talleres, etc.) dirigidas a estudiantes, padres, docentes o toda la comunidad.

**Plataforma:**

- Aplicación web utilizable tanto en escritorio como en móvil, con enfoque **mobile-first**: la interfaz se diseña primero para teléfono (donde votará la mayoría) y escala hacia tablet y computadora. Todos los flujos — en especial la votación en 3 pasos — deben ser completamente operables desde un teléfono.

**Módulos:**

1. **Autenticación** — usuario/contraseña, Google OAuth con correo institucional, recuperación y cambio de contraseña, bloqueo temporal por intentos fallidos, cierre seguro de sesión y registro de accesos.
2. **Administración de usuarios** — estudiantes, padres, docentes, administradores, comité electoral y directores; con nombre, DNI, código, correo, estado y rol.
3. **Administración académica** — años escolares, niveles, grados, secciones, aulas y turnos, para segmentar correctamente las elecciones.
4. **Administración de procesos electorales** — creación con nombre, descripción, tipo, fecha, horas de inicio/cierre, estado, público objetivo, nivel, grados y aulas participantes.
5. **Administración de candidatos** — registro con fotografía, nombres, apellidos, grado, aula, número de lista, símbolo, plan de trabajo, propuesta y lema; para consultas se registran opciones simples (Opción A, B, C…).
6. **Administración de votantes** — registro de estudiantes, padres y docentes; importación desde Excel; asignación automática de padrón (quién vota, en qué proceso, cantidad máxima de votos).
7. **Votación en 3 pasos** — (1) información del proceso, (2) lista de candidatos con foto, número, símbolo, propuestas y botón de votar, (3) confirmación. El voto emitido es único, inmodificable e irrepetible; se envía por correo electrónico una copia con el código de voto, la hora y un **enlace autenticado al comprobante completo**, que muestra la elección concreta realizada tras iniciar sesión con la cuenta del votante (la elección no viaja en el cuerpo del correo — ver ADR-0009).
8. **Validación del derecho al voto** — usuario activo, proceso abierto, no haber votado previamente y pertenencia al padrón.
9. **Resultados en tiempo real** — gráficos de barras y pastel, porcentajes, número de votos, participación, abstenciones, votos nulos y blancos; con opción de ocultarlos hasta el cierre según configure el comité electoral. *Nota (ADR-0008):* en la boleta digital no existen marcas inválidas — el voto nulo no puede producirse y se reporta siempre en 0 (con nota explicativa en el acta); la abstención de preferencia se expresa con el voto en blanco explícito.
10. **Actas electorales** — generación automática de acta de apertura, cierre, escrutinio y acta oficial de resultados; exportación a PDF e impresión directa.
11. **Reportes** — participación, votantes, abstenciones, resultados, candidatos y consultas; exportación a Excel, PDF y CSV.
12. **Dashboard** — procesos activos, cantidad de estudiantes y padres, porcentaje de participación, resultados rápidos y gráficos estadísticos.
13. **Auditoría** — registro completo e inmutable de sesiones, creación de procesos, registro de candidatos, modificaciones, emisión de votos, consultas y generación de reportes. Ningún evento se elimina. *Nota (ADR-0010):* el evento de voto no contiene la elección — la auditoría nunca vincula identidad con elección, que solo es visible para el propio votante en su comprobante — y la retención se precisa como inmutabilidad total desde la aplicación, con anonimización administrativa auditada de datos personales tras el año escolar más el período de impugnación.
14. **Configuración general** — logo, nombre de la institución, director, comité electoral, año escolar, colores institucionales, correo SMTP e integración con Google.
15. **Notificaciones** — correo y notificaciones internas para inicio de votación, recordatorios, cierre próximo y publicación de resultados.

## No alcance (qué explícitamente no incluye esta versión)

- **Aplicaciones nativas de tienda** (iOS/Android) — la experiencia móvil se cubre con la web *mobile-first* (ver Alcance); no se publican apps en App Store / Play Store.
- **Multi-institución / multi-tenant** — el sistema se configura para una sola institución educativa por instancia.
- **Votación presencial asistida con hardware dedicado** (kioscos, urnas electrónicas físicas, lectores biométricos).
- **Verificación de identidad biométrica o con DNI electrónico** — la identidad se valida por credenciales y padrón, no por biometría.
- **Integración con sistemas académicos externos** (SIAGIE u otros SIS) — la carga de datos se hace por registro manual o importación Excel.
- **Notificaciones por SMS o WhatsApp** — solo correo electrónico y notificaciones internas.
- **Firma digital certificada de actas** — las actas se generan en PDF sin certificación criptográfica de terceros.
- **Modo offline** — se requiere conexión a Internet para votar.

## Criterios de éxito

- Un proceso electoral completo (creación → votación → cierre → acta oficial) se ejecuta de punta a punta sin intervención manual en el conteo.
- **0 votos duplicados**: ningún votante puede emitir más de un voto por proceso, verificable contra el registro de auditoría.
- El 100% de los votos emitidos genera su copia de confirmación por correo electrónico.
- Los resultados y actas coinciden exactamente con los votos registrados en auditoría (escrutinio reproducible).
- El votante completa el flujo de 3 pasos en menos de 3 minutos desde el inicio de sesión, en móvil o escritorio.
- El sistema soporta la votación simultánea del padrón completo de la institución (matrícula de 500 a 1,000 estudiantes: se dimensiona para 1,000 votantes concurrentes) sin caída del servicio durante la jornada.
- Fuera del horario configurado (antes de la hora de inicio o después del cierre) el sistema rechaza el 100% de los intentos de voto.
- Ningún registro de auditoría puede modificarse ni eliminarse desde la aplicación.
- Participación registrada (votos + abstenciones + nulos + blancos) cuadra con el total del padrón en cada proceso.

## Casos borde a contemplar

- **Corte de conexión a mitad del paso 3**: el voto no debe quedar a medias — o se registra completo y se confirma, o no se registra y el votante puede reintentar (transaccionalidad).
- **Doble clic / doble envío del voto**: el sistema debe registrar un solo voto aunque el usuario presione el botón varias veces o abra dos pestañas.
- **Votante llega justo al cierre**: la hora de confirmación (paso 3) manda — el voto vale solo si la confirmación se registra antes de la hora exacta de cierre; si llega después, se rechaza. Regla simple y auditable.
- **Padre con varios hijos en la institución**: tiene derecho a un voto por cada estudiante que representa — la interfaz debe distinguir claramente por cuál estudiante está votando. *Resuelto (ADR-0011):* vota desde la cuenta de cada estudiante (un inicio de sesión por hijo); la boleta declara la calidad "como padre/apoderado de" y, en consultas a toda la comunidad, la cuenta presenta por separado el derecho del estudiante y el del padre.
- **Estudiante sin correo o con correo inválido**: el voto se registra igualmente aunque falle el envío de la copia por correo; el fallo queda en auditoría.
- **Empate entre candidatos u opciones**: el sistema debe reflejar el empate en el acta; la resolución es decisión del comité electoral, no del sistema.
- **Proceso sin votantes o con participación cero**: el cierre y las actas deben generarse igualmente, reportando abstención total.
- **Candidato dado de baja después de abrir la votación**: los votos ya emitidos se conservan tal cual (el voto es inmodificable); el candidato deja de aparecer en la boleta para nuevos votantes y el acta de escrutinio refleja la baja y su momento.
- **Importación de Excel con errores** (DNI duplicados, filas vacías, formatos inválidos): el sistema debe reportar fila por fila qué falló sin abortar toda la carga válida.
- **Usuario bloqueado por intentos fallidos durante la jornada electoral**: *resuelto (ADR-0008)* — doble vía: el bloqueo expira automáticamente a los 10–15 minutos y, además, el comité puede desbloquear manualmente desde su panel (acción auditada).
- **Cambios de aula o sección después de generado el padrón**: al abrir el proceso el padrón se congela; los cambios académicos posteriores aplican solo a procesos futuros. Así las cifras de participación cuadran con el acta.
- **Zona horaria y hora del servidor**: apertura y cierre deben regirse por una única fuente de hora (servidor), no por el reloj del dispositivo del votante.
- **Resultados ocultos configurados a mitad del proceso**: *resuelto (ADR-0008)* — la configuración de visibilidad se congela al abrir el proceso, junto con el padrón; nadie puede cambiarla durante la jornada.

## Supuestos y riesgos abiertos

- **Secreto del voto vs. copia por correo** — *decisión actualizada en fase de arquitectura (ADR-0009)*: el correo de confirmación no contiene la elección en su cuerpo; incluye código de voto, hora y un enlace autenticado al comprobante completo dentro del sistema, que muestra la elección tras iniciar sesión. Esto aplica la mitigación que este PRD pedía: interceptar o reenviar el correo no revela la elección. Riesgo residual registrado: quien posea las credenciales del votante puede ver el comprobante, y la coacción presencial ("muéstrame tu pantalla") no es evitable por diseño — las bases del proceso electoral deben declarar el mecanismo a los votantes.
- *Confirmado*: toda la comunidad educativa cuenta con correo institucional Google Workspace; Google OAuth es la vía principal de acceso, con usuario/contraseña como alternativa.
- *Confirmado*: los padres votan usando la cuenta del estudiante que representan. Riesgo aceptado que queda registrado: el sistema no puede distinguir si votó el padre o el estudiante con esa cuenta — en procesos donde ambos tienen derecho a voto, la separación depende de la conducta de las familias, no de un control técnico. *Ratificado en fase de arquitectura (ADR-0011):* los padres no tienen cuenta propia; el apoderado se registra como datos vinculados al estudiante, y dentro de la familia los comprobantes son mutuamente visibles por compartir cuenta — las bases del proceso deben declararlo.
- Se asume una sola institución por despliegue y un solo año escolar activo a la vez.
- Menores de edad como usuarios: revisar requisitos de protección de datos personales de menores (Ley de Protección de Datos Personales del Perú u equivalente local) para fotografías, DNI y correos.
- Riesgo de suplantación: sin biometría, un voto es tan confiable como la custodia de la credencial — mitigar con bloqueo por intentos, registro de accesos y auditoría.
- Capacidad del servidor SMTP para ráfagas de correos (confirmaciones + notificaciones masivas el día de la elección) — riesgo de bloqueo por límites del proveedor.
- **Riesgo cerrado en fase de arquitectura**: el stack y la infraestructura quedaron definidos en `TECH-DESIGN.md` — TypeScript full-stack (NestJS + React, ADR-0002) desplegado en un VPS en la nube con Docker Compose (ADR-0007). Queda pendiente la prueba de carga que valide el criterio de 1,000 votantes concurrentes con el VPS elegido.
- "Resultados en tiempo real" visibles durante la jornada pueden influir en votantes que aún no votan — se asume que la opción de ocultarlos será la configuración recomendada por defecto.
