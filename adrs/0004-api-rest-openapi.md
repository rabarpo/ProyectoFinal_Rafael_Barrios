# ADR 0004: API REST con contrato OpenAPI

## Estado

Aceptado

## Contexto

El frontend SPA ([ADR-0001], [ADR-0002]) consume la API del backend monolítico. Las operaciones
que el PRD exige son de perfiles distintos: CRUD de administración (usuarios, académico,
procesos, candidatos), la emisión del voto — que debe ser única, idempotente ante doble envío y
auditable —, consultas de resultados agregados, y descargas de archivos (actas PDF, reportes
Excel/CSV). El contrato necesita un dueño claro y una forma verificable de mantener frontend y
backend sincronizados.

## Decisión

**API REST con contrato OpenAPI**, propiedad del backend:

- Endpoints REST organizados por recurso, alineados con los módulos del PRD
  (`/procesos`, `/candidatos`, `/padron`, `/votos`, `/resultados`, `/actas`, `/auditoria`…).
- El documento **OpenAPI se genera desde el código NestJS** (decoradores en DTOs y
  controladores) — el backend es la fuente de verdad del contrato.
- Los **tipos del cliente se generan automáticamente** a partir del documento OpenAPI, de modo
  que un cambio de contrato rompe la compilación del frontend en lugar de fallar en runtime.
- La emisión del voto es `POST /votos` con **clave de idempotencia** generada en el paso 3: los
  reintentos por corte de conexión o doble toque devuelven el mismo resultado sin crear un
  segundo voto (refuerza en la API la garantía UNIQUE del [ADR-0003]). La clave **persiste en el
  cliente** (`sessionStorage`, por proceso y derecho de voto) para sobrevivir a la recarga de la
  página; y si un reintento llega con clave distinta y choca con el `UNIQUE`, la API responde el
  **comprobante ya emitido** — nunca un error a un votante que sí votó.
- Autenticación por **cookie de sesión httpOnly con la sesión en el servidor** (Redis, ya
  presente en la infraestructura): bloquear una cuenta ([ADR-0008]) revoca su sesión activa de
  inmediato, cosa que un JWT sin estado no permite; autorización por rol en guards de NestJS.

## Alternativas consideradas

- **tRPC** — tipado extremo a extremo sin generación de código, muy productivo siendo TypeScript
  en ambos lados; no se eligió porque acopla frontend y backend al mismo tooling, y un contrato
  OpenAPI estándar es más depurable (curl, Postman), más natural para descargas de archivos y
  más útil como documentación del sistema electoral ante terceros (comité, auditores).
- **GraphQL** — esquema tipado y consultas flexibles; no se eligió porque hay un solo cliente
  propio, las vistas del PRD se cubren con endpoints agregados simples, y la mutación crítica
  (emitir voto) no gana nada frente a un POST idempotente — solo añadiría capa de
  esquema/resolvers.

## Consecuencias

- Contrato explícito, versionable y verificable: la generación de tipos convierte los cambios de
  API en errores de compilación del frontend.
- Cada operación sensible es un recurso HTTP identificable, lo que facilita registrarla en la
  auditoría y razonar sobre permisos por endpoint.
- **Costo real:** hay un paso de generación en el flujo de trabajo (OpenAPI → tipos del cliente)
  que debe automatizarse en el build/CI; si se omite, frontend y backend pueden divergir
  silenciosamente hasta el siguiente build. Además, los endpoints agregados (dashboard, panel de
  jornada) deben diseñarse a mano para evitar que el frontend encadene múltiples llamadas.
