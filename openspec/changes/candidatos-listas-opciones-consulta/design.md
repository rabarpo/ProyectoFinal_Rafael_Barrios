# Diseño: candidatos-listas-opciones-consulta (Backlog #12)

## Enfoque técnico

Un módulo nuevo `CandidatosModule` (`apps/backend/src/candidatos/`) con **tres** controladores planos
—`/listas`, `/candidatos`, `/opciones`— y un servicio por entidad sobre `PrismaService`,
`AuthGuard`/`RolesGuard`/`@Roles('administrador','director','comite')` de #4 y
`AuditoriaService.log(tx, …)` de #3. Se mantiene el idioma vigente de #10/#11: DTO planos con
`@ApiProperty` únicamente, sin `class-validator`, sin `ValidationPipe`, sin filtro global de
excepciones; validación manual en el servicio y catálogo de códigos local al módulo
(`candidatos.errors.ts`, formato de `procesos.errors.ts`).

**Con migración rompiente** sobre el grupo 2 del schema (`Estructura del proceso electoral`): dos
columnas aditivas en `Candidato` y el reemplazo de `Lista.plan_trabajo_url` por almacenamiento
binario (D1-D3). El almacenamiento de archivos reutiliza literalmente el patrón del logo
institucional de #10 (`memoryStorage` + `fileFilter` con allowlist doble + tope en `limits` +
`StreamableFile` con `nosniff`/CSP).

En frontend este change introduce el **primer enrutador del proyecto** (D10): hand-rolled, basado en
URL real, montado dentro de `AuthGuard` > `AppShell`, sin librería nueva ni cambio de infraestructura
(`serve -s dist` en producción y el dev server de Vite ya hacen fallback a `index.html`).

## Decisiones de arquitectura

| # | Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|---|
| D1 | Dueño del plan de trabajo | Sigue en **`Lista`** (`schema.prisma:237`), no en `Candidato` | Moverlo a `Candidato`; duplicarlo en ambos | El voto de municipio es de lista cerrada y la boleta muestra una tarjeta por lista con enlaces a `propuesta` y plan de trabajo (`Design.md` 2, paso 2); `propuesta`/`lema`/`simbolo` ya viven en `Lista` por la misma razón. **Conflicto conocido**: el delta de spec escrito en paralelo lo ubica en `Candidato` — debe reconciliarse contra esta decisión antes de `sdd-tasks` |
| D2 | Columnas y nulabilidad | `Candidato.foto Bytes?` + `foto_mime String?`; `Lista.plan_trabajo Bytes?` + `plan_trabajo_mime String?` + `plan_trabajo_nombre String?`. La obligatoriedad de la foto la impone el servicio, no la DB | `foto Bytes` `NOT NULL`; nombrar la columna `plan_trabajo_pdf`; conservar el nombre `plan_trabajo_url` | Espeja exactamente `Configuracion.logo`/`logo_mime` (columna binaria con el sustantivo pelado + `_mime`). "Foto obligatoria" está declarada **revisable** en la propuesta: con `NOT NULL` revisar la regla costaría otra migración, y un `ADD COLUMN … NOT NULL` sin default falla en cualquier entorno que ya tenga filas. `_pdf` codificaría el formato en el nombre. `plan_trabajo_nombre` conserva el nombre original para el `Content-Disposition` de la descarga |
| D3 | Forma de la migración | Un `ALTER TABLE` por tabla: `ADD COLUMN` en `Candidato`; `DROP COLUMN "plan_trabajo_url"` + tres `ADD COLUMN` en `Lista`. Sin backfill ni `USING` | Columna paralela + copia + drop diferido; `USING decode(...)` | No hay ninguna fila que preservar: `Lista` nunca tuvo capa de aplicación (`apps/backend/src/candidatos/` no existe) y `prisma/seed.ts` no crea listas. Una conversión `text → bytea` no tiene semántica útil (la columna guardaba URLs, no bytes). El runbook incluye una verificación `count(*)` previa (ver Migración) |
| D4 | Transporte de los archivos | **`Candidato`: `multipart/form-data` en `POST`/`PATCH`** (la foto viaja con los datos, una sola transacción). **`Lista`: JSON + subrecurso** `PUT /listas/:id/plan-trabajo` (espejo literal de `POST /configuracion/logo`) | Multipart en las tres entidades; dos pasos también para candidato; base64 dentro del JSON | La foto es **obligatoria al crear**: en dos pasos existiría una ventana con candidato sin foto, y un fallo del segundo paso dejaría un inválido persistido. Multipart no cuesta nada en `Candidato` porque **todos** sus escalares son `String` (`nombres`, `grado`, `aula`, `cargo`, `lista_id`) — cero coerción manual. En `Lista` sí costaría: `numero` es `Int` y en multipart se degradaría a `string` en el contrato OpenAPI y en el cliente generado; además el plan de trabajo es opcional, así que no necesita atomicidad. Base64 infla 33 % y no tiene precedente |
| D5 | Superficie de rutas | Plana con FK en el body y filtro `?proceso_id=` (`/listas`, `/candidatos`, `/opciones`) | Anidada bajo `/procesos/:procesoId/...` | Precedente vigente: `AulasController` recibe `grado_id`/`seccion_id`/`anio_escolar_id` en el body y no se anida bajo `/grados/:id`. Mantiene un único controlador por entidad y evita duplicar `@Controller` para las operaciones por `:id`. Las rutas estáticas se declaran antes de `:id` (gotcha de enrutamiento de Nest, D4 de #11) |
| D6 | Baja vs. borrado | `PATCH /candidatos/:id/estado` y `PATCH /listas/:id/estado` con body `{ estado: 'activo' \| 'baja' }`; el servicio fija `baja_en = now()` al dar de baja y `null` al reactivar | `DELETE` con semántica de baja; `POST /:id/baja` + `POST /:id/reactivacion` | Espejo literal de `PATCH /usuarios/:id/estado` (#7), que ya separa "cambio de estado" de "editar datos" y de "borrar". Permitida en **cualquier** `Proceso.estado`, incluido `abierto` (regla confirmada): #13 congela `DerechoVoto`, no candidatos, y #17 debe reflejar la baja. Los `Voto` ya emitidos no se tocan |
| D7 | Borrado físico guardado | Precomprobación explícita de dependientes dentro de la `$transaction` (`Voto` para las tres entidades; además `Candidato` para `Lista`) ⇒ `409 ENTIDAD_CON_DEPENDIENTES`, más `catch P2003` residual | Confiar solo en el `P2003` de Postgres; borrado lógico universal | Patrón literal de `AulasService.eliminar()`. Las FK `Voto → Lista/OpcionConsulta/Candidato` son `onDelete: Restrict` explícito (ADR-0010), así que la red de seguridad existe, pero el mensaje discriminable (`relacion`) sale de la precomprobación |
| D8 | Validación y entrega de archivos | `fileFilter` con allowlist doble extensión+MIME (`/\.(png\|jpe?g)$/i` + `image/png`,`image/jpeg`; `/\.pdf$/i` + `application/pdf`), `limits.fileSize` 2 MB / 5 MB, y un `ExceptionFilter` local que traduce el 413 de multer a `400 ARCHIVO_DEMASIADO_GRANDE`. Entrega con `StreamableFile` + `X-Content-Type-Options: nosniff` + `Content-Security-Policy: default-src 'none'`; el PDF además con `Content-Disposition: attachment; filename="…"` | Confiar en el `Content-Type` declarado por el cliente; servir el PDF `inline` | Réplica de `configuracion.controller.ts` (`filtroArchivoLogo` + `LogoTamanioExcedidoFilter`) e `importacion.controller.ts`. Un PDF servido `inline` desde el mismo origen ejecuta JavaScript embebido en varios visores; `attachment` + CSP lo neutraliza sin bloquear la descarga. Interfaz local `ArchivoMulter` (nunca `Express.Multer.File`: `tsconfig` acota `types` a `["node","jest"]`) |
| D9 | Auditoría | 14 claves aditivas en `audit-event-types.ts`, emitidas con `auditoria.log(tx, …)` dentro de la misma `$transaction` que la escritura | Un evento genérico por entidad; auditar la foto aparte del `PATCH` | Ninguna toca un `Voto`, así que no activan la obligación versionada de ADR-0016 (test `[TM4]`). La foto viaja en el mismo `PATCH` (D4) ⇒ se reporta como `CANDIDATO_ACTUALIZADO` con `campos: ['foto', …]`; el plan de trabajo tiene endpoint propio ⇒ clave propia, igual que `CONFIGURACION_LOGO_ACTUALIZADO` |
| D10 | Enrutador | URL real: `rutas.ts` con un parser explícito a unión discriminada + `useRuta()` sobre `useSyncExternalStore` (suscrito a `popstate` y a un evento sintético de `pushState`) + `<Enrutador>` que hace `switch` sobre la unión | `react-router-dom`; conmutar vistas con `useState` sin URL; un matcher genérico con patrones `:param` | La propuesta descarta la librería (YAGNI). URL real da enlace profundo y botón atrás, que un admin necesita para volver a la ficha de un candidato, y **no requiere cambio de infraestructura**: `serve -s dist` (`infra/docker/frontend.Dockerfile:31`) y el dev server de Vite ya hacen fallback a `index.html`; Caddy no ramifica. El parser explícito (no un motor de patrones) mantiene el tipado exacto y hace que #7/#8/#10 extiendan agregando una variante |
| D11 | Montaje del enrutador | Dentro de `AuthGuard` > `AppShell`; ninguna ruta se resuelve antes del guard. Ruta desconocida ⇒ variante `no-encontrada` renderizada dentro del shell | Enrutar también el login; montar el enrutador por encima del guard | Conserva fail-closed: la sesión, no la URL, decide entre `LoginPage` y la app. Una URL inventada no puede alcanzar ninguna pantalla autenticada ni romper el render |
| D12 | Punto de entrada al módulo | Ruta índice `/procesos` que reutiliza `procesos-api.listar()` (ya existe, sin consumidor) + enlace "Gestionar candidatos" en el panel de éxito del asistente | Llegar solo desde el asistente; hardcodear un `proceso_id` | Sin índice no hay forma de alcanzar los candidatos de un proceso creado en otra sesión. `listar()`/`detalle()` ya están escritos y tipados desde #11, así que el costo es una pantalla de tabla |
| D13 | Composición de la UI | Contenedores `GestionCandidatosPage` / `RegistroCandidatoPage` con **todos** los efectos; piezas presentacionales sin efectos en `apps/frontend/src/candidatos/piezas/`; exclusivamente tokens vigentes de `index.css` | Componentes con fetch propio; tokens nuevos para las pantallas de Stitch | Patrón literal de `ProcesoWizardPage` + `procesos/pasos/`. La referencia visual (Stitch "Gestión de Candidatos" / "Registro de Candidato") se traduce a los tokens ya existentes (`primary`, `surface-white`, `border-gray`, `rounded-card`, `shadow-elevation`, `text-headline-lg`, `max-page`); #24 ya archivó el sistema visual y no se le agregan tokens |

## Flujo de datos

```
POST /candidatos  (multipart: nombres, grado, aula, cargo, lista_id, proceso_id, foto)
  └→ AuthGuard → RolesGuard(@Roles administrador,director,comite)
     └→ FileInterceptor('foto', { fileFilter: filtroFoto, limits: 2 MB })   ← rechaza antes de la DB
        └→ CandidatosService.crear(datos, archivo, actorId)
             ├─ !archivo            ⇒ 400 FOTO_REQUERIDA
             ├─ buffer.length === 0 ⇒ 400 ARCHIVO_VACIO
             └─ prisma.$transaction(tx):
                  1. tx.procesoElectoral.findUnique  → 409 REFERENCIA_INEXISTENTE
                  2. tx.lista.findUnique (si lista_id) → 409 REFERENCIA_INEXISTENTE
                     + lista.proceso_id === proceso_id → 409 COHERENCIA_JERARQUICA
                  3. tx.candidato.create({ …, foto, foto_mime })
                  4. auditoria.log(tx, CANDIDATO_CREADO, actorId, 'Candidato', id, {…})
```

```
PATCH /candidatos/:id/estado  { estado: 'baja' }        ← permitido en cualquier Proceso.estado
  └→ $transaction: update { estado: 'baja', baja_en: now() }
       + auditoria.log(tx, CANDIDATO_DADO_DE_BAJA, …, { baja_en })
     Los Voto existentes quedan intactos; #17 los lee y anota "dado de baja".

DELETE /candidatos/:id
  └→ $transaction: tx.voto.count({ candidato_id }) > 0 ⇒ 409 ENTIDAD_CON_DEPENDIENTES
       → delete + auditoria.log(tx, CANDIDATO_ELIMINADO, …)   [catch P2003 residual]

DELETE /listas/:id
  └→ count(Voto.lista_id) y count(Candidato.lista_id), en ese orden ⇒ 409 con `relacion`
```

```
Navegación (D10/D11)
  App → AuthProvider → AuthGuard → AppShell → Enrutador
                                                 │ useRuta() = useSyncExternalStore(popstate + 'seei:navegacion')
                                                 ├ '/'                                   → ProcesoWizardPage
                                                 ├ '/procesos'                           → ProcesosIndexPage
                                                 ├ '/procesos/:id/candidatos'            → GestionCandidatosPage
                                                 ├ '/procesos/:id/candidatos/nuevo'      → RegistroCandidatoPage
                                                 ├ '/procesos/:id/candidatos/:candId'    → RegistroCandidatoPage (edición)
                                                 └ otro                                  → VistaNoEncontrada
```

## Contratos HTTP

Guards de clase en los tres controladores: `AuthGuard` + `RolesGuard` + `@Roles('administrador','director','comite')`.

| Ruta | Cuerpo | Respuesta |
|---|---|---|
| `POST /listas` | JSON `CrearListaDto` (`proceso_id`, `nombre`, `numero`, `simbolo?`, `lema?`, `propuesta?`) | `201 ListaRespuestaDto`; `409 RESTRICCION_UNICA` por `@@unique([proceso_id, numero])` |
| `GET /listas?proceso_id=&estado=` | — | `200 ListaRespuestaDto[]` (sin bytes: `plan_trabajo_presente`, `plan_trabajo_nombre`) |
| `PATCH /listas/:id` · `PATCH /listas/:id/estado` · `DELETE /listas/:id` | JSON | `200` / `200` / `204` |
| `PUT /listas/:id/plan-trabajo` | `multipart/form-data` campo `plan_trabajo` | `200 PlanTrabajoRespuestaDto`; `400` formato/vacío/>5 MB |
| `GET /listas/:id/plan-trabajo` | — | `StreamableFile` `application/pdf`, `attachment`, `nosniff`, CSP; `404` si no hay |
| `DELETE /listas/:id/plan-trabajo` | — | `204`; audita `LISTA_PLAN_TRABAJO_ACTUALIZADO` con `{ presente: false }` |
| `POST /candidatos` · `PATCH /candidatos/:id` | `multipart/form-data` (campos + `foto`) | `201`/`200 CandidatoRespuestaDto`; `400 FOTO_REQUERIDA` solo en `POST` |
| `GET /candidatos?proceso_id=&lista_id=&estado=` | — | `200 CandidatoRespuestaDto[]` (`foto_presente`, `foto_mime`; nunca los bytes) |
| `GET /candidatos/:id/foto` | — | `StreamableFile` con el `foto_mime` persistido, `nosniff`, CSP; `404` |
| `PATCH /candidatos/:id/estado` · `DELETE /candidatos/:id` | JSON / — | `200` / `204` |
| `POST /opciones` · `GET /opciones?proceso_id=` · `PATCH /opciones/:id` · `DELETE /opciones/:id` | JSON `etiqueta`, `descripcion?` | `201`/`200`/`200`/`204`; `409 RESTRICCION_UNICA` por `@@unique([proceso_id, etiqueta])` |

`OpcionConsulta` no tiene `estado`/`baja_en` en el schema ⇒ **no** tiene baja lógica; solo CRUD con borrado guardado por `Voto`.

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modify | D1/D2: `Candidato.foto`/`foto_mime`; `Lista.plan_trabajo`/`_mime`/`_nombre` en lugar de `plan_trabajo_url` |
| `apps/backend/prisma/migrations/2026…_candidato_foto_lista_plan_trabajo/migration.sql` | Create | D3: `ADD COLUMN` + `DROP COLUMN` sin backfill |
| `apps/backend/src/candidatos/candidatos.module.ts` | Create | `imports: [AuthModule, AuditoriaModule]`; 3 controladores + 3 servicios + `PrismaService` |
| `apps/backend/src/candidatos/{listas,candidatos,opciones}.controller.ts` | Create | D4/D5/D8: rutas, multipart, `StreamableFile` |
| `apps/backend/src/candidatos/{listas,candidatos,opciones}.service.ts` | Create | D6/D7/D9: validación manual, `$transaction` + auditoría |
| `apps/backend/src/candidatos/archivos.ts` | Create | `ArchivoMulter` local, `filtroFoto`, `filtroPlanTrabajo`, topes, `ArchivoTamanioExcedidoFilter` |
| `apps/backend/src/candidatos/candidatos.errors.ts` | Create | `CAMPO_INVALIDO`, `REFERENCIA_INEXISTENTE`, `COHERENCIA_JERARQUICA`, `RESTRICCION_UNICA`, `ENTIDAD_CON_DEPENDIENTES`, `FOTO_REQUERIDA`, `ARCHIVO_VACIO`, `FORMATO_NO_PERMITIDO`, `ARCHIVO_DEMASIADO_GRANDE`, `ARCHIVO_NO_ENCONTRADO`, `ESTADO_INVALIDO` |
| `apps/backend/src/candidatos/dto/*.ts` | Create | `crear-lista`, `actualizar-lista`, `lista-respuesta`, `plan-trabajo-respuesta`, `crear-candidato`, `actualizar-candidato`, `candidato-respuesta`, `cambiar-estado`, `crear-opcion`, `actualizar-opcion`, `opcion-respuesta`, queries de listado |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modify | D9: 14 claves aditivas + comentario de bitácora del change |
| `apps/backend/src/app.module.ts` | Modify | Registrar `CandidatosModule` al final |
| `packages/contracts/openapi.json` | Modify | Regenerar (`pnpm openapi:extract`) antes del frontend |
| `apps/frontend/src/app/rutas.ts` | Create | D10: unión `Ruta`, `parsearRuta(pathname)`, `rutaAPath(ruta)` |
| `apps/frontend/src/app/useRuta.ts` | Create | D10: `useSyncExternalStore` + `navegar(ruta)` |
| `apps/frontend/src/app/Enrutador.tsx` | Create | D11: `switch` sobre `Ruta`; variante `no-encontrada` |
| `apps/frontend/src/app/App.tsx` | Modify | `<AppShell><Enrutador /></AppShell>` |
| `apps/frontend/src/procesos/ProcesosIndexPage.tsx` | Create | D12: tabla de procesos con enlace a candidatos |
| `apps/frontend/src/procesos/ProcesoWizardPage.tsx` | Modify | D12: enlace "Gestionar candidatos" en el panel de éxito |
| `apps/frontend/src/candidatos/candidatos-api.ts` | Create | Wrappers tipados; multipart vía `bodySerializer` |
| `apps/frontend/src/candidatos/{GestionCandidatosPage,RegistroCandidatoPage}.tsx` | Create | D13: contenedores con los efectos |
| `apps/frontend/src/candidatos/piezas/*.tsx` | Create | D13: `TablaCandidatos`, `FormularioCandidato`, `FormularioLista`, `PanelOpcionesConsulta`, `CampoArchivo` |

## Interfaces / Contratos

```prisma
model Lista {
  // … sin cambios salvo lo indicado
  plan_trabajo        Bytes?    // era: plan_trabajo_url String?
  plan_trabajo_mime   String?
  plan_trabajo_nombre String?
}

model Candidato {
  // … sin cambios
  foto      Bytes?   // obligatoria en el servicio, nullable en la DB (D2)
  foto_mime String?
}
```

```ts
// apps/frontend/src/app/rutas.ts — D10
export type Ruta =
  | { nombre: 'proceso-nuevo' }
  | { nombre: 'procesos' }
  | { nombre: 'candidatos'; procesoId: string }
  | { nombre: 'candidato-nuevo'; procesoId: string }
  | { nombre: 'candidato-edicion'; procesoId: string; candidatoId: string }
  | { nombre: 'no-encontrada'; pathname: string };
```

```ts
// apps/frontend/src/app/useRuta.ts — pushState NO dispara popstate: se emite un evento propio.
const EVENTO = 'seei:navegacion';
export function navegar(ruta: Ruta): void {
  window.history.pushState(null, '', rutaAPath(ruta));
  window.dispatchEvent(new Event(EVENTO));
}
```

```ts
// apps/frontend/src/candidatos/candidatos-api.ts — multipart sobre el cliente tipado.
// El serializador devuelve el FormData tal cual; el navegador fija el boundary. Verificar en
// apply que openapi-fetch no inyecte `Content-Type: application/json` (si lo hace, se elimina
// pasando `headers: { 'Content-Type': null }`).
return client().POST('/candidatos', { body: cuerpo as never, bodySerializer: (b) => b as FormData });
```

Claves de auditoría nuevas (D9): `LISTA_CREADA`, `LISTA_ACTUALIZADA`, `LISTA_ELIMINADA`,
`LISTA_DADA_DE_BAJA`, `LISTA_REACTIVADA`, `LISTA_PLAN_TRABAJO_ACTUALIZADO`, `CANDIDATO_CREADO`,
`CANDIDATO_ACTUALIZADO`, `CANDIDATO_ELIMINADO`, `CANDIDATO_DADO_DE_BAJA`, `CANDIDATO_REACTIVADO`,
`OPCION_CONSULTA_CREADA`, `OPCION_CONSULTA_ACTUALIZADA`, `OPCION_CONSULTA_ELIMINADA`.

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (Jest, backend) | `filtroFoto`/`filtroPlanTrabajo` (allowlist doble, doble extensión); servicios: foto ausente ⇒ `FOTO_REQUERIDA`, dependientes ⇒ `ENTIDAD_CON_DEPENDIENTES`, baja fija `baja_en`, reactivación lo limpia, `P2002`/`P2003` traducidos | `PrismaService` y `AuditoriaService` mockeados, patrón `procesos.service.spec.ts` |
| Unit (Vitest, frontend) | `parsearRuta`/`rutaAPath` (ida y vuelta, ruta desconocida, id no-UUID); `useRuta` reacciona a `popstate` y a `navegar`; piezas presentacionales sin efectos | `@testing-library/react` + `history.pushState` real en jsdom |
| Integration | Auditoría en la **misma** `$transaction` (rollback ⇒ sin fila de auditoría); round-trip `bytea` de foto y PDF; migración aplicable sobre la base sembrada | Suite Postgres existente + `test/auditoria-transaccional.e2e-spec.ts` |
| E2E | `401` sin cookie y `403` con `docente`/`estudiante` en las rutas nuevas; `>2 MB`/`>5 MB` ⇒ `400`; `.exe`, `.png.svg`, MIME discrepante ⇒ `400`; borrado bloqueado con `Voto` ⇒ `409`; baja con proceso `abierto` ⇒ `200` y el `Voto` previo sigue existiendo; cabeceras de `GET …/foto` y `…/plan-trabajo` | `Test.createTestingModule(AppModule)` + supertest, patrón de los e2e vigentes |
| Contract | `pnpm openapi:extract` sin Postgres ni Redis; el multipart de `/candidatos` aparece como `multipart/form-data` con `foto` `format: binary` | Job de CI existente |

## Threat Matrix

| Límite | Casos adversariales mínimos | Aplicabilidad | Respuesta de diseño | RED tests planificados |
|---|---|---|---|---|
| Clasificación de archivo activo (fila "documentation-like paths" adaptada) | `foto.png.svg`; MIME `image/png` con bytes SVG/HTML; PDF con JavaScript embebido; archivo de 0 bytes; `>2 MB` / `>5 MB`; campo ausente | **Applicable** — dos endpoints de subida y dos de entrega desde el mismo origen | Allowlist doble (extensión + MIME) en `fileFilter`, evaluada antes de tocar la DB; tope en `limits.fileSize` con `ExceptionFilter` que traduce el 413 de multer a `400`; entrega con `nosniff` + `Content-Security-Policy: default-src 'none'` y, para el PDF, `Content-Disposition: attachment`. Todo rechazo es `400`, nunca `500` | Un test por clase: doble extensión, MIME/contenido discrepantes, PDF con JS (se acepta como archivo pero se verifica `attachment` + CSP en la respuesta), archivo vacío, tamaño excedido, archivo ausente |
| Enrutamiento (cliente) | `/procesos/<uuid>/candidatos` sin sesión; `/../../etc/passwd`; segmento `:id` no-UUID; ruta inexistente; `pushState` a una ruta desconocida | **Applicable** — este change introduce el primer enrutador | El enrutador se monta **dentro** de `AuthGuard` (D11): la sesión, no la URL, elige entre login y app. `parsearRuta` es total: todo lo no reconocido cae en `no-encontrada`, nunca lanza ni renderiza `undefined`. Los ids se pasan tal cual al backend, que los valida con `ParseUUIDPipe` ⇒ `400` | Un test por caso: sin sesión ⇒ `LoginPage` cualquiera sea el `pathname`; path arbitrario ⇒ `no-encontrada`; id no-UUID ⇒ error manejado en la vista, sin crash |
| Selección de repositorio Git | — | N/A: el change no ejecuta Git | — | — |
| Estado de commit / de push | — | N/A: sin automatización de commits ni push | — | — |
| Comandos de PR | — | N/A: sin automatización de PR | — | — |

Sin shell, subprocesos ni integración de procesos.

## Migración / Rollout

```sql
ALTER TABLE "Candidato" ADD COLUMN "foto" BYTEA, ADD COLUMN "foto_mime" TEXT;

ALTER TABLE "Lista"
  DROP COLUMN "plan_trabajo_url",
  ADD COLUMN "plan_trabajo" BYTEA,
  ADD COLUMN "plan_trabajo_mime" TEXT,
  ADD COLUMN "plan_trabajo_nombre" TEXT;
```

| # | Paso | Verificación de salida |
|---|---|---|
| R1 | **Antes** de migrar: `SELECT count(*) FROM "Lista" WHERE plan_trabajo_url IS NOT NULL;` | Debe ser `0`. Si no lo es, DETENERSE: la premisa de D3 (sin datos que preservar) no se cumple y hay que exportar esas URLs antes del `DROP COLUMN` |
| R2 | `pnpm prisma migrate deploy` | Columnas nuevas presentes; `plan_trabajo_url` ausente |
| R3 | `pnpm openapi:extract` y commit del contrato | El frontend no compila contra `/candidatos` hasta este paso |
| R4 | Desplegar backend y frontend | Alta de candidato con foto end-to-end; `GET /candidatos/:id/foto` devuelve la imagen con `nosniff` |

Rollback: revertir el commit de código y aplicar la migración inversa (`DROP` de las cuatro columnas
nuevas, `ADD COLUMN "plan_trabajo_url" TEXT`). Sin pérdida de datos de producción, porque no hay
procesos con candidatos en ningún entorno.

**Corte de PR sugerido para `sdd-tasks`** (el change excede con holgura el presupuesto de 400 líneas):
PR1 migración + schema + claves de auditoría; PR2 `ListasController`/`OpcionesController` (JSON);
PR3 `CandidatosController` + multipart + entrega de archivos; PR4 enrutador + índice de procesos;
PR5 pantallas de gestión y registro.

## Preguntas abiertas

- [x] **Reconciliado** (orquestador, post-diseño): el delta de spec escrito en paralelo ubicaba
      `plan_trabajo_url` en `Candidato` y `foto`/`foto_mime` como `NOT NULL`; corregido en
      `specs/base-schema/spec.md` y `specs/candidatos-listas-management/spec.md` para que
      coincidan con D1/D2 (`Lista.plan_trabajo`/`_mime`/`_nombre`, `Candidato.foto`/`foto_mime`
      nullable en DB, obligatoriedad de la foto a nivel de servicio).
- [ ] Un `Candidato` sin `lista_id` (p. ej. `representante_aula`) queda sin plan de trabajo por D1.
      ¿Ese tipo de proceso necesita el PDF a nivel de candidato, o alcanza con `propuesta`?
- [ ] `GET /candidatos/:id/foto` queda tras `AuthGuard`: correcto para la pantalla de
      administración, pero la boleta de votación (#14) también deberá mostrarla — confirmar que el
      votante autenticado tiene rol suficiente o abrir una ruta de lectura para votantes.
- [ ] Acoplamiento `TipoProceso` ↔ `Lista`/`Candidato`/`OpcionConsulta` sigue sin validarse (fuera
      de alcance por la propuesta): hoy nada impide crear una `OpcionConsulta` en un proceso
      `municipio`.
