# Exploración: frontend-importacion-excel (Backlog #29 — Frontend de importación de Excel)

## Estado actual

Origen: partido del change `frontend-administracion` original (#26 previo a la subdivisión del
2026-08-20). Este documento recorta la investigación compartida a lo que aplica exclusivamente al
dominio de importación de Excel.

Backend (`apps/backend/src/importacion/importacion.controller.ts`):
- `POST /importaciones/padron` — multipart, allowlist estricta `.xlsx`/`.csv` (nunca `.xlsm`),
  límite 5 MB y 2000 filas. **Respuesta síncrona**: el request devuelve directamente
  `ResultadoImportacionDto` (`filas_totales/creadas/existentes/invalidas` +
  `errores: ErrorFilaDto[]` con `fila/campo/motivo/valor_recibido` inline) — **no hay polling ni
  job en background**, es un único request/response. Esto simplifica mucho la UI: no hace falta
  manejar un estado "procesando" de larga duración, sólo el spinner normal de un request en
  vuelo.
- `GET /importaciones/:id/errores.csv` — descarga del CSV de errores como archivo aparte
  (respaldado en Redis, TTL 24h; `404` si se pide después de vencido).
- Idempotencia por DNI/código ya resuelta en el backend (#9) — la UI no necesita lógica de
  deduplicación propia, sólo mostrar el resultado que el backend ya calculó.

Frontend: no existe cliente API de importación hoy. `apps/frontend/src/app/menu-por-rol.ts` tiene
el placeholder `importacion-excel`, visible solo para `administrador`/`director` (`comite` no
tiene acceso a este dominio).

## Áreas afectadas

- Cliente API nuevo (p. ej. `apps/frontend/src/importacion/importacion-api.ts`) — `POST` de
  subida (`FormData`), `GET` de descarga del CSV de errores.
- `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` — una única ruta nueva (`importacion-excel`).
- `apps/frontend/src/app/menu-por-rol.ts` — el placeholder `importacion-excel` pasa a `navegable`.
- Una sola página: selector de archivo (con validación de tipo/tamaño en cliente, antes de
  enviarlo, para dar feedback inmediato sin esperar el rechazo del backend), resultado con
  contadores (`creadas/existentes/invalidas`), tabla/lista de errores por fila, y botón de
  descarga del CSV cuando hay errores.

## Enfoques posibles

Igual que #28, es un dominio acotado (una sola acción con su resultado), sin decisión de
arquitectura significativa. El único punto de diseño real es cómo presentar la lista de errores
fila a fila cuando son muchas (hasta 2000 filas evaluadas, con un subconjunto en error) — si
amerita paginación/virtualización en el cliente o si alcanza con una lista simple dado el volumen
esperado en la práctica (padrones de instituciones educativas, no miles de errores reales).

## Recomendación

Una sola página con selector de archivo + resultado inline (contadores + lista de errores +
descarga CSV), sin necesidad de manejar estados asíncronos complejos dado que el backend responde
síncrono. A confirmar en `sdd-propose`.

## Riesgos

- Ninguno significativo de arquitectura. Riesgo de UX si la lista de errores es larga y se
  renderiza sin paginación — a decidir en diseño si hace falta, probablemente no dado el volumen
  típico de un padrón escolar.
- Validación de tipo de archivo en cliente (antes de enviar) es UX, no seguridad — el backend ya
  hace la validación real con allowlist estricta; no hay que duplicar esa lógica como si fuera la
  fuente de verdad.

## Listo para propuesta

Sí.
