# Propuesta: base-schema-and-migrations (Backlog #2 — Esquema base y migraciones)

## Intención

El repositorio no tiene ningún esquema relacional. Los ítems de backlog #7–#17 asumen todos que las
tablas ya existen para construir lógica de aplicación sobre ellas (su "Contexto extra requerido" está
vacío). Este change entrega el esqueleto relacional duradero — modelos Prisma más el SQL raw que
Prisma no puede expresar — para que los ítems posteriores agreguen comportamiento, no DDL. **Bloqueo
duro: este change no puede llegar a `sdd-apply` hasta que el Backlog #1 (`system-scaffolding`) esté
implementado.** Todavía no existen `apps/backend`, ni instalación de Prisma, ni fixture de Postgres,
ni CI; esta propuesta está escrita para apilarse limpiamente sobre la migración baseline vacía de #1
una vez que se entregue.

## Alcance

### Dentro de alcance
- Modelos Prisma + migraciones aumentadas con SQL raw para cada entidad de la sección "Modelo de
  datos" de `TECH-DESIGN.md` excepto `EventoAuditoría` (ver Fuera de alcance)
- Soporte de voto por candidato individual: `Voto.eleccion` acepta un `candidato_id` directo junto a
  `lista_id`, `opcion_id` y `blanco`, impuesto por una restricción `CHECK` que exige exactamente uno
  establecido
- Árbol académico según lo decidido: `Nivel 1—N Grado`, `Grado 1—N Sección` acotado por `AñoEscolar`,
  `Aula` = una fila por (Grado, Sección, AñoEscolar), `Turno` como atributo de `Aula`
- Garantías de integridad a nivel de base de datos: cero votos duplicados, un único `AñoEscolar`
  activo, exactamente una referencia de elección en `Voto`, integridad referencial en todo el árbol
- Cuatro migraciones agrupadas apiladas después de la baseline vacía de #1 (identidad/académico,
  estructura del proceso electoral, núcleo de votación, tablas de soporte)
- Datos de seed estructurales mínimos, restringidos a entornos que no sean producción
- Tests de integración de rechazo de restricciones (RED/GREEN contra códigos de error reales de
  Postgres)

### Fuera de alcance
- `EventoAuditoría` (tabla, triggers, servicio) — se mueve por completo a #3. Su única restricción
  significativa es el par de triggers anti-`UPDATE`/`DELETE` que construye #3; una tabla desnuda sin
  trigger y sin escritor antes de que exista #3 es esquema muerto sin ningún test RED que lo
  justifique bajo TDD estricto.
- Columnas de credenciales de `Usuario` (`password_hash`, identificador OAuth, contador de logins
  fallidos, `bloqueado_hasta`) — diferidas a #4/#5/#6 como migraciones aditivas. Inventar su forma
  ahora sería adivinar decisiones (algoritmo de hashing, mapeo de claims OAuth) que pertenecen a esos
  ítems.
- Todo el comportamiento de aplicación de las tablas cuyo *uso* corresponde a un ítem posterior:
  cableado del outbox (#15), CRUD de administración (#10), generación de PDF (#17), reglas de negocio
  académicas (#8), autenticación (#4-6), CRUD/servicios de cada módulo de dominio (#7-17). #2 entrega
  únicamente tablas e invariantes a nivel de base de datos.

## Capacidades

### Capacidades nuevas
- `base-schema`: definición del esquema Prisma, migraciones aumentadas con SQL raw y suite de tests
  de rechazo de restricciones para el esqueleto relacional completo (identidad, árbol académico,
  estructura del proceso electoral, núcleo de votación, tablas de soporte)

### Capacidades modificadas
Ninguna — change greenfield, no hay specs existentes que modificar.

## Enfoque

Prisma como ORM (según `openspec/config.yaml`), primero el DSL con SQL raw editado a mano y agregado
al mismo archivo de migración allí donde Prisma no puede expresar una restricción. La unicidad
compuesta (`@@unique([proceso_id, derecho_voto_id])` en `Voto`) es DSL nativo de Prisma — no hace
falta SQL raw. El SQL raw solo se requiere para: (1) un índice único parcial/filtrado sobre
`AñoEscolar.activo WHERE true` (año único activo), y (2) una restricción `CHECK` sobre `Voto` que
imponga que exactamente uno de `{lista_id, opcion_id, candidato_id, blanco}` esté establecido. La
coherencia entre la intención de `schema.prisma` y el SQL aplicado no es una convención de
comentarios — está garantizada por tests de integración de rechazo de restricciones que hacen fallar
CI ante cualquier deriva.

**El voto secreto explícitamente NO es una restricción de base de datos de #2.** Según ADR-0010, el
acceso directo a Postgres puede leer el vínculo identidad↔elección de `Voto`; eso se acepta como una
cuestión de custodia del despliegue y de autorización de la aplicación, no como algo que la capa de
esquema imponga. El único deber de #2 es no crear ninguna vista o join de conveniencia que vincule
identidad con elección para nadie más que el votante.

## Áreas afectadas

| Área | Impacto | Descripción |
|------|--------|--------------|
| `apps/backend/prisma/schema.prisma` | Nueva | Modelos Prisma para todas las entidades dentro de alcance |
| `apps/backend/prisma/migrations/*` | Nueva | Cuatro grupos de migración, aumentados con SQL raw, después de la baseline vacía de #1 |
| `apps/backend/prisma/seed.ts` | Nueva | Seed solo estructural, restringido a entornos que no sean producción |
| `apps/backend/test/schema/*.spec.ts` | Nueva | Tests de integración de rechazo de restricciones (Jest, reutiliza el fixture de Postgres de #1) |

## Inventario de entidades (dentro de alcance)

`Usuario` (solo identidad/rol/estado), `Apoderado`, `AñoEscolar`, `Nivel`, `Grado`, `Sección`,
`Aula` (con atributo `Turno`), `Matrícula`, `ProcesoElectoral`, `Lista`, `Candidato`,
`OpciónConsulta`, `DerechoVoto`, `Voto`, `JobCorreo`/`Notificación`, `Configuración`, `Acta`.
Excluida: `EventoAuditoría`.

## Estrategia de migración

Cuatro grupos, cada uno fusionable de forma independiente, apilados directamente después de la
baseline vacía de #1:

1. `..._identity_and_academic_tree` — `Usuario`, `Apoderado`, `AñoEscolar`, `Nivel`, `Grado`,
   `Sección`, `Aula`, `Matrícula` (+ el índice único parcial en SQL raw)
2. `..._electoral_process_structure` — `ProcesoElectoral`, `Lista`, `Candidato`,
   `OpciónConsulta`, tablas de unión entre proceso y estructura académica
3. `..._voting_core` — `DerechoVoto`, `Voto` (+ la restricción `CHECK` en SQL raw); el más pequeño y
   de mayor prioridad de revisión (lleva la garantía de cero votos duplicados)
4. `..._support_tables` — `JobCorreo`/`Notificación`, `Configuración`, `Acta`

Local: `prisma migrate dev` contra el Postgres de Docker Compose de #1. CI: `prisma migrate deploy`
reutilizando el fixture de Postgres para e2e de #1 — sin levantar un segundo fixture. El camino de
despliegue a producción no está definido hoy en ninguna parte del repositorio (ADR-0007 cubre la
topología, no un paso de release que ejecute `prisma migrate deploy`) — señalado como hueco abierto,
sin bloquear a #2.

## Seeds

Solo estructurales: un `AñoEscolar` activo, un fixture mínimo de árbol académico, una fila de
`Usuario` por rol (solo campos de identidad — todavía no existen columnas de credenciales que
sembrar), una fila singleton de `Configuración` con datos de marcador de posición y sin secretos
SMTP. Restringidos a entornos que no sean producción (`NODE_ENV !== 'production'` o un script solo de
desarrollo nunca conectado al despliegue).

## Enfoque de TDD estricto

RED/GREEN aplicado a restricciones, no a lógica de negocio:

- **RED**: el test de integración realiza la operación que una restricción debería rechazar (p. ej.
  insertar un segundo `Voto` con el mismo `(proceso_id, derecho_voto_id)`); falla porque todavía nada
  la rechaza.
- **GREEN**: aplicar la migración (DSL de Prisma + SQL raw editado a mano); volver a ejecutar — la
  operación ahora lanza un error real de Postgres (violación de unicidad `23505`, violación de check
  `23514`) o el `P2002` de Prisma, y el rechazo es la condición de aprobación.
- La suite cubre: inserción duplicada de `Voto`, segundo `AñoEscolar` activo, `Voto` con dos o cero
  elecciones establecidas, verificaciones puntuales de integridad de FK.

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|------|------------|------------|
| Bloqueado por #1 (todavía no implementado) | Certeza hoy | No puede llegar a `sdd-apply` hasta que #1 se entregue; esta propuesta asume que su baseline vacía existe |
| La estructura del árbol académico puede necesitar una migración aditiva una vez que #8 defina las reglas de negocio reales | Media | La estructura está decidida para los fines de #2; #8 es dueño de las reglas de negocio y puede requerir cambios de esquema posteriores |
| Columnas de autenticación de `Usuario` sin diseñar | Certeza | Diferidas a #4/#5/#6 como migraciones aditivas, no adivinadas aquí |
| `Configuración.smtp_config` podría almacenar credenciales SMTP en texto plano | Media | Señalado para que #10 decida un enfoque de gestor de secretos/variables de entorno antes de la implementación |
| Presupuesto de revisión de 400 líneas excedido (~14 tablas, 4 grupos) | Alta | Marcado para que `sdd-tasks` planifique slices de PR encadenados por grupo de migración; la decisión de la división no se toma aquí |

## Plan de rollback

Greenfield, sin datos de producción. Si un slice resulta inviable: hacer `git revert` del o los PR
relevantes; si ya se aplicó a una base de datos compartida de dev/CI, aplicar una pequeña migración
hacia adelante que elimine las tablas agregadas. Sin migraciones de bajada mantenidas a mano —
refleja el precedente de rollback de #1.

## Dependencias

- Backlog #1 (`system-scaffolding`) — bloqueo duro. Requiere que Prisma esté instalado con su
  migración baseline vacía, el Postgres de Docker Compose y el fixture de Postgres de CI existan
  antes de `sdd-apply`.

## Seguimiento de documentación

La decisión de voto por candidato individual (Voto.eleccion soporta un `candidato_id` directo) es una
clarificación de producto que actualmente no está declarada en `TECH-DESIGN.md`. Se recomienda
actualizar ese documento como tarea de documentación separada — no forma parte del alcance de este
change.

## Criterios de éxito

- [ ] `schema.prisma` define cada entidad dentro de alcance con relaciones y cardinalidades correctas
- [ ] Las cuatro migraciones se aplican limpiamente, en orden, después de la baseline vacía de #1
- [ ] La restricción `CHECK` de `Voto` rechaza filas con cero o más de uno de
      `{lista_id, opcion_id, candidato_id, blanco}` establecido
- [ ] El índice único parcial de `AñoEscolar` rechaza una segunda fila con `activo = true`
- [ ] `@@unique([proceso_id, derecho_voto_id])` rechaza un voto duplicado
- [ ] La suite de tests de integración de rechazo de restricciones pasa contra un Postgres real,
      verificando los códigos de error reales (`23505`, `23514`, o el `P2002` de Prisma)
- [ ] El script de seed solo corre fuera de producción y no crea material de credenciales
- [ ] Ninguna vista ni join de este esquema vincula la identidad del votante con su elección para
      roles distintos del votante
- [ ] `EventoAuditoría` y las columnas de credenciales de `Usuario` están ausentes de las migraciones
      de este change
