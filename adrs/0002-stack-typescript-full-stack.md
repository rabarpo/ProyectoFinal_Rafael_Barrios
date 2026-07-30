# ADR 0002: Stack TypeScript full-stack (Node.js/NestJS + React)

## Estado

Aceptado

## Contexto

Con la arquitectura de monolito modular + worker decidida en [ADR-0001], hay que elegir lenguaje
y framework para cada componente. Lo que el PRD condiciona técnicamente: Google OAuth con correo
institucional, generación de actas en PDF, importación de padrones desde Excel con reporte de
errores fila por fila, envío de correos SMTP por lotes, gráficos de resultados, y ~1,000
conexiones concurrentes durante la jornada electoral. Todos los stacks maduros cubren estos
requisitos; el factor decisivo es la coherencia del equipo y del código.

## Decisión

**TypeScript en todo el sistema:**

- **Backend:** Node.js con **NestJS** — estructura modular explícita (un módulo NestJS por
  módulo funcional del PRD), inyección de dependencias, guards para autorización por rol, y
  soporte de primera clase para colas.
- **Worker:** proceso Node.js con **BullMQ sobre Redis** como cola de trabajos (correos, PDFs,
  exportaciones), con reintentos y rate-limiting por lotes para respetar los límites del SMTP.
- **Frontend:** **React + Vite**, aplicación SPA mobile-first que implementa el sistema visual
  Broadsheet definido en Design.md.

Librerías clave previstas: Passport (Google OAuth + credenciales), ExcelJS/SheetJS
(importación con validación fila por fila), **pdfmake** (actas PDF — generación programática
ligera; se descarta Playwright/Chromium para no cargar el worker del VPS de la jornada),
Nodemailer (SMTP).

## Alternativas consideradas

- **Python + React (Django/FastAPI + Celery)** — el admin de Django habría acelerado los CRUD de
  administración y su ORM es maduro; no se eligió por preferir un solo lenguaje en todo el
  proyecto: con TypeScript compartido, los tipos del contrato de API (DTOs) pueden compartirse
  entre backend y frontend sin duplicación.
- **PHP Laravel + Vue** — resuelve auth, colas, correos, PDF y Excel dentro del propio framework
  y su hosting es barato; no se eligió por la misma razón de unificar lenguaje, y porque el
  modelo asíncrono de Node.js maneja con más holgura las 1,000 conexiones concurrentes
  (incluyendo la actualización del panel de jornada) sin ajuste fino de PHP-FPM.

## Consecuencias

- Un solo lenguaje reduce el cambio de contexto y permite compartir tipos y validaciones entre
  backend, worker y frontend (una sola definición del DTO de "voto" o "candidato").
- El modelo asíncrono de Node.js atiende bien muchas conexiones simultáneas de I/O liviano, que
  es exactamente el perfil de la jornada electoral.
- NestJS impone la estructura modular que el ADR-0001 exige para que el monolito no se degrade.
- **Costo real:** se introduce **Redis como dependencia de infraestructura adicional** solo para
  la cola del worker — una pieza más que desplegar y monitorear (se retoma en el ADR de
  infraestructura). Además, Node.js es mono-hilo por proceso: la generación de PDFs es intensiva
  en CPU y debe vivir estrictamente en el worker, nunca en el proceso del backend, o bloqueará
  la votación.
- ORM/consultas y migraciones quedan pendientes de concretar en el ADR de base de datos.
