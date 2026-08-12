# Diseño: administracion-procesos-electorales (Backlog #11)

## Enfoque técnico

Un módulo nuevo `ProcesosModule` (`apps/backend/src/procesos/`) con **un** controlador `/procesos` y
**dos** servicios —`ProcesosService` (escritura y CRUD de borrador) y `PadronService` (conteo en
vivo, solo lectura)— sobre `PrismaService`, `AuthGuard`/`RolesGuard`/`@Roles()` de #4 y
`AuditoriaService.log(tx, …)` de #3. Se mantiene literal el idioma de #7/#8/#10: DTO planos con
`@ApiProperty` únicamente, sin `class-validator`, sin `ValidationPipe`, sin filtro global de
excepciones; validación manual en el servicio y catálogo de códigos local al módulo.

**Con migración**, a diferencia de #8: un delta aditivo declarado explícitamente contra el grupo 2
(`Estructura del proceso electoral`) de `base-schema-and-migrations` — ver D1. La dependencia de
la propuesta era `#8`/`#10`; este delta la amplía y por eso se declara aquí de forma nominal.

El frontend es la **primera UI real** del proyecto (hasta hoy solo `HealthPage`): un asistente
contenedor/presentacional con `useReducer` puro, sin router ni librería de estado nueva (D7).

**Ampliación confirmada (proposal, 2026-08-11): login mínimo.** El asistente no es operable sin
sesión, así que este change agrega también la pantalla de login, el guard de ruta y un app shell
mínimo que aloja al asistente (D8), contra los endpoints ya existentes de #4/#5 — **sin backend de
negocio nuevo**, solo tres correcciones de superficie: decoraciones OpenAPI de `/auth` para que el
cliente generado tipe body y respuesta (D9), y un proxy de desarrollo que mantiene el mismo origen
que Caddy da en producción (D10). El guard bloquea todo lo demás, por eso el login se entrega
**primero** en la cadena de PR.

## Decisiones de arquitectura

### D1 — Delta de schema: enum `PublicoObjetivo`, enum `AlcanceSegmentacion` y snapshot en `ProcesoElectoral`

**Delta declarado contra `base-schema-and-migrations`, grupo 2** (`schema.prisma:162-207`,
`migrations/20260807040013_electoral_process_structure/migration.sql`). Migración nueva:
`apps/backend/prisma/migrations/20260811010000_proceso_publico_objetivo_snapshot/migration.sql`.

```sql
-- CreateEnum
CREATE TYPE "PublicoObjetivo" AS ENUM ('estudiantes', 'padres', 'comunidad');
CREATE TYPE "AlcanceSegmentacion" AS ENUM ('institucion', 'nivel', 'grados', 'aulas');

-- AlterTable
ALTER TABLE "ProcesoElectoral"
  ADD COLUMN "publico_objetivo"   "PublicoObjetivo"      NOT NULL DEFAULT 'estudiantes',
  ADD COLUMN "alcance"            "AlcanceSegmentacion"  NOT NULL DEFAULT 'institucion',
  ADD COLUMN "nivel_id_snapshot"  UUID,
  ADD COLUMN "grado_ids_snapshot" UUID[]                 NOT NULL DEFAULT ARRAY[]::UUID[];

-- Los DEFAULT existen solo para poblar filas preexistentes; se retiran acto seguido para que el
-- cliente de Prisma exija ambos campos en cada `create` (ver "Fundamento").
ALTER TABLE "ProcesoElectoral" ALTER COLUMN "publico_objetivo" DROP DEFAULT;
ALTER TABLE "ProcesoElectoral" ALTER COLUMN "alcance"          DROP DEFAULT;
```

| Columna | Tipo | Nullability | Default final | Motivo |
|---|---|---|---|---|
| `publico_objetivo` | `PublicoObjetivo` | `NOT NULL` | ninguno | Todo proceso tiene un público; sin default, omitirlo **no compila** |
| `alcance` | `AlcanceSegmentacion` | `NOT NULL` | ninguno | Discriminador del modo de selección; sin él, "toda la institución" y "aulas elegidas a mano" son indistinguibles al reabrir |
| `nivel_id_snapshot` | `UUID` | `NULL` | — | `NULL` cuando `alcance ∈ {institucion, grados, aulas}` |
| `grado_ids_snapshot` | `UUID[]` | `NOT NULL` | `'{}'` | Vacío salvo `alcance = 'grados'`; mismo patrón que `Configuracion.dominios_google` de #10 |
| `ocultar_resultados` | — | **sin cambios** | `false` | Decisión 3 de la propuesta: el pre-marcado vive en el asistente (D7), no en el schema |

**Fundamento del `ADD DEFAULT` + `DROP DEFAULT`**: un default permanente haría que
`prisma.procesoElectoral.create({…})` sin `publico_objetivo` compile y persista `'estudiantes'` en
silencio — el modo de fallo exacto que este change debe evitar. Retirarlo tras poblar deja el campo
obligatorio en el tipo generado; los fixtures existentes que crean `ProcesoElectoral`
(`test/schema/electoral.spec.ts`, `voting.spec.ts`, `support-tables.spec.ts`) fallarán en
**typecheck**, que es el aviso correcto y ruidoso.

**`nivel_id_snapshot`/`grado_ids_snapshot` NO llevan `@relation`**, deliberadamente: son un
snapshot histórico, no una referencia viva. Una FK agregaría aristas `Restrict` nuevas que
bloquearían el `DELETE` de un `Nivel`/`Grado` por un borrador viejo, e invertiría la semántica —
el registro debe conservar qué se eligió aunque el árbol académico cambie después. El alcance
**efectivo** sigue viviendo en `ProcesoAula` (D3), que sí es FK.

| Alternativa | Veredicto |
|---|---|
| Todo derivado, sin columnas nuevas (opción 1 de `exploration.md`) | Vetada por la decisión 1 de la propuesta: impide la reedición fiel del borrador |
| `TEXT` + `CHECK` en vez de `enum` | El grupo 2 ya define `TipoProceso`/`EstadoProceso`/`EstadoParticipacion` como enums nativos; `TEXT`+`CHECK` es la convención de `EventoAuditoria` (D7 de #2), justificada allí por `entity_type` heterogéneo. **Descartada** |
| `Json` con `{ nivel, grados, alcance }` | Sin tipado, sin validación en la base, y `sdd-verify`/#13 tendrían que parsear. **Descartada** |
| Boolean `alcance_institucional` + inferir el resto | Un discriminador de 4 estados codificado en 3 campos es una invariante implícita que se pudre. **Descartada** |
| Tablas `ProcesoNivel`/`ProcesoGrado` | Dos tablas y dos migraciones para un dato de solo lectura que nadie consulta por join. **Descartada** |

**Gotcha para el futuro**: agregar un valor al enum (`docentes`, ver Preguntas abiertas) exige
`ALTER TYPE "PublicoObjetivo" ADD VALUE 'docentes'`, que en Postgres **no puede usarse en la misma
transacción que lo crea**; esa migración futura debe ser un archivo propio que solo agregue el
valor. Crear el tipo y usarlo en la misma migración (lo que hace este delta) sí es legal.

### D2 — Padrón en vivo: dos `groupBy` de Prisma, conteo de **derechos** y no de cuentas

**Elección**: `PadronService.calcular(segmentacion)` ejecuta tres agregaciones sin SQL crudo.

```ts
const anioEscolarId = await this.configuracionLectura.anioEscolarActivoId();   // D2b
if (!anioEscolarId) throw new ConflictException({ codigo: SIN_ANIO_ESCOLAR_ACTIVO });

const baseWhere: Prisma.MatriculaWhereInput = {
  anio_escolar_id: anioEscolarId,
  aula_id: { in: aulaIds },
  usuario: { estado: 'activo', rol: 'estudiante' },      // regla de elegibilidad base (revisable)
};

const [porAula, conApoderadoPorAula, cuentasDistintas] = await this.prisma.$transaction([
  this.prisma.matricula.groupBy({ by: ['aula_id'], where: baseWhere, _count: { _all: true } }),
  this.prisma.matricula.groupBy({
    by: ['aula_id'],
    where: { ...baseWhere, usuario: { ...baseWhere.usuario, apoderados: { some: {} } } },
    _count: { _all: true },
  }),
  this.prisma.usuario.count({
    where: { estado: 'activo', rol: 'estudiante', matriculas: { some: baseWhere } },
  }),
]);
```

**El conteo es de derechos, no de personas ni de cuentas** — consecuencia directa de `ADR-0011`
(el padre **no tiene cuenta**: vota con la del estudiante, y el derecho se distingue por
`DerechoVoto.en_calidad_de`). Por eso:

| `publico_objetivo` | Derechos por aula | Calidad que #13 materializará |
|---|---|---|
| `estudiantes` | `estudiantes` | `estudiante` |
| `padres` | `con_apoderado` | `padre` |
| `comunidad` | `estudiantes + con_apoderado` | dos filas sobre la **misma** cuenta |

`cuentasDistintas` es la red de seguridad del único supuesto no garantizado por el schema:
`@@unique([usuario_id, aula_id, anio_escolar_id])` **no** impide que un estudiante tenga matrícula
activa en dos aulas del mismo año, y entonces sumaría dos veces. Cuando
`estudiantes !== cuentasDistintas`, la respuesta incluye `aviso: 'MATRICULA_DUPLICADA'` y el
asistente lo muestra (no lo bloquea — corregirlo es trabajo de #8, no de este change).

| Alternativa | Veredicto |
|---|---|
| Un `$queryRaw` con `COUNT(*) FILTER (WHERE …)` | Fuera del idioma del proyecto (D4 de #2: sin SQL crudo salvo índices parciales/CHECK), pierde tipos y obliga a sanear los UUID a mano. **Descartada** |
| `findMany` + conteo en memoria | Trae miles de filas de padrón institucional para devolver un número. **Descartada** |
| Materializar `DerechoVoto` y contar filas | Explícitamente prohibido por la spec ("Cálculo de padrón en vivo sin materialización") — es #13. **Descartada** |

**Aislamiento**: `$transaction([...])` en lote corre bajo el `READ COMMITTED` por defecto, así que
las tres agregaciones pueden ver snapshots distintos bajo matrícula concurrente. **Aceptado**: el
número es una estimación en vivo por definición y solo se congela en #13. Subir a
`RepeatableRead` traería reintentos sobre `40001` que el proyecto no implementa en ninguna parte.

### D2b — Año escolar activo: se resuelve por `AnioEscolar.activo`, no por `Configuracion.anio_escolar_id`

**Elección**: método nuevo `ConfiguracionLecturaService.anioEscolarActivoId(): Promise<string | null>`
implementado como `anioEscolar.findFirst({ where: { activo: true }, select: { id: true } })`.

**Fundamento — evidencia, no preferencia**: `AniosEscolaresService.activar()`
(`apps/backend/src/academico/anios-escolares.service.ts`) desactiva y activa filas de
`AnioEscolar` dentro de su `$transaction` y **nunca** sincroniza `Configuracion.anio_escolar_id`;
esa columna solo aparece en `eliminar()` como guarda de dependientes
(`anios-escolares.service.ts:219,243-247`). Es decir, `Configuracion.anio_escolar_id` **puede
quedar desfasado** respecto del año realmente activo. La fuente de verdad es el índice único
parcial `anio_escolar_activo_unico_idx` (`20260807033309_identity_and_academic_tree`), y por eso
el padrón se ancla ahí. Se ubica el método en `ConfiguracionLecturaService` —el punto de
integración con #10 que fija la propuesta— para que #13 y #16 hereden la misma regla sin
duplicarla; ese módulo ya tiene solo `PrismaService` y no importa a nadie, así que el grafo de DI
sigue acíclico y `pnpm openapi:extract` sigue corriendo sin Postgres vivo.

**Sin año activo ⇒ `409 SIN_ANIO_ESCOLAR_ACTIVO`, fail-closed.** Nunca contar sobre todos los años.

### D3 — `ProcesoAula` es el único eje de alcance persistido, para los cuatro tipos

Resolución del conjunto de aulas, en este orden de precedencia, siempre acotada al año activo:

| `alcance` | Origen del conjunto | Tipos que lo admiten |
|---|---|---|
| `aulas` | `aula_ids` del body | los 4 |
| `grados` | todas las aulas de `grado_ids` | los 4 |
| `nivel` | todas las aulas de los grados de `nivel_id` | los 4 |
| `institucion` | todas las aulas del año activo | `municipio`, `consulta`, `padres` — **prohibido** para `representante_aula` |

Sobre ese conjunto se aplica la **exclusión de aulas sin matrícula activa** (regla revisable de la
propuesta): un aula con `estudiantes = 0` no genera fila de `ProcesoAula`. La exclusión se evalúa
sobre *matrícula activa*, no sobre *derechos > 0* — un aula con estudiantes pero sin ningún
`Apoderado` registrado en un proceso de `padres` **sí** genera `ProcesoAula` (con 0 derechos), tal
como está redactada la spec. Conjunto elegible vacío ⇒ `409 SEGMENTACION_SIN_ELEGIBLES`.

**Se materializa `ProcesoAula` también para `municipio`/`consulta`/`padres`**, no solo para el
lote de `representante_aula`. Fundamento: D6 de `base-schema-and-migrations` fija `ProcesoAula`
como único eje de alcance, y #13 leerá esas filas para materializar `DerechoVoto`. Dejar el
conjunto vacío como convención de "toda la institución" haría indistinguible un proceso
institucional de uno mal configurado; el snapshot de D1 ya conserva la **intención** del usuario y
`ProcesoAula` conserva su **resolución**.

**Creación en lote de `representante_aula` (decisión 2 de la propuesta)**: **un**
`ProcesoElectoral` + **N** `ProcesoAula`, en una sola `$transaction`, **sin validar `Candidato`**
(no existe hasta #12; el bloqueo de `TECH-DESIGN` Flujo 3 es de #13). Nota de consecuencia para
#12/#16: con un proceso que cubre N aulas, el escrutinio por aula deberá apoyarse en
`DerechoVoto.aula_snapshot` —`Voto` no tiene columna de aula—, que existe desde #2 exactamente
para esto.

### D4 — `POST /procesos/padron` para el conteo; rutas estáticas antes de las paramétricas

**Elección**: el cálculo en vivo es un `POST` sin efectos secundarios y **sin auditoría** (es una
lectura). Su body es el **mismo** DTO de segmentación que consume `POST /procesos`.

| Alternativa | Veredicto |
|---|---|
| `GET /procesos/padron?aula_ids=…` repetido | Cientos de UUID de aula en query string rozan el límite práctico de URL y obligan a un parser de listas que el proyecto no tiene. **Descartada** |
| `GET /procesos/:id/padron` | El conteo se necesita **antes** de que el proceso exista (pasos 2-3 del asistente). **Descartada** |
| `POST /procesos/padron` con DTO compartido | **Elegida** |

**Gotcha de enrutamiento de Nest**: `@Post('padron')` se declara **antes** de `@Post()`, y
`@Get(':id')` no colisiona con `padron` porque no existe `GET /procesos/padron`. Aun así el orden
de declaración se fija por convención: estáticas primero, paramétricas después — invertirlo haría
que `ParseUUIDPipe` respondiera `400` sobre una ruta válida.

### D5 — Catálogo de errores local y reparto 400 / 404 / 409

`apps/backend/src/procesos/procesos.errors.ts`, constante `as const` + union type — mismo formato
que `users.errors.ts` y `academico.errors.ts`.

| Caso | HTTP | Body |
|---|---|---|
| Campo requerido ausente, enum desconocido, `fecha_cierre_prevista <= fecha_apertura_prevista` | `400` | `{ codigo: 'CAMPO_INVALIDO', campo, motivo: 'requerido' \| 'formato' \| 'rango' }` |
| `nivel_id`/`grado_ids`/`aula_ids` que no existen o no pertenecen al año activo | `409` | `{ codigo: 'REFERENCIA_INEXISTENTE', entidad, campo, valor }` |
| `alcance` incompatible con el `tipo` (p. ej. `representante_aula` + `institucion`) | `409` | `{ codigo: 'SEGMENTACION_INVALIDA', tipo, alcance }` |
| Ninguna aula del conjunto tiene matrícula activa | `409` | `{ codigo: 'SEGMENTACION_SIN_ELEGIBLES', aulas_evaluadas }` |
| `PATCH`/`DELETE` sobre `estado != borrador` | `409` | `{ codigo: 'PROCESO_NO_EDITABLE', estado }` |
| No hay `AnioEscolar` con `activo = true` | `409` | `{ codigo: 'SIN_ANIO_ESCOLAR_ACTIVO' }` |
| `:id` inexistente / malformado | `404` / `400` | body por defecto de Nest / `ParseUUIDPipe` |
| Sin cookie / rol no autorizado | `401` / `403` | `AuthGuard` / `RolesGuard`, sin cambios |

Reparto heredado literalmente de D2 de #7 y D5 de #8: `400` cuando el valor es inaceptable **por sí
mismo**; `409` cuando el request está bien formado y lo que lo impide es el **estado actual de la
base**. `422` sigue sin usarse en el proyecto.

### D6 — Tres claves de auditoría, un evento por operación (nunca uno por `ProcesoAula`)

Aditivas en `apps/backend/src/auditoria/audit-event-types.ts`:

| Clave | `entity_type` | Payload |
|---|---|---|
| `PROCESO_CREADO` | `ProcesoElectoral` | `{ tipo, publico_objetivo, alcance, nivel_id_snapshot, grado_ids_snapshot, aulas: N, ocultar_resultados }` |
| `PROCESO_EDITADO` | `ProcesoElectoral` | `{ campos: [...], aulas_antes: N, aulas_despues: M }` |
| `PROCESO_ELIMINADO` | `ProcesoElectoral` | `{ tipo, publico_objetivo, aulas: N }` |

La spec exige **exactamente una** fila `PROCESO_CREADO` por proceso, incluida la creación en lote:
las N `ProcesoAula` viajan como el conteo `aulas`, no como N eventos. **Verificación de no-ruptura
(patrón D4 de #7/#8)**: la cláusula versionada de ADR-0016 es
`FOR EACH ROW WHEN (NEW.event_type IN ('VOTO','RECHAZO'))`
(`migrations/20260807052206_append_only_audit/migration.sql:81`); ninguna de las tres claves toca
un `Voto`, así que la obligación **no se activa** — cero SQL, solo un objeto `as const` más grande
y un caso más en `test/schema/auditoria.spec.ts` [TM4].

`POST /procesos/padron` **no audita**: es una lectura, y auditar cada tecleo del asistente
inundaría un stream append-only irreparable (ADR-0010).

### D7 — Frontend: contenedor/presentacional + `useReducer`, sin router ni librería de estado

`apps/frontend/src/procesos/` es el **primer feature folder** del proyecto; `src/pages/HealthPage.tsx`
queda como está. El asistente ya **no** se monta desde `main.tsx`: se monta como contenido del
`AppShell`, detrás del `AuthGuard` (D8).

```
apps/frontend/src/procesos/
├── ProcesoWizardPage.tsx      contenedor: reducer + navegación + submit; único componente con efectos
├── wizard-reducer.ts          estado, acciones e invariantes entre pasos — función pura, sin DOM
├── procesos-api.ts            wrappers sobre createSeeiClient('/api')
├── usePadronEnVivo.ts         hook: debounce 300 ms + AbortController + { cargando, datos, error }
└── pasos/
    ├── PasoDatos.tsx          nombre, descripción, tipo, fechas
    ├── PasoPublico.tsx        publico_objetivo + alcance + nivel/grados/aulas
    ├── PasoPadron.tsx         conteo en vivo, desglose por aula, aulas excluidas, aviso de duplicados
    └── PasoRevision.tsx       resumen + checkbox `ocultar_resultados` + confirmar
```

**Los cuatro pasos son `1 Datos → 2 Público y segmentación → 3 Padrón en vivo → 4 Revisión`.** Se
desvía de `Design.md 1f` (`datos → público → cargos y candidatos → revisión`) porque *cargos y
candidatos* es #12 y no existe: se sustituye ese paso por el padrón en vivo en vez de mostrar un
paso vacío. El conteo se recalcula al cambiar la segmentación (paso 2) y se vuelve a mostrar como
resumen en el paso 4.

| Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|
| Estado | `useReducer` con un `EstadoAsistente` y un discriminador `paso` | 6-8 `useState` sueltos; Zustand/Redux | Hay invariantes entre pasos (cambiar `tipo` invalida `alcance`; cambiar `alcance` invalida la selección) — un reducer las concentra en un archivo puro y testeable sin DOM. Ninguna librería de estado está instalada y una sola pantalla no la justifica |
| Navegación | Estado local `paso: 1..4`, sin URL | `react-router-dom` | No hay router ni app shell; introducirlo arrastra layout, guardas de sesión y ruteo de toda la app — cambio propio, no de #11 |
| Datos remotos | `usePadronEnVivo` con `AbortController` | `@tanstack/react-query` | React Query está previsto por el BACKLOG para #16 (polling de resultados); adelantarlo acá agrega dependencia y patrón sin necesitar caché ni refetch en foco |
| `ocultar_resultados` | Estado inicial `true` en el reducer para proceso **nuevo**; al reabrir un borrador toma el valor persistido | Cambiar `@default` del schema | Decisión 3 de la propuesta, literal: el pre-marcado es de la capa de aplicación |
| Carrera de conteos | Cada petición lleva un número de secuencia; se aborta la anterior y se descarta toda respuesta que no sea la última | Solo `debounce` | Con debounce solo, dos respuestas fuera de orden dejan en pantalla el padrón de una segmentación ya descartada — el error más caro de esta UI |

**Dependencia de orden**: `procesos-api.ts` se tipa contra `packages/contracts`, así que los PR de
frontend **no pueden mergear antes** de regenerar el contrato en el PR que cierra el controlador.

### D8 — Login mínimo: contexto de sesión anclado a `whoami`, guard por composición, app shell de un nivel

Resuelve la pregunta abierta #1 del diseño original. **Cero backend de negocio nuevo**: se consumen
`POST /auth/login`, `POST /auth/google`, `GET /auth/whoami` y `POST /auth/logout`, tal como los
dejó #4/#5 (`apps/backend/src/auth/auth.controller.ts:56-170`).

#### Corrección de premisa: el login es por **`codigo`**, no por correo

La ampliación de alcance de la propuesta dice "email/contraseña", pero el backend **no acepta
correo**: `LoginDto` declara `codigo!: string` (`apps/backend/src/auth/dto/login.dto.ts:5-11`) y
`AuthService.login()` resuelve con `findUnique({ where: { codigo: dto.codigo } })`
(`auth.service.ts:78`); el propio DTO documenta que "aceptar `correo` queda para un change
posterior". El formulario pide entonces **código institucional + contraseña**. Aceptar correo
exigiría un `findFirst` por `correo` en `AuthService` — cambio de #4, no de #11. El correo sí es la
identidad del flujo Google, porque el `hd`/`email` viajan dentro del ID token.

#### Estructura de componentes

```
apps/frontend/src/auth/
├── AuthProvider.tsx            contenedor único con efectos: whoami al montar + login/logout
├── sesion-context.ts           createContext + useSesion() (lanza si falta el provider)
├── auth-api.ts                 wrappers sobre createSeeiClient('/api') para las 4 rutas
├── AuthGuard.tsx               composición: cargando | <LoginPage/> | children
├── LoginPage.tsx               contenedor de pantalla: orquesta credenciales, Google y errores
├── FormularioCredenciales.tsx  presentacional puro (código, contraseña, submit, mensaje)
├── BotonGoogle.tsx             presentacional puro (render del botón GIS + estado deshabilitado)
├── DialogoVinculacion.tsx      presentacional puro: segundo paso de VINCULACION_REQUERIDA
└── useGoogleIdentity.ts        hook: carga del script GIS, initialize/renderButton, callback
apps/frontend/src/app/
├── App.tsx                     <AuthProvider><AuthGuard><AppShell>…</AppShell></AuthGuard></AuthProvider>
└── AppShell.tsx                presentacional: encabezado (rol + "Cerrar sesión") + <main>{children}</main>
```

Mismo idioma de D7: **un solo componente con efectos** (`AuthProvider`), todo lo demás
presentacional y testeable sin red. `AuthGuard` no es un guard de router —no hay router— sino un
componente de composición que decide qué árbol renderizar.

#### Dónde vive el estado de sesión

| Decisión | Elegido | Rechazado | Fundamento |
|---|---|---|---|
| Fuente de verdad | `GET /auth/whoami` una vez al montar `AuthProvider`, resultado en `useState` dentro del contexto | Espejo en `localStorage`/`sessionStorage`; decodificar la cookie | La cookie `seei_session` es `httpOnly` (`auth.controller.ts:69-74`): el JS **no puede leerla**. Cualquier espejo en cliente puede quedar desincronizado de Redis (sesión revocada por `#6`, techo absoluto de `SessionService`) y afirmar una sesión que ya no existe. `whoami` es la única fuente que no miente |
| Forma del estado | `{ estado: 'cargando' \| 'anonimo' \| 'autenticado', sesion?: SesionUsuario }` | `sesion: SesionUsuario \| null` | Con `null` no se distingue "todavía no pregunté" de "no hay sesión", y el guard parpadearía el login en cada recarga antes de resolver `whoami` |
| Datos remotos | `fetch` vía cliente generado + `AbortController`, sin caché | `@tanstack/react-query` | Misma razón que D7: no está instalada y hay exactamente una consulta |
| Refresco | Ninguno periódico; la expiración se detecta **por reacción** al primer `401` de cualquier llamada | Polling de `whoami` | Un poll no evita la carrera (la sesión puede caer entre dos polls); reaccionar al `401` real es exacto y gratis |
| Post-login | Se vuelve a llamar `whoami` tras un login exitoso | Confiar en el body de `POST /auth/login` | El body es `{ mensaje: 'Login exitoso' }` (`auth.controller.ts:76`) — **no trae rol ni userId**; el shell necesita el rol para el encabezado |

`AuthProvider` expone `alRecibir401()` a `auth-api.ts` y a `procesos-api.ts`: cualquier `401` pasa
el estado a `anonimo`, lo que hace que `AuthGuard` desmonte el asistente y muestre el login. Es el
único acoplamiento entre `auth/` y `procesos/`, y va en ese sentido (el feature no importa al
provider; recibe el callback).

#### Manejo de errores — se reusan los mensajes del backend, y son **deliberadamente indistinguibles**

| Situación real | Lo que devuelve el backend | Lo que muestra la UI |
|---|---|---|
| Contraseña incorrecta, usuario inexistente, **cuenta bloqueada**, cuenta inactiva | `401 { message: 'Credenciales inválidas' }` — **uno solo para las cuatro** (`auth.service.ts:81-95`) | `Credenciales inválidas` y nada más |
| Google: token inválido, dominio no institucional, cuenta inexistente/bloqueada/inactiva, `google_id` en conflicto | `401 { message: 'Credenciales inválidas' }` (`auth.service.ts:147,155,163,174,182,243`) | El mismo texto |
| Google sobre cuenta con contraseña previa y sin vincular | `409 { codigo: 'VINCULACION_REQUERIDA' }` (`auth.service.ts:194`) | `DialogoVinculacion`: pide la contraseña actual y reenvía `POST /auth/google` con `{ idToken, password }` |
| Red caída / 5xx | — | `No se pudo contactar con el servidor` + botón de reintento, sin limpiar lo tecleado |
| Sesión expirada durante el asistente | `401` en cualquier ruta | Vuelta al login con `Tu sesión expiró, iniciá sesión de nuevo` (texto de cliente: el `401` no trae uno propio) |

**No se puede mostrar "cuenta bloqueada" en el login, y no es un olvido**: el `401` uniforme es la
defensa anti-enumeración que fija D3 de #4 y que `bloqueo-desbloqueo-cuentas` (#6) preservó
explícitamente. Inventar un mensaje diferenciado en el cliente sería reintroducir en la UI el
oráculo que el backend cierra a propósito. El canal legítimo para ver bloqueos es
`GET /auth/usuarios/bloqueados`, que ya existe, exige sesión con rol y **no** pertenece al login.
`VINCULACION_REQUERIDA` es la única excepción, y lo es porque el backend ya la distingue: quien la
recibe probó, con un ID token firmado por Google, que controla ese buzón.

#### Integración con el app shell

`AppShell` es de **un solo nivel**: encabezado con el rol de la sesión y el botón "Cerrar sesión",
y un `<main>` que recibe children. Sin navegación, sin menú, sin dashboard — el
`Out of Scope` de la propuesta lo excluye. Hoy su único hijo es `ProcesoWizardPage`; cuando #12-#17
agreguen pantallas, el punto donde entra un router es este componente y ninguno de los de `auth/`.
`main.tsx` pasa a montar `<App/>`; `HealthPage` queda accesible como antes solo si se la monta a
mano, sin ruta (no hay router) — se la deja fuera del shell a propósito, es una pantalla de
diagnóstico, no de producto.

**Logout**: `POST /auth/logout` es `204` e idempotente y limpia la cookie del lado servidor
(`auth.controller.ts:145-154`); el provider pasa a `anonimo` **incluso si la llamada falla** — dejar
al usuario "adentro" porque la red se cayó es el peor de los dos errores.

### D9 — Las rutas de `/auth` se decoran para el contrato antes de consumirlas desde el cliente generado

**Elección**: agregar `@ApiBody({ type: LoginDto })` / `@ApiBody({ type: GoogleLoginDto })` y
`@ApiResponse({ …, type })` con DTO de respuesta (`MensajeDto`, `SesionUsuarioDto`) a las cuatro
rutas de `AuthController`, y regenerar `packages/contracts`.

**Fundamento — evidencia**: hoy el contrato generado declara
`AuthController_login: { requestBody?: never; responses: { 200: { content?: never } } }`
(`packages/contracts/src/generated/api.d.ts:794-818`), y lo mismo para `loginGoogle` y `whoami`.
Es decir, `client.POST('/auth/login', { body })` **no compila** y `whoami` no expone `rol`. Es el
mismo defecto que `HealthPage.tsx:4-15` documenta y difiere ("corregir esa decoración es trabajo de
Fase 1 (backend)"): acá el consumidor y el productor caen dentro del mismo change, así que se
corrige en vez de duplicar el contrato a mano.

| Alternativa | Veredicto |
|---|---|
| `fetch` crudo + interfaces locales, como hizo `HealthPage` | Duplica el contrato en el cliente y contradice ADR-0004 (tipos generados). Aceptable como deuda puntual en #3; inaceptable para la superficie de autenticación de toda la app. **Descartada** |
| Decorar solo `whoami` | `POST /auth/login` con `requestBody?: never` obliga igual a un escape de tipos. **Descartada** |
| Decorar las 4 rutas + regenerar | **Elegida** |

**Solo son decoradores de Swagger**: no cambian una línea de comportamiento en runtime, no tocan
`AuthService` ni los guards, y `pnpm openapi:extract` sigue corriendo sin Postgres ni Redis. Los
e2e de #4/#5/#6 no deberían moverse; si alguno rompe, rompió por el contrato, no por el auth.
`SesionUsuarioDto` espeja `SesionUsuario` (`userId`, `rol`, `creadoEn`) —
`apps/backend/src/auth/sesion-usuario.ts:9-13`—, sin agregar campos: nombre y correo del usuario
**no** están en la sesión de Redis y exponerlos exigiría una consulta nueva, que es alcance de otro
change.

### D10 — Google por script GIS sin dependencia nueva, y proxy `/api` en desarrollo para conservar el mismo origen

**Google**: `useGoogleIdentity.ts` inyecta `https://accounts.google.com/gsi/client` una sola vez y
usa `google.accounts.id.initialize({ client_id, callback })` + `renderButton`. El `callback` recibe
`credential` (el ID token) y lo manda a `POST /auth/google`. Sin `@react-oauth/google`: es un
wrapper de ~200 líneas sobre exactamente estas dos llamadas, y ADR-0017 ya rechazó la capa de
Passport por el mismo criterio. **Fail-closed**: sin `VITE_GOOGLE_CLIENT_ID` el botón **no se
renderiza** (no se renderiza deshabilitado ni "roto"), en espejo de la regla de ADR-0017 de que
`GOOGLE_CLIENT_ID` ausente rechaza todo login OAuth en tiempo de request. `VITE_GOOGLE_CLIENT_ID`
y el `GOOGLE_CLIENT_ID` del backend **deben ser el mismo valor**: el backend lo verifica como
`audience`.

**Proxy de desarrollo**: `apps/frontend/vite.config.ts` suma
`server: { proxy: { '/api': 'http://localhost:3000' } }`.

**Fundamento — evidencia**: la cookie es `httpOnly, sameSite: 'lax', path: '/'`
(`auth.controller.ts:69-74`) y `createSeeiClient` **no** setea `credentials`
(`packages/contracts/src/client.ts:13-15`), o sea `same-origin` por defecto; y
`apps/backend/src/main.ts` **no habilita CORS** (7 líneas, solo `setGlobalPrefix` y `listen`). Con
`VITE_API_BASE_URL=http://localhost:3000/api` el navegador ni siquiera guardaría la cookie. Las dos
salidas eran habilitar CORS con `credentials: true` en el backend, o mantener un solo origen. Se
elige el proxy: producción ya es mono-origen detrás de Caddy, así que el proxy hace que desarrollo
y producción compartan camino, y evita abrir CORS —con `sameSite: 'lax'` como única defensa CSRF
(pregunta abierta desde #4), habilitar orígenes cruzados con credenciales sería empeorar esa
postura para comodidad de desarrollo.

## Flujo de datos — sesión: arranque, login y expiración

    main.tsx        AuthProvider          auth-api        Backend #4/#5        AuthGuard
      │ <App/>          │                    │                 │                  │
      │────────────────>│ estado='cargando'  │                 │                  │─> "Cargando…"
      │                 │──whoami()─────────>│──GET /api/auth/whoami──>│          │
      │                 │<─ 200 {userId,rol,creadoEn} ⇒ 'autenticado' ─│          │─> <AppShell><ProcesoWizardPage/>
      │                 │<─ 401 ⇒ 'anonimo' ─────────────────────────│           │─> <LoginPage/>
      │                 │                    │                 │                  │
      │  (login)        │<─ submit {codigo,password} ── LoginPage                 │
      │                 │──POST /api/auth/login──────────────>│  200 + Set-Cookie │
      │                 │                    │  401 ⇒ "Credenciales inválidas" (única causa visible)
      │                 │──whoami()──────────────────────────>│  (el login no devuelve rol)
      │                 │  estado='autenticado' ⇒ el guard monta el shell y el asistente
      │                 │                    │                 │                  │
      │  (Google)       │<─ credential ── useGoogleIdentity ── gsi/client         │
      │                 │──POST /api/auth/google {idToken}───>│  200 ⇒ whoami()   │
      │                 │                    │  409 VINCULACION_REQUERIDA ⇒ DialogoVinculacion
      │                 │                    │  └─ reenvía {idToken, password} ──>│
      │                 │                    │                 │                  │
      │  (expiración)   │<─ 401 de CUALQUIER ruta ── procesos-api / auth-api      │
      │                 │  alRecibir401() ⇒ 'anonimo' ⇒ el guard desmonta el asistente
      │  (logout)       │──POST /api/auth/logout──> 204 (idempotente) ⇒ 'anonimo' aunque falle

## Flujo de datos — cálculo de padrón en vivo

    Asistente (paso 2/3)     ProcesosController         PadronService      ConfiguracionLectura   Prisma
      │ cambia segmentación        │                          │                    │               │
      │ debounce 300 ms + abort    │                          │                    │               │
      │ POST api/procesos/padron ─>│ (AuthGuard, RolesGuard)  │                    │               │
      │                            │──calcular(segmentacion)─>│                    │               │
      │                            │                          │─anioEscolarActivoId()──>│          │
      │                            │                          │<── null ⇒ 409 SIN_ANIO_ESCOLAR_ACTIVO
      │                            │                          │  resolver aulas (D3) ──────────────>│
      │                            │                          │  $transaction([ groupBy, groupBy, count ])
      │                            │                          │  derechos = f(publico_objetivo) (D2)
      │<── 200 { derechos_totales, estudiantes, padres, cuentas_distintas, aulas[], excluidas[], aviso? }
      │                            │        (sin auditoría, sin fila de DerechoVoto)

## Flujo de datos — creación en lote de `representante_aula`

    Asistente (paso 4)   ProcesosController   ProcesosService                         Prisma
      │ POST api/procesos      │                    │                                    │
      │───────────────────────>│──crear(dto, actorId)──────────────────────────────────> │
      │                        │  validar tipo↔alcance ⇒ 409 SEGMENTACION_INVALIDA        │
      │                        │  $transaction:      │                                    │
      │                        │    anioEscolarActivoId() ⇒ null ⇒ 409                    │
      │                        │    resolver aulas del alcance (D3) ────────────────────> │
      │                        │    padron.aulasConMatriculaActiva() ⇒ elegibles          │
      │                        │    elegibles = [] ⇒ 409 SEGMENTACION_SIN_ELEGIBLES       │
      │                        │    procesoElectoral.create({ …, publico_objetivo, alcance, snapshot })
      │                        │    procesoAula.createMany(elegibles)  ── N filas ──────> │
      │                        │    log(tx, PROCESO_CREADO, 'ProcesoElectoral', id, { aulas: N })
      │<── 201 { …proceso, aulas: [...], aulas_excluidas: [...] } ─────────────────────── │

`PATCH` reusa el mismo bloque: verifica `estado === 'borrador'` (si no, `409 PROCESO_NO_EDITABLE`),
`procesoAula.deleteMany({ proceso_id })` + `createMany(nuevas elegibles)` y `PROCESO_EDITADO`, todo
en una `$transaction`. `DELETE` se apoya en el `onDelete: Cascade` que `ProcesoAula` ya declara
hacia `ProcesoElectoral` (#2, grupo 2) y audita `PROCESO_ELIMINADO` en la misma tx.

## Contratos HTTP

Todas bajo el prefijo global `api`, con `@UseGuards(AuthGuard, RolesGuard)` y
`@Roles('administrador', 'director', 'comite')` **a nivel de clase** (decisión 4 de la propuesta —
los tres roles son equivalentes); todo `:id` vía `ParseUUIDPipe`.

| Ruta | Body / filtros | Respuesta |
|---|---|---|
| `POST /procesos/padron` | `SegmentacionDto` | `PadronRespuestaDto` — no persiste nada |
| `POST /procesos` | `CrearProcesoDto` = datos + `SegmentacionDto` + `ocultar_resultados` | `201 ProcesoRespuestaDto` |
| `GET /procesos` | `?estado=&tipo=` (valor desconocido ⇒ `400 CAMPO_INVALIDO`) | `ProcesoRespuestaDto[]`, arreglo desnudo, `orderBy creado_en desc` |
| `GET /procesos/:id` | — | `ProcesoDetalleRespuestaDto` (incluye `publico_objetivo`, snapshot y `aulas[]`) |
| `PATCH /procesos/:id` | `ActualizarProcesoDto` — **sin** `tipo` ni `estado` | `ProcesoRespuestaDto` |
| `DELETE /procesos/:id` | — | `204` |

**`tipo` y `estado` no están en el DTO de actualización**, mismo criterio que D1 de #7 y D3 de #8:
cambiar el tipo de un proceso reinterpretaría toda su segmentación en silencio, y la transición de
`estado` pertenece a #13. Lo prohibido **ni siquiera compila**.

```ts
export interface SegmentacionDto {
  publico_objetivo: 'estudiantes' | 'padres' | 'comunidad';
  alcance: 'institucion' | 'nivel' | 'grados' | 'aulas';
  nivel_id?: string;
  grado_ids?: string[];
  aula_ids?: string[];
}

export interface PadronRespuestaDto {
  derechos_totales: number;
  estudiantes: number;
  padres: number;              // cuentas de estudiante con Apoderado registrado (ADR-0011)
  cuentas_distintas: number;
  aulas: { aula_id: string; estudiantes: number; padres: number; derechos: number }[];
  aulas_excluidas: string[];   // sin matrícula activa
  aviso?: 'MATRICULA_DUPLICADA';
}
```

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `apps/backend/prisma/schema.prisma` | Modificar | Dos enums + cuatro columnas en `ProcesoElectoral` (D1), con comentario de trazabilidad al grupo 2 de #2 |
| `apps/backend/prisma/migrations/20260811010000_proceso_publico_objetivo_snapshot/migration.sql` | Crear | SQL de D1 |
| `apps/backend/src/procesos/procesos.module.ts` | Crear | `imports: [AuthModule, AuditoriaModule, ConfiguracionLecturaModule]`; `NestModule` → `cookieParser()` a `ProcesosController` |
| `apps/backend/src/procesos/procesos.controller.ts` | Crear | Las 6 rutas de "Contratos HTTP" |
| `apps/backend/src/procesos/procesos.service.ts` | Crear | Crear / listar / detalle / editar / eliminar, con auditoría transaccional |
| `apps/backend/src/procesos/padron.service.ts` | Crear | D2/D3: resolución de aulas y agregaciones |
| `apps/backend/src/procesos/procesos.errors.ts` | Crear | Catálogo local (D5) |
| `apps/backend/src/procesos/dto/*.ts` | Crear | `segmentacion.dto.ts`, `crear-proceso.dto.ts`, `actualizar-proceso.dto.ts`, `proceso-respuesta.dto.ts`, `proceso-detalle-respuesta.dto.ts`, `padron-respuesta.dto.ts`, `listar-procesos.query.ts` |
| `apps/backend/src/configuracion/configuracion-lectura.service.ts` | Modificar | `anioEscolarActivoId()` (D2b) |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | Aditivo: las 3 claves de D6 + comentario de trazabilidad |
| `apps/backend/src/app.module.ts` | Modificar | `ProcesosModule` en `imports` |
| `apps/backend/test/schema/{electoral,voting,support-tables}.spec.ts` | Modificar | Fixtures de `ProcesoElectoral` con `publico_objetivo` y `alcance` obligatorios (D1) |
| `apps/backend/test/schema/auditoria.spec.ts` | Modificar | Caso [TM4] con 3 claves más |
| `apps/frontend/src/procesos/**` (9 archivos de D7) | Crear | Asistente de 4 pasos |
| `apps/backend/src/auth/auth.controller.ts` | Modificar | D9: `@ApiBody` + `@ApiResponse({ type })` en `login`, `loginGoogle`, `logout`, `whoami`. **Solo decoradores**, sin cambio de runtime |
| `apps/backend/src/auth/dto/mensaje.dto.ts` | Crear | D9: `{ mensaje: string }` tipado para el contrato |
| `apps/backend/src/auth/dto/sesion-usuario.dto.ts` | Crear | D9: espejo de `SesionUsuario` (`userId`, `rol`, `creadoEn`), sin campos nuevos |
| `apps/frontend/src/auth/**` (9 archivos de D8) | Crear | Login, contexto de sesión, guard y flujo Google |
| `apps/frontend/src/app/{App,AppShell}.tsx` | Crear | Shell mínimo de un nivel que aloja al asistente (D8) |
| `apps/frontend/vite.config.ts` | Modificar | D10: `server.proxy` de `/api` a `http://localhost:3000` |
| `apps/frontend/.env.example` / `docs/onboarding.md` | Modificar | D10: `VITE_GOOGLE_CLIENT_ID`, que debe coincidir con el `GOOGLE_CLIENT_ID` del backend |
| `apps/frontend/src/main.tsx` | Modificar | Montar `<App/>` (no `ProcesoWizardPage` directo — queda detrás del `AuthGuard`) |
| `packages/contracts/openapi.json` + tipos | Regenerar | Dos veces: en el PR de decoraciones de `/auth` (D9) y tras cerrar el controlador de procesos |

## Estrategia de pruebas

| Capa | Qué se prueba | Cómo |
|---|---|---|
| Unit (backend) | Resolución de aulas por `alcance` (4 ramas); compatibilidad `tipo ↔ alcance`; derivación de derechos por `publico_objetivo` incluida la suma doble de `comunidad`; validadores de fechas y de filtros de query | Jest puro, `PrismaService` mockeado |
| Unit (frontend) | `wizard-reducer`: cambiar `tipo` invalida `alcance`; cambiar `alcance` limpia la selección previa; `ocultar_resultados` arranca en `true` para proceso nuevo y respeta el valor persistido al reabrir | Vitest sin DOM |
| Integración | `anioEscolarActivoId()` devuelve el año con `activo = true` **aunque `Configuracion.anio_escolar_id` apunte a otro** (D2b); conteos contra datos sembrados; exclusión de aulas sin matrícula; auditoría en la misma `$transaction` (rollback ⇒ sin fila) | Postgres de `docker-compose.test.yml` |
| E2E | Las 6 rutas: `401` sin cookie, `403` para `docente`/`estudiante`, `200/201` para los tres roles autorizados; lote de `representante_aula` crea 1 proceso + N `ProcesoAula`; `DELETE` cascadea `ProcesoAula`; `PATCH` regenera el conjunto; `PATCH`/`DELETE` sobre `estado != borrador` ⇒ `409` y la fila permanece | `supertest` + `Test.createTestingModule` |
| Componente (frontend) | Navegación de los 4 pasos; el paso 4 muestra el checkbox marcado; el conteo se re-solicita al cambiar la segmentación; respuesta fuera de orden **no** pisa el conteo vigente | Testing Library + `vi.stubGlobal('fetch', …)` |
| Adversarial (RED obligatorio) | `POST /procesos/padron` no crea ni una fila de `DerechoVoto` (conteo directo antes/después); aula sin matrícula activa nunca genera `ProcesoAula`; segmentación con 0 elegibles ⇒ `409`, sin proceso huérfano; `representante_aula` + `alcance = institucion` ⇒ `409`; `aula_ids` de otro año escolar ⇒ `409 REFERENCIA_INEXISTENTE`, nunca contadas; estudiante con dos matrículas activas ⇒ `aviso: 'MATRICULA_DUPLICADA'` y `cuentas_distintas < estudiantes`; `PATCH` con `tipo`/`estado` en el body no los cambia (no están en el DTO); crear proceso con lote de N aulas y forzar rollback ⇒ ni proceso ni `ProcesoAula` ni evento de auditoría | supertest + consultas directas de Prisma |
| Unit (frontend, login) | `auth-api`: mapeo `401 ⇒ 'credenciales'`, `409 VINCULACION_REQUERIDA ⇒ 'vinculacion'`, fallo de red ⇒ `'red'`; reducción del estado del provider (`cargando → autenticado / anonimo`) | Vitest sin DOM |
| Componente (login) | `whoami` `200` monta el shell y **nunca** muestra el formulario; `whoami` `401` muestra el login; submit con `401` deja el código tecleado y muestra `Credenciales inválidas`; `409` abre `DialogoVinculacion` y el reenvío lleva `{ idToken, password }`; "Cerrar sesión" vuelve al login; sin `VITE_GOOGLE_CLIENT_ID` **no** se renderiza el botón de Google | Testing Library + `vi.stubGlobal('fetch', …)` + stub de `google.accounts.id` |
| Adversarial (login, RED obligatorio) | Un `401` de **`/procesos`** (no de auth) también desmonta el asistente y vuelve al login; el asistente **nunca** se renderiza mientras el estado es `cargando` (sin parpadeo de contenido protegido); ningún módulo de `auth/` escribe la sesión en `localStorage`/`sessionStorage` ni lee `document.cookie`; con `logout` fallando (500 o red caída) la UI igual queda `anonimo`; la UI **no** distingue cuenta bloqueada de contraseña incorrecta (mismo texto exacto para ambos fixtures) | Vitest + Testing Library |
| Contrato | `WHEN` del trigger de ADR-0016 intacto tras las 3 claves; `publico_objetivo`/`alcance` sin `DEFAULT` en `information_schema.columns`; `pnpm openapi:extract` corre sin Postgres ni Redis; tras D9 el contrato generado expone `requestBody` en `/auth/login` y `/auth/google` y `rol` en `/auth/whoami` (hoy los tres son `never`) | `test/schema/*.spec.ts`, typecheck de `apps/frontend`, job de CI existente |
| Regresión (backend) | Los e2e de #4/#5/#6 sobre `/auth` siguen verdes tras D9 — son decoradores, no comportamiento | `pnpm turbo run test` existente |

## Matriz de amenazas

N/A — este change no toca enrutamiento de comandos, shell, subprocesos, automatización de VCS/PR,
clasificación de archivos ejecutables ni integración de procesos. No sube ni sirve archivos (a
diferencia de #9/#10). Sus casos adversariales reales —conteo que materializa padrón por error,
aulas de otro año escolar filtrándose al conteo, lote parcialmente creado, escalada por
re-parentado de `tipo`/`estado`, respuesta de conteo fuera de orden— están cubiertos en D1-D7 y en
la fila "Adversarial" de la tabla anterior.

**El login mínimo (D8-D10) no cambia ese veredicto**, pero suma tres superficies que las filas
"Adversarial (login)" y "Contrato" cubren explícitamente: (a) un **script de tercero**
(`accounts.google.com/gsi/client`) cargado en la pantalla de login — origen fijo, sin `eval`, sin
datos de sesión pasados hacia él, y cuando el proyecto adopte CSP este es el origen a declarar;
(b) **material de sesión en el cliente** — mitigado por la regla de D8 de no espejar la sesión en
`localStorage` ni leer `document.cookie`, con test adversarial propio; (c) **CSRF**, que sigue
siendo la pregunta abierta de #4: D10 elige el proxy mono-origen justamente para **no** debilitar
`sameSite: 'lax'` habilitando CORS con credenciales.

## Migración / rollout

Migración **aditiva pura**, sin backfill de negocio ni feature flag: los `DEFAULT` transitorios
pueblan cualquier fila preexistente y se retiran en la misma migración. No hay procesos en
`abierto` ni posteriores en ningún entorno, así que ningún dato está en riesgo.

| # | Paso | Verificación |
|---|---|---|
| R1 | `pnpm prisma migrate deploy` | Cuatro columnas presentes; `publico_objetivo` y `alcance` **sin** `column_default` |
| R2 | `pnpm prisma generate` + typecheck | Los fixtures de `test/schema/*` fallan hasta declarar los dos campos — señal esperada de D1 |
| R3 | Desplegar backend | `POST /procesos/padron` responde con un año escolar activo; `409 SIN_ANIO_ESCOLAR_ACTIVO` sin él |
| R4 | `pnpm generate:contracts` + desplegar frontend | El asistente tipa contra el contrato regenerado |
| R5 | Configurar `VITE_GOOGLE_CLIENT_ID` **igual** al `GOOGLE_CLIENT_ID` del backend (D10) | El botón de Google aparece y un ID token de dominio institucional obtiene sesión; con la variable ausente el botón no se renderiza y el login por código sigue funcionando |
| R6 | Verificación de punta a punta (lo que la pregunta abierta #1 impedía) | Abrir la app sin cookie ⇒ login; iniciar sesión ⇒ shell + asistente; crear un borrador; "Cerrar sesión" ⇒ login |

El login **no** tiene migración ni feature flag: es frontend más decoradores de Swagger. Su
rollback es el `git revert` del PR correspondiente, y no deja rastro en la base — las sesiones
viven en Redis y las emite el backend de #4, que no cambia.

**Rollback**: `git revert` del merge + `down` de la migración (solo elimina columnas y tipos
nuevos; ningún dato preexistente se toca). Los borradores creados durante la ventana se pierden al
revertir la migración — aceptable: un borrador es descartable por definición hasta #13.

## Corte de PR recomendado (insumo para `sdd-tasks`)

Presupuesto de 400 líneas autoradas (`additions + deletions`, código + tests), estrategia
`ask-on-risk`. Cadena de ramas: PR1 → rama de feature; cada PR siguiente apunta al anterior.

**El login abre la cadena**, no la cierra: el `AuthGuard` bloquea el acceso a todo lo demás, así que
mientras no exista, ningún PR posterior es verificable en navegador. Los PR 1-3 son autónomos
respecto de `/procesos` (dependen solo de #4/#5, ya en `main`), así que se pueden revisar y mergear
mientras el backend de procesos avanza.

| PR | Contenido | Estimación | Riesgo de presupuesto |
|---|---|---|---|
| 1 | **Contrato de `/auth`** (D9): `@ApiBody`/`@ApiResponse({ type })` en las 4 rutas + `MensajeDto` + `SesionUsuarioDto` + `pnpm generate:contracts` + proxy `/api` en `vite.config.ts` (D10) + test de contrato | ~180 | Bajo |
| 2 | **Login por código** (D8): `AuthProvider`, `sesion-context`, `auth-api`, `LoginPage`, `FormularioCredenciales`, `AuthGuard`, `AppShell`, `App`, `main.tsx` + logout + unit del provider y componentes | ~390 | **Medio** |
| 3 | **Google en el login** (D8/D10): `useGoogleIdentity`, `BotonGoogle`, `DialogoVinculacion`, flujo `409 VINCULACION_REQUERIDA`, `VITE_GOOGLE_CLIENT_ID` + `.env.example`/`onboarding` + tests | ~250 | Bajo |
| 4 | Cimientos: migración + schema (D1), `anioEscolarActivoId()` (D2b), 3 claves de auditoría (D6), fixtures de `test/schema/*` actualizados, tests de contrato | ~280 | Bajo |
| 5 | `ProcesosModule` + `procesos.errors.ts` + `PadronService` + `POST /procesos/padron` + DTO de segmentación + unit e integración del conteo | ~400 | **Medio** |
| 6 | `POST /procesos`: creación, lote de `ProcesoAula`, exclusión de aulas, auditoría transaccional + e2e y adversariales del lote | ~400 | **Medio** |
| 7 | `GET /procesos`, `GET /:id`, `PATCH`, `DELETE` + e2e de estado y roles + `pnpm generate:contracts` | ~430 | **Medio-alto** |
| 8 | Frontend: `wizard-reducer` + `procesos-api` + pasos 1-2 + unit del reducer y de componentes | ~380 | Bajo |
| 9 | Frontend: `usePadronEnVivo` (debounce/abort/secuencia) + pasos 3-4 + submit + montaje del asistente dentro del `AppShell` | ~400 | **Medio** |

Cortes de respaldo si algún PR se pasa: separar `PATCH` del PR7 (regenera el conjunto de
`ProcesoAula` y es la mitad cara); separar el `AppShell` + `main.tsx` del PR2 si el provider crece.
Los PR de login se mantienen en tres partes a propósito: el contrato (PR1) es mecánico y
regenerado, el flujo por código (PR2) es la lógica de sesión que hay que revisar con cabeza fría, y
Google (PR3) arrastra un script de tercero y una máquina de estados de vinculación que no debe
competir por atención con lo anterior.

**Dependencias de orden**: PR2 y PR3 **no pueden mergear antes del PR1** (tipos de `/auth`); PR8 y
PR9 **no pueden mergear antes del PR7** (tipos de `/procesos`) ni antes del PR2 (el asistente se
monta dentro del `AppShell`).

## Preguntas abiertas

- [x] **~~No existe UI de login ni app shell.~~ RESUELTA (2026-08-11).** El usuario confirmó
      ampliar el alcance de #11 con un **login mínimo** (proposal, "Ampliación de alcance"). El
      diseño vive en **D8** (componentes, estado de sesión, errores, app shell), **D9** (contrato
      OpenAPI de `/auth`) y **D10** (Google sin dependencia nueva + proxy mono-origen), y se entrega
      en los PR 1-3, antes del asistente. Consecuencia: el change **sí** queda operable de punta a
      punta en navegador (paso R6 del rollout). Dos correcciones que salieron al diseñarlo y que
      ninguna fase posterior debe re-litigar: el login es por **`codigo`**, no por correo
      (`login.dto.ts:5-11`), y la UI **no puede** mostrar "cuenta bloqueada" — el backend devuelve
      un `401` uniforme a propósito (D3 de #4).
- [ ] **La ampliación de #11 no cubre recuperación de contraseña en UI.** `POST /auth/recovery` y
      `/auth/recovery/confirm` existen desde #5 y el correo de recuperación apunta a
      `${APP_BASE_URL}/recuperar?token=…` (`docs/onboarding.md`), **una ruta que el frontend no
      tiene** y que no puede tener sin router. Hoy ese enlace lleva a una página inexistente. El
      `Out of Scope` de la propuesta lo excluye explícitamente; queda como ítem de backlog junto
      con la introducción del router (D8, "Integración con el app shell").
- [ ] **`docentes` como `publico_objetivo`.** `DerechoVoto.en_calidad_de` contempla `docente`
      (ADR-0011) y el PRD registra a los docentes como votantes, pero la regla de elegibilidad de la
      spec está anclada a `Matrícula` — y un docente no tiene matrícula, así que contaría 0. Se
      omite el valor del enum a propósito; agregarlo exige una regla de elegibilidad propia y una
      migración `ALTER TYPE … ADD VALUE` en archivo separado (gotcha de D1).
- [ ] **`Configuracion.anio_escolar_id` puede quedar desfasado** respecto de `AnioEscolar.activo`
      (evidencia en D2b). Este change lo esquiva, no lo arregla. Decidir en #13 si esa columna se
      sincroniza al activar un año o se retira por redundante.
- [ ] **Un solo `ProcesoElectoral` para N aulas en `representante_aula`** (lo que fija la spec)
      obliga a #12 a acotar `Candidato` por aula y a #16 a escrutar por `DerechoVoto.aula_snapshot`.
      Confirmar con #12 antes de implementarlo allí.
- [ ] **Sin paginación en `GET /procesos`**, coherente con #7/#8; a escala institucional con varios
      años de historial el arreglo desnudo crecerá.
- [ ] **CSRF**, abierta desde #4: este change agrega 4 rutas autenticadas que mutan estado de
      negocio; `sameSite: 'lax'` sigue siendo la única defensa.
