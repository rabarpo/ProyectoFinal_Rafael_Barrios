# ADR 0003: PostgreSQL como base de datos única del sistema

## Estado

Aceptado

## Contexto

El PRD impone garantías de integridad no negociables: **0 votos duplicados** (verificable contra
auditoría), transaccionalidad del voto ante cortes de conexión y doble envío ("o se registra
completo y se confirma, o no se registra"), **padrón congelado** al abrir el proceso, auditoría
**inmutable** desde la aplicación, y escrutinio reproducible donde participación = votos +
abstenciones + nulos + blancos = padrón.

El modelo de datos es fuertemente relacional: usuarios, estructura académica
(nivel/grado/sección/aula/turno), procesos electorales, candidatos/listas/opciones, padrón por
proceso, votos y eventos de auditoría, con integridad referencial entre todos ellos.

## Decisión

**PostgreSQL** como única base de datos del sistema, compartida por backend y worker
([ADR-0001]). Las garantías críticas se implementan a nivel de motor, no solo de aplicación:

- Restricción `UNIQUE (proceso_id, derecho_voto_id)` en la tabla de votos — el "0 votos
  duplicados" lo garantiza el motor aunque el código falle (doble clic, dos pestañas, reintento).
- Emisión del voto en una **transacción** que registra voto + marca de padrón + evento de
  auditoría de forma atómica.
- Tabla de auditoría **append-only**: triggers que rechazan `UPDATE` y `DELETE`, y un rol de
  aplicación sin permisos de modificación sobre ella; columna JSONB para el detalle del evento.
- El padrón se materializa como filas propias por proceso al abrirlo (snapshot), de modo que los
  cambios académicos posteriores no lo alteran.

Acceso desde NestJS con **Prisma** como ORM y sistema de migraciones (coherente con el stack
TypeScript del [ADR-0002]), reservando SQL directo para las restricciones y triggers que Prisma
no expresa.

## Alternativas consideradas

- **MySQL / MariaDB** — también relacional y ACID con InnoDB, cubría los requisitos básicos y es
  común en hosting económico; no se eligió porque PostgreSQL ofrece JSONB más capaz para el
  detalle de auditoría, DDL transaccional para migraciones seguras, y es igual de viable tanto
  en nube como en servidor local.
- **MongoDB** — flexible ante cambios de esquema; no se eligió porque el modelo de SEEI es
  fuertemente relacional con unicidad crítica: expresar `UNIQUE` compuesto, integridad
  referencial y transacciones multi-entidad es exactamente el terreno donde un motor relacional
  da garantías más simples y sólidas.

## Consecuencias

- Los criterios de éxito más duros del PRD (0 duplicados, transaccionalidad, escrutinio
  reproducible) descansan en garantías del motor verificables con una consulta, no en disciplina
  de código.
- Una sola base de datos simplifica respaldos, restauración y la verificación
  auditoría-vs-resultados.
- **Costo real:** la inmutabilidad de la auditoría vía triggers y permisos protege *desde la
  aplicación*, como pide el PRD, pero un administrador de la base de datos con acceso directo
  puede alterarla — el sistema depende de la custodia del acceso a PostgreSQL (respaldos
  periódicos y acceso restringido son parte del despliegue, ver ADR de infraestructura).
- Parte del comportamiento crítico vive en SQL (triggers, constraints) fuera del ORM: debe
  versionarse en migraciones y probarse explícitamente, porque Prisma no lo refleja en sus tipos.
- La tabla de votos vincula identidad y elección — necesario para el comprobante que exige el
  PRD. Qué superficie de la aplicación puede leer esa vinculación, qué contiene el evento de
  auditoría del voto y el ciclo de vida de la auditoría (retención, anonimización) se rigen por
  el [ADR-0010].
