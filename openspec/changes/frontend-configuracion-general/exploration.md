# Exploración: frontend-configuracion-general (Backlog #28 — Frontend de configuración general)

## Estado actual

Origen: partido del change `frontend-administracion` original (#26 previo a la subdivisión del
2026-08-20). Este documento recorta la investigación compartida a lo que aplica exclusivamente al
dominio de configuración institucional — el más chico de los 4 dominios (un solo singleton).

Backend (`apps/backend/src/configuracion/configuracion.controller.ts`):
- `GET`/`PUT /configuracion` — singleton (una única fila), `PUT` hace merge parcial (no exige
  reenviar todos los campos). Cubre nombre de la institución, director, colores, zona horaria,
  SMTP y dominio de Google Workspace, según el backlog original (#10).
- `GET /configuracion/comite` — lista los usuarios con `rol='comite'` (de solo lectura desde esta
  pantalla; la edición de usuarios vive en #27, no acá).
- `POST`/`GET /configuracion/logo` — multipart PNG/JPG/SVG máx 2MB; la descarga ya trae cabeceras
  defensivas (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`) — mismo patrón que
  `listas.controller.ts` (plan de trabajo) y `actas.controller.ts` (PDF de actas), ya usado dos
  veces en el proyecto.

Frontend: no existe cliente API de configuración hoy. `apps/frontend/src/app/menu-por-rol.ts`
tiene el placeholder `configuracion`, visible solo para `administrador`/`director` (`comite` no
tiene acceso a este dominio en el backend).

## Áreas afectadas

- Cliente API nuevo (p. ej. `apps/frontend/src/configuracion/configuracion-api.ts`) — `GET`/`PUT`
  del singleton, `GET` de comité (solo lectura), `POST`/`GET` de logo.
- `apps/frontend/src/app/rutas.ts`, `Enrutador.tsx` — una única ruta nueva (`configuracion`), sin
  necesidad de sub-rutas: es un solo formulario de edición de un singleton, no un listado.
- `apps/frontend/src/app/menu-por-rol.ts` — el placeholder `configuracion` pasa a `navegable`.
- Una sola página nueva: formulario de edición del singleton + subida de logo + lista de comité
  (solo lectura). Sin componente de tabla necesario (comité es una lista corta, y no se edita
  desde acá — eso es #27).

## Enfoques posibles

Dado que es un solo singleton sin jerarquía ni CRUD de múltiples entidades, no hay una decisión de
arquitectura significativa que explorar — es el dominio más simple de los 4. La única pregunta de
diseño real es cómo manejar la subida de logo (multipart) de forma consistente con el patrón ya
usado en plan de trabajo (`listas.controller.ts`) y descarga de PDF de actas
(`actas.controller.ts`), si el frontend ya tiene algún precedente de subida de archivo del lado
cliente (a verificar: `RegistroCandidatoPage`/plan de trabajo de listas puede tener un precedente
de `<input type="file">` + `FormData`).

## Recomendación

Una sola página de formulario (con subida de logo embebida), sin fragmentar en más rutas. A
confirmar en `sdd-propose`.

## Riesgos

- Ninguno significativo — es el dominio más chico y menos riesgoso de los 4. El único punto a
  verificar es si ya existe un precedente de upload de archivo en el frontend a reutilizar (plan
  de trabajo de #12), para no reinventar el patrón de `FormData`/progreso/validación de tipo MIME
  del lado cliente.

## Listo para propuesta

Sí.
