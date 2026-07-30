# ADR 0001: Monolito modular con worker de tareas de fondo

## Estado

Aceptado

## Contexto

El PRD de SEEI exige 15 módulos funcionales (autenticación, procesos electorales, votación,
resultados, actas, reportes, auditoría, notificaciones, configuración), una aplicación web
mobile-first, y un criterio de éxito de 1,000 votantes concurrentes durante la jornada electoral
sin caída del servicio. El sistema es de instancia única por institución (el PRD excluye
multi-tenant) y la carga pico ocurre solo durante jornadas electorales puntuales.

Existe además trabajo de fondo claramente separable de la ruta crítica del voto: el envío de
correos por lotes (Design.md `3b`: "ritmo de envío por lotes para no chocar con los límites del
SMTP") y la generación de actas y reportes en PDF/Excel/CSV. El PRD establece que un fallo en el
envío del correo no debe invalidar el voto (caso borde "estudiante sin correo o con correo
inválido").

Se necesita decidir en cuántos componentes desplegables se estructura el sistema.

## Decisión

El sistema se estructura en **tres componentes desplegables**:

1. **Frontend web** — aplicación mobile-first que cubre el flujo de votación en 3 pasos, las
   vistas del votante y el panel de gestión del comité/administración.
2. **Backend monolítico modular** — un solo servicio HTTP con módulos internos bien delimitados
   (autenticación, usuarios, académico, procesos, candidatos, padrón, votación, resultados,
   actas, reportes, auditoría, configuración, notificaciones). Expone la API que consume el
   frontend y es la única pieza que escribe en la base de datos de negocio.
3. **Worker de tareas de fondo** — proceso separado que consume una cola de trabajos generados
   por el backend: envío de correos (copia del voto, recordatorios, notificaciones masivas) con
   ritmo por lotes y reintentos, y generación de documentos (actas PDF, exportaciones
   Excel/CSV).

Backend y worker comparten la base de datos; la comunicación entre ellos es mediante la cola de
trabajos, nunca llamadas directas.

## Alternativas consideradas

- **Frontend + API gateway + servicios separados por dominio** (votación, notificaciones,
  reportes, administración) — aislaría fallos y permitiría escalar el servicio de votación de
  forma independiente; no se eligió porque para una sola institución de 500–1,000 estudiantes
  multiplica la complejidad operativa (varios despliegues, contratos entre servicios,
  consistencia distribuida del padrón y el escrutinio) sin que la carga lo justifique.
- **App full-stack integrada** (un solo deployable sirviendo vistas y API, con tareas
  in-process) — máxima simplicidad de despliegue; no se eligió porque acopla la UI del votante
  con el panel de gestión y ejecuta correos y PDFs dentro del mismo proceso que atiende la
  votación, comprometiendo la ruta crítica del voto justo en el pico de la jornada.

## Consecuencias

- Un solo backend que desplegar, monitorear y respaldar; la transaccionalidad del voto y la
  consistencia del padrón se resuelven dentro de una única base de datos, sin coordinación
  distribuida.
- El worker saca de la ruta crítica del voto el trabajo lento (SMTP, PDFs): un correo fallido o
  una ráfaga de actas no bloquea la emisión de votos, cumpliendo el caso borde del PRD.
- Los módulos internos deben mantenerse disciplinadamente separados (límites claros, sin
  dependencias cruzadas arbitrarias) para que el monolito siga siendo "modular" y pueda
  extraerse un servicio en el futuro si la carga lo exigiera.
- **Costo real:** todo comparte proceso y base de datos — un error grave en un módulo secundario
  (p. ej. reportes) puede degradar el servicio completo durante la jornada; se mitiga
  dimensionando para el pico (ver ADR de infraestructura) y moviendo lo pesado al worker, pero
  el aislamiento de fallos es menor que con servicios separados.
- El escalado es vertical (o réplicas del monolito completo), no por módulo.
