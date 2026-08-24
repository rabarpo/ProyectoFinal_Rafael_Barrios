# Design: Descubrimiento de derechos de voto propios al iniciar sesión

## Enfoque técnico

Endpoint de **solo lectura** `GET /votos/mis-derechos` en un servicio nuevo del módulo `votos`
(`MisDerechosService`), sin tocar `VotosService.emitir()` ni `PapeletaService`. Mismo patrón que
`PapeletaService` (#14/PR1): Prisma tipado, pertenencia resuelta contra `sesion.userId`, sin
auditoría propia (es UX, no la validación). En frontend, ruta plana `/mis-votaciones` y un ítem
navegable en `MENU_POR_ROL.estudiante`, con la lista consumida por un contenedor de fetch único al
estilo `ComprobantePage`.

## Decisiones de arquitectura

### D1 — La ventana de vigencia usa `fecha_cierre_prevista`, no `cierre_real`

| Opción | Tradeoff | Decisión |
|---|---|---|
| `now() < cierre_real` (literal del proposal/spec) | **Roto**: `cierre_real` es `DateTime?` y `procesos.service.ts:744` sólo lo escribe al cerrar; en un proceso `abierto` es `NULL`, y la comparación devuelve `NULL` → lista siempre vacía | Rechazada |
| `estado = 'abierto' AND now() < fecha_cierre_prevista` | Coincide exactamente con la ventana que acepta `emitir()` (`cerrado_por_hora`/`aun_no_abierto`, `votos.service.ts:240-241`) | **Elegida** |

`estado='abierto'` implica `apertura_real` seteado (`procesos.service.ts:659`) y `cierre_real IS
NULL`, así que no hacen falta predicados extra. **Corrige la redacción del spec**, sin cambiar la
intención ("derechos que hoy se pueden ejercer").

### D2 — Consulta con Prisma `findMany`, sin SQL crudo

Lectura sin bloqueo ni transacción: no necesita `FOR UPDATE` ni snapshot único de `now()` (la razón
por la que D4 de #14 usa `$queryRaw`). Prisma evita reabrir la superficie de SQL crudo del threat
matrix. Costo aceptado: el corte temporal usa el reloj de Node, no `now()` de Postgres — mismo
host/contenedor, deriva despreciable, y el caso borde degrada al rechazo `VOTACION_CERRADA` que
`VotacionPage` ya maneja. **`POST /votos` sigue siendo la única autoridad de la ventana.**

### D3 — Servicio propio, desacoplado de `emitir()`

`mis-derechos.service.ts` nuevo; `votos.service.ts`, `papeleta.service.ts` y sus suites quedan
intactos. Sólo se agregan `MisDerechosService` a `providers` y un método al controlador existente.

### D4 — Array plano etiquetado por `en_calidad_de`

Rechazado el envelope anidado (`{ estudiante: [...], padre: [...] }`): rompería el orden global por
cierre más próximo que exige el spec. `@@unique([proceso_id, usuario_id, en_calidad_de])` ya
garantiza filas distintas; el DTO las emite 1:1 con su etiqueta, sin agregación alguna (ADR-0011).
Formato `type: [Dto]`, igual que `GET /procesos`.

### D5 — El usuario sale sólo de `req.usuario`

El handler **no declara `@Query()` ni `@Param()`**: `?usuario_id=` es estructuralmente inerte, no
"ignorado por validación". Sin `@Roles`: cualquier rol responde `200 []` (mismo estado vacío
genérico), sin oráculo por código de estado.

### D6 — `ya_voto` derivado sin tocar la elección

`select: { votos: { select: { id: true }, take: 1 } }` → `ya_voto = votos.length > 0`. El DTO no
declara `lista_id`/`opcion_id`/`candidato_id`/`blanco`/`codigo_comprobante`; ni siquiera el `voto.id`
se serializa (ADR-0010).

### D7 — Aterrizaje vía `MENU_POR_ROL`, con `InicioPage.tsx` sin cambios de código

`InicioPage` deriva sus tarjetas de `MENU_POR_ROL` (D6/D8 de #25). Agregar `MIS_VOTACIONES` a
`estudiante` reemplaza el estado vacío sin agregar fetch ni estado a `InicioPage` (restricción del
backlog #25). Rechazado renderizar la lista inline en `InicioPage`: la acoplaría a `votos` y la
volvería una pantalla con efectos. **Sí cambia `InicioPage.spec.tsx` [6.2]**: se parte en
"docente ve vacío" / "estudiante ve la tarjeta". `docente` sigue en `[]`.

### D8 — Contratos regenerados antes del cliente

`packages/contracts` (`pnpm generate:contracts`, `check:drift`) debe regenerarse tras el endpoint;
`votos-api.ts` sólo entonces puede tipar `misDerechos()` contra `components['schemas']`.

## Flujo de datos

```
InicioPage (MENU_POR_ROL.estudiante)
   └─ navegar({nombre:'mis-votaciones'}) ──→ Enrutador ──→ MisVotacionesPage
                                                                 │ useEffect (1 sola vez)
                                                                 ▼
                                          votos-api.misDerechos() ──→ GET /votos/mis-derechos
                                                                          │ AuthGuard → req.usuario
                                                                          ▼
                                                             MisDerechosService.listar(sesion)
                                                                          │ Prisma findMany
                                                                          ▼
                                                   DerechoVoto ⨝ ProcesoElectoral(abierto) ⨝ Voto?
                                                                          │
   ya_voto:false → navegar('/votar/:id') ←── MiDerechoVotoDto[] ──────────┘
   ya_voto:true  → tarjeta bloqueada "Ya votaste"
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/src/votos/dto/mi-derecho-voto.dto.ts` | Crear | `MiDerechoVotoDto` + `ProcesoDerechoDto` |
| `apps/backend/src/votos/mis-derechos.service.ts` | Crear | `listar(sesion)`: filtro D1, orden, `ya_voto` (D6) |
| `apps/backend/src/votos/mis-derechos.service.spec.ts` | Crear | Unit tests RED |
| `apps/backend/src/votos/votos.controller.ts` | Modificar | `@Get('mis-derechos')` sin query/param (D5) |
| `apps/backend/src/votos/votos.controller.spec.ts` | Modificar | Casos del handler nuevo |
| `apps/backend/src/votos/votos.module.ts` | Modificar | Registrar `MisDerechosService` |
| `packages/contracts/src/generated/api.ts` | Regenerar | D8 |
| `apps/frontend/src/app/rutas.ts` | Modificar | Variante `mis-votaciones` + `rutaAPath` |
| `apps/frontend/src/app/Enrutador.tsx` | Modificar | `case 'mis-votaciones'` |
| `apps/frontend/src/app/menu-por-rol.ts` | Modificar | `MIS_VOTACIONES`; `estudiante: [MIS_VOTACIONES]` |
| `apps/frontend/src/app/InicioPage.spec.tsx` | Modificar | Partir [6.2] (D7) |
| `apps/frontend/src/votos/MisVotacionesPage.tsx` (+ `.spec.tsx`) | Crear | Contenedor de carga única |
| `apps/frontend/src/votos/votos-api.ts` | Modificar | `misDerechos()` |
| `apps/frontend/src/app/rutas.spec.ts` | Modificar | Parser/inversa de la ruta nueva |

## Contratos

```ts
// mi-derecho-voto.dto.ts — ningún campo revela la elección (D6/ADR-0010)
class ProcesoDerechoDto { id: string; nombre: string; tipo: TipoProceso; fecha_cierre_prevista: string }
class MiDerechoVotoDto { derecho_voto_id: string; en_calidad_de: string; ya_voto: boolean; proceso: ProcesoDerechoDto }
```

```ts
// mis-derechos.service.ts — núcleo (D1/D2/D4/D6)
this.prisma.derechoVoto.findMany({
  where: { usuario_id: sesion.userId,
           proceso: { estado: 'abierto', fecha_cierre_prevista: { gt: new Date() } } },
  select: { id: true, en_calidad_de: true,
            proceso: { select: { id: true, nombre: true, tipo: true, fecha_cierre_prevista: true } },
            votos: { select: { id: true }, take: 1 } },
  orderBy: { proceso: { fecha_cierre_prevista: 'asc' } },
});
```

`GET /votos/mis-derechos` → `200 MiDerechoVotoDto[]` (vacío incluido) | `401` sin sesión. **Sin
`403`**: no hay recurso ajeno direccionable.

## Estrategia de pruebas

| Capa | Qué | Cómo |
|---|---|---|
| Unit (service) | Filtro D1 (abierto/cerrado/borrador), orden por cierre, doble `en_calidad_de` sin colapsar, `ya_voto` true/false, lista vacía por rol sin derechos | `PrismaService` mockeado, mismo estilo que `papeleta.service.spec.ts` |
| Unit (controller) | El handler pasa `req.usuario` y **no lee query**; `?usuario_id=X` no altera el argumento | `votos.controller.spec.ts` |
| Contract | DTO serializado no contiene `lista_id`/`opcion_id`/`candidato_id`/`blanco`/`codigo_comprobante` | Assert sobre `Object.keys` |
| Componente | Carga única (1 fetch), entrada pendiente navega, entrada `ya_voto` sin handler, estado vacío genérico | RTL + `votos-api` mockeado |
| Routing | `/mis-votaciones` parsea e invierte; `/mis-votaciones/algo` → `no-encontrada` | `rutas.spec.ts` |
| Regresión | `votos.service.spec.ts` y `VotacionPage.spec.tsx` sin modificar y en verde | `pnpm turbo run test` |

## Threat matrix

Filas genéricas de `references/threat-matrix.md` (rutas tipo documentación, selección de repo Git,
estado de commit/push, comandos de PR): **N/A** — el change no ejecuta shell, subprocesos, Git ni
automatización de PR. Filas de dominio aplicables (convención ya usada en #12/#14):

| Frontera | Caso adversario | Respuesta de diseño | Test RED |
|---|---|---|---|
| IDOR / enumeración | `?usuario_id=<ajeno>`, `usuario_id` en body | D5: sin `@Query()`/`@Param()`; el id sale sólo de `req.usuario` | Controller: la query no cambia el argumento |
| Secreto del voto | Cliente infiere la elección desde el listado | D6: DTO cerrado, sólo `ya_voto` | Contract: `Object.keys` |
| Enrutamiento (cliente) | `/mis-votaciones/../../etc/passwd`, sub-rutas inexistentes | `parsearRuta` total ya existente; variante exige `length === 1` | `rutas.spec.ts` |
| Ventana temporal | Derecho cerrado listado como votable | D1 alineado con `emitir()`; autoridad final en `POST /votos` | Service: proceso cerrado excluido |

## Migración / rollout

Sin migración: no hay cambios de esquema ni de datos. Rollback = revertir commits (proposal).

## Preguntas abiertas

- [ ] `spec.md` dice `now() < cierre_real`; D1 lo corrige a `estado='abierto' AND now() <
      fecha_cierre_prevista`. **Requiere enmienda del spec** antes de `sdd-apply` para que
      `sdd-verify` no marque desvío.
- [ ] Etiqueta de UI para `en_calidad_de: 'padre'` ("Como padre/madre" vs. texto literal) — decisión
      de copy, no bloquea el diseño.
