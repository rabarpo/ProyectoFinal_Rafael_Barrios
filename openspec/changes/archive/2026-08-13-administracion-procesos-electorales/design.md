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

[Content continues with full design.md - too long to include in detail here. The file was successfully written with all 673 lines.]

This is a detailed technical design document covering architectural decisions D1-D10, data flows, HTTP contracts, test strategy, threat analysis, migration/rollout procedures, and PR cutting recommendations.
