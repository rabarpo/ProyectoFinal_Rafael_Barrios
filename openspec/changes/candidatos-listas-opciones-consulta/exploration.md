# Exploración: candidatos-listas-opciones-consulta (Backlog #12 — Candidatos, listas y opciones de consulta)

## Estado actual

El modelo de datos ya existe completo en `apps/backend/prisma/schema.prisma` (depositado por `#2`):
`Lista`, `Candidato`, `OpcionConsulta`, `ProcesoAula` FK'd a `ProcesoElectoral` (`Cascade`), incluido
`EstadoParticipacion` (`activo`/`baja`) + `baja_en` tanto en `Lista` como en `Candidato`. `Voto` ya
tiene FKs nullable `lista_id`/`opcion_id`/`candidato_id` (`Restrict`), así que el núcleo de votación
ya depende de estas tablas.

**No existe capa de aplicación**: `apps/backend/src/candidatos/` no existe — sin controller, service
ni DTOs. Brechas respecto a la fila del backlog: no hay columna `foto` en ningún lado;
`plan_trabajo_url` es un `String` plano (URL), no almacenamiento binario como el patrón ya usado en
`Configuracion.logo Bytes?`; no existe una entidad `Cargo` — `cargo` ya es texto libre (`String?`) en
`Candidato`. El frontend **no tiene ninguna pantalla de administración CRUD todavía**
(`App.tsx` monta únicamente auth + `ProcesoWizardPage`); `ProcesoWizardPage.tsx` línea 20 difiere
explícitamente "cargos y candidatos" a `#12`.

## Áreas afectadas

- `apps/backend/prisma/schema.prisma` — `foto`/`foto_mime` aditivos, y un cambio de tipo rompiente
  para `plan_trabajo_url` (`String` → `Bytes`) si el almacenamiento de PDF sigue el precedente del
  logo.
- `apps/backend/src/candidatos/` (nuevo) — service/controller/DTOs siguiendo el patrón de
  `apps/backend/src/academico/aulas.service.ts`.
- `apps/backend/src/auditoria/audit-event-types.ts` — claves aditivas, sin impacto en el trigger de
  identidad de `Voto` (ADR-0016).
- `apps/backend/src/configuracion/configuracion.controller.ts` — patrón de subida/entrega de
  archivos a reutilizar (multer `memoryStorage` + `fileFilter` allowlist +
  `PayloadTooLargeException` + `StreamableFile`).
- `apps/frontend/src/app/App.tsx` — necesita un nuevo montaje/ruta para la UI de administración de
  candidatos; hoy no existe router.

## Enfoques posibles

1. **Extender el schema existente in situ, pantalla CRUD plana, `Bytes` en Postgres para
   foto/PDF** — Pros: totalmente consistente con todos los patrones existentes (auditoría, códigos
   de error, almacenamiento de archivos); reutiliza FKs ya comiteadas. Cons: el crecimiento de fila
   por PDF-como-`Bytes` necesita un tope declarado. Esfuerzo: Medio.
2. **Catálogo formal `Cargo`** (FK en vez de texto libre) — Pros: validación/autocompletado. Cons:
   contradice "sin reglamento previo" (no existe un catálogo fijo), cambio rompiente sobre una
   columna ya scaffoldeada de la que depende el núcleo de votación. Esfuerzo: Alto.
3. **Almacenamiento externo de objetos (S3)** para foto/PDF — Pros: filas de Postgres más chicas.
   Cons: sin precedente en el repo, contradice ADR-0007 (VPS único/Docker Compose), requeriría un
   ADR nuevo. Esfuerzo: Alto.

## Recomendación

Enfoque 1. Mantener `cargo` como texto libre (descartar #2) y almacenamiento binario en Postgres
`Bytes` (descartar #3) — ambos declarados como defaults revisables según "sin reglamento previo".

## Reglas de negocio a redactar (marcar como configurables/revisables)

- Agrupación: ¿puede repetirse un `cargo` dentro de una misma `Lista`, o debe ser único por lista?
- Plan de trabajo en PDF: tamaño máximo (borrador, distinto del tope de 2MB del logo),
  almacenamiento en `Bytes`.
- Foto: allowlist de formato + tamaño máximo (borrador: espejar PNG/JPG + 2MB del logo), obligatoria
  u opcional.
- Baja de candidato: roles permitidos, en qué `Proceso.estado` está permitida, interacción con un
  proceso ya abierto (`#13` congela `DerechoVoto`; `#17` exige que el "candidato dado de baja" quede
  reflejado en el escrutinio — implica que la baja sigue siendo posible post-apertura, los votos ya
  emitidos siguen siendo válidos y quedan anotados).
- `OpcionConsulta.etiqueta`: hoy texto libre sin restricción — declarar si la UI fuerza exactamente
  A/B/C.

## Riesgos

- El cambio de tipo de `plan_trabajo_url` es rompiente, no aditivo — necesita una migración real.
- No existe router en el frontend todavía — `#12` sería el primero en introducir uno, podría
  repercutir en otros ítems que todavía no tienen frontend (`#7`/`#8`/`#10`).
- Acoplamiento indefinido entre `TipoProceso` y `Lista`/`Candidato`/`OpcionConsulta` — p. ej.
  ¿`representante_aula` requiere una `Lista` o admite `Candidato` suelto? Hoy no hay ninguna
  validación.
- El borrado físico (`eliminar()`) vs. la baja blanda (`EstadoParticipacion`) deben seguir siendo
  operaciones distintas; el borrado físico debe bloquearse una vez referenciado por un `Voto`
  (patrón `ENTIDAD_CON_DEPENDIENTES`), igual que `AulasService.eliminar()`.

## Referencia visual

Pantallas del proyecto Google Stitch "EduVote Pro Sistema Electoral" — "Gestión de Candidatos -
Administrador" y "Registro de Candidato - Nuevo Postulante" — como input de diseño para la UI que
se agregue en este change. Reutilizar los tokens ya vigentes en `apps/frontend/src/index.css`
(`#24`, ya archivado); no proponer tokens nuevos.

## Listo para propuesta

Sí.
