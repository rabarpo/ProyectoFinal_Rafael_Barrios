---
title: "SEEI — Informe de revisión adversarial del diseño técnico"
fecha: 2026-07-30
alcance: "TECH-DESIGN.md · adrs/0001–0009 · contrastados contra PRD.md y Design.md"
---

# Informe de revisión adversarial — SEEI

> Revisión adversarial del `TECH-DESIGN.md` y sus 9 ADRs, contrastados contra `PRD.md` y
> `Design.md`. Ejecutada en una conversación fresca, sin el historial de cómo se produjo el
> diseño. Este informe **no modifica** ningún documento: reporta hallazgos ordenados por
> severidad; los cambios son decisión del equipo.
>
> **Resumen:** 2 hallazgos críticos, 5 advertencias, 4 sugerencias. Los ADR-0001, 0006 y 0008
> resistieron el escrutinio sin problemas reales.

---

## Crítico

### C1. El secreto del voto dentro del sistema no está tratado por ningún ADR — y la auditoría exportable lo agrava

**Afecta:** ADR-0003, ADR-0009, modelo de datos (`Voto`, `EventoAuditoría`), Flujo 4 y Flujo 7 del TDD.

El ADR-0009 resolvió con cuidado el vector *correo*, pero nadie decidió qué pasa con el secreto
del voto **dentro** del sistema. La tabla `Voto` vincula permanentemente `derecho_voto_id`
(→ identidad) con la elección — inevitable si el comprobante debe mostrar la elección, como pide
el PRD — pero eso significa que cualquier persona con acceso a la base (DBA, desarrollador,
quien restaure un respaldo) puede leer cómo votó cada estudiante y cada padre. El ADR-0003
admite que un DBA puede *alterar* la auditoría; no menciona que puede *leer* todos los votos.

Peor: el criterio del Flujo 4 exige que "un recuento directo sobre `Voto` coincida con los
eventos `VOTO` de auditoría", lo que implica que el evento `VOTO` contiene la elección. Y el
Flujo 7 hace la auditoría **filtrable por "votos" y exportable a CSV/PDF por el comité**. Si el
evento `VOTO` incluye derecho de voto + elección, esa exportación es un padrón nominal de quién
votó por quién, accesible a cualquier miembro del comité — exactamente el documento que el
ADR-0009 se esforzó en no crear. En una elección escolar donde los candidatos son compañeros de
aula de los votantes, esto es una vía directa de represalia.

**Qué falta:** un ADR que decida explícitamente:

- el contenido del evento `VOTO` (¿con o sin elección?, ¿con o sin identidad?);
- qué campos expone la vista/exportación de auditoría según el rol;
- si se acepta o se mitiga (p. ej., cifrado de la columna de elección, o separación
  voto↔identidad mediante token) la legibilidad total desde la base de datos.

### C2. Contradicción sin resolver: ¿con qué cuenta vota el padre?

**Afecta:** modelo de datos (`Usuario`, `Representación`, `DerechoVoto`), PRD "Supuestos y riesgos abiertos", flujo multi-hijo.

El PRD registra como *confirmado*: "los padres votan **usando la cuenta del estudiante** que
representan". Pero el modelo de datos y todo el diseño asumen lo contrario: `Usuario` tiene rol
`padre`, `Representación` vincula a un padre con N estudiantes, y el flujo estrella del
Design.md — banda "Votando por ▢ · 3° A" y el salto "votar por mi otro hijo (N pendiente)" —
solo funciona si el padre tiene **cuenta propia** desde la que encadena los votos de sus hijos.
Con la regla literal del PRD, un padre con 3 hijos tendría que cerrar sesión y entrar con 3
cuentas distintas, y la entidad `Representación` no serviría para nada.

Esto no es un matiz: decide a qué correo llega la copia del voto de APAFA, qué cuenta bloquea el
intento fallido durante la jornada, y cómo se materializa el `DerechoVoto` del padre. El TDD
construyó sobre una interpretación sin declarar que contradice la línea confirmada del PRD. Hace
falta la corrección explícita de uno de los dos documentos (como sí se hizo con el ADR-0009 y la
redacción de la copia por correo).

---

## Advertencia

### A1. Ventana entre commit y encolado: "cada voto encola exactamente un job de correo" no está garantizado

**Afecta:** ADR-0006, ADR-0002, modelo de datos (`JobCorreo`).

El ADR-0006 encola el job de correo "tras el commit". Si el backend cae entre el commit y el
encolado en Redis, existe un voto sin job — y nada lo detecta: el criterio de éxito del PRD
("100% de los votos genera su copia") queda violado silenciosamente. Además hay una ambigüedad
sin dueño: el modelo de datos tiene `JobCorreo` como tabla **en PostgreSQL**, pero el ADR-0002
declara la cola en **BullMQ/Redis**. ¿Cuál es la fuente de verdad de los envíos pendientes? Si
`JobCorreo` se insertara *dentro de la transacción del voto* (patrón outbox) y el worker
partiera de ahí, el hueco desaparece — pero ningún ADR toma esa decisión. Tal como está escrito,
son dos colas a medio definir.

### A2. Caída del VPS a mitad de jornada: la restauración de respaldos tiene una semántica que nadie definió

**Afecta:** ADR-0007, sección "Riesgos técnicos abiertos" del TDD.

El ADR-0007 exige ensayar la restauración — bien. Pero restaurar un respaldo *horario* durante
la jornada pierde hasta una hora de votos **cuyos comprobantes ya fueron emitidos y enviados por
correo**: votantes con código de voto válido cuyo `DerechoVoto` volvió a "pendiente". ¿Pueden
votar de nuevo (rompiendo "0 duplicados" contra los comprobantes en circulación)? ¿Se extiende
la hora de cierre? ¿Se levanta acta de incidencias? El único servidor es un punto único de fallo
asumido — razonable a esta escala — pero el plan de contingencia operativo de la jornada (qué
hace el comité si el sistema muere a las 10:30) no existe en ningún documento, y es un
procedimiento que debe estar en las bases del proceso *antes* de la primera elección, no
improvisarse.

### A3. La clave de idempotencia está subespecificada justo donde importa

**Afecta:** ADR-0004, ADR-0006, criterios del Flujo 1.

La clave se "genera al entrar al paso 3". El criterio de aceptación asume que un reintento tras
corte llega **con la misma clave** — pero si el corte provoca recarga de la página (el caso
realista en un teléfono), el cliente vuelve a entrar al paso 3 y genera una clave *nueva*. Ese
reintento choca con el `UNIQUE`, y no está definido qué recibe el votante: ¿un 409 "ya votaste"
(correcto pero confuso: él nunca vio su comprobante) o el comprobante existente?

Falta decidir: **(a)** dónde persiste la clave en el cliente (sessionStorage/localStorage), y
**(b)** que la violación de `UNIQUE` con clave distinta responda el comprobante ya emitido, no
un error. Sin (b), la clave de idempotencia es casi decorativa: el `UNIQUE` hace el trabajo y el
votante del caso borde más citado del PRD termina en una pantalla de rechazo.

### A4. Auditoría inmutable para siempre vs. protección de datos de menores: nadie decidió la retención

**Afecta:** ADR-0003, riesgo "Protección de datos de menores en la nube" del TDD.

El PRD exige "ningún evento se elimina" y el ADR-0003 lo implementa con triggers anti-DELETE.
Pero la auditoría contiene datos personales de menores (sesiones, accesos, votos) y la Ley de
Protección de Datos Personales del Perú reconoce derechos de cancelación y plazos de
conservación proporcionales a la finalidad. "Inmutable durante el proceso y su impugnación" e
"inmutable eternamente" son políticas muy distintas, y los triggers implementan la segunda sin
que ningún ADR haya sopesado el conflicto. El riesgo legal está listado en el TDD, pero como
riesgo *de hosting* (región, cifrado) — la tensión con el append-only perpetuo no aparece.

### A5. Los archivos binarios no tienen decisión de almacenamiento ni de respaldo

**Afecta:** modelo de datos (`Candidato.foto`, plan de trabajo PDF, `Acta.pdf`), ADR-0007.

Fotos de candidatos, planes de trabajo en PDF y las actas generadas son parte del sistema (las
actas son *el archivo histórico oficial* según el propio ADR-0009), pero ningún ADR dice dónde
viven: ¿filesystem del VPS?, ¿`bytea` en Postgres?, ¿object storage? El plan de respaldos del
ADR-0007 cubre solo PostgreSQL — si los archivos van al disco del VPS, las actas oficiales y las
fotos quedan fuera del respaldo. Es un área de decisión completa que falta.

---

## Sugerencia

### S1. ADR-0005 asume "audiencia pequeña" para el polling, pero la publicación de resultados la rompe

El contexto del ADR-0005 dice que solo el comité y una pantalla de proyección consultan vistas
vivas. Pero al cierre, los ~1,000 votantes con la app abierta en "Mis votaciones" / Resultados
esperando la publicación son la audiencia real del endpoint de resultados — y el Design.md
además deja "sin wireframe" una vista de resultados públicos para la comunidad. No invalida el
polling (con caché de unos segundos sobre el agregado alcanza de sobra), pero la premisa del ADR
es falsa en el momento de mayor interés y conviene anotar la mitigación (cache-control o
pre-agregado) explícitamente.

### S2. La cuenta compartida padre/estudiante anula al ADR-0009 dentro de la familia

Si padre y estudiante comparten credenciales (riesgo aceptado en el PRD), el "enlace
autenticado" no protege nada entre ellos: cada uno puede ver el comprobante — con elección — del
otro. El ADR-0009 lista la coacción presencial como riesgo residual pero no este caso, que es el
más probable estadísticamente. Merece una línea en las bases del proceso y en el costo residual
del ADR.

### S3. "Playwright o pdfmake" es una decisión abierta con consecuencias de dimensionamiento

Playwright significa un Chromium corriendo en el worker del mismo VPS de 8 GB que sostiene la
jornada; pdfmake es órdenes de magnitud más liviano para actas que son esencialmente tablas y
texto. Dejarlo como "o" en el ADR-0002 posterga una elección que afecta la prueba de carga del
ADR-0007.

### S4. "JWT o cookie de sesión, se concreta después" pospone algo que la jornada necesita resuelto

El bloqueo/desbloqueo de cuentas (ADR-0008) implica poder **revocar** sesiones activas. Con JWT
sin estado, un usuario bloqueado con token vigente sigue operando hasta la expiración. La
elección diferida en el ADR-0004 no es neutra: interactúa con una regla ya aceptada.

---

## Lo que sí resistió el escrutinio

Estos ADRs aguantaron el ataque y no se les encontró problema real:

- **ADR-0001 (monolito + worker):** alternativas genuinas, costo real honesto (aislamiento de
  fallos menor), proporcional a una institución de 500–1,000 estudiantes. Sostiene.
- **ADR-0008 (reglas de jornada):** las tres decisiones tienen alternativas reales descartadas
  con razones, y el costo de la visibilidad sin excepciones está admitido con su mitigación de
  UI. Es el ADR mejor construido del conjunto.
- **ADR-0006 (voto síncrono):** el rechazo del write-behind está perfectamente argumentado para
  esta escala. Su único hueco es el de A1, que es del encolado, no de la transacción.
- La **trazabilidad PRD ↔ Design ↔ ADRs** es notablemente buena: los pendientes del Design.md
  (sección 6) fueron cerrados uno a uno por ADR-0008 y ADR-0009, y el TDD registra honestamente
  sus riesgos abiertos.

## Resolución (2026-07-30)

Todos los hallazgos fueron resueltos con el equipo el mismo día de la revisión:

| Hallazgo | Decisión tomada | Dónde quedó |
|---|---|---|
| C1 — Secreto del voto / auditoría exportable | El evento `VOTO` no contiene la elección; ninguna vista/exportación vincula identidad↔elección; escrutinio verificado contra tabla `Voto` | [ADR-0010](adrs/0010-secreto-del-voto-auditoria.md) |
| C2 — Cuenta del padre | Se ratifica el PRD literal: el padre vota con la cuenta del estudiante; se elimina `Representación` (→ `Apoderado`) y el flujo multi-hijo | [ADR-0011](adrs/0011-voto-del-padre-cuenta-estudiante.md) |
| A1 — Ventana commit→encolado | Patrón outbox: `JobCorreo` nace en la transacción del voto; BullMQ solo ejecuta | [ADR-0012](adrs/0012-outbox-correos-postgresql.md) |
| A2 — Caída del VPS a mitad de jornada | Solo procedimiento operativo (sin redundancia): pérdida ≤1 h aceptada, anulación de códigos, revotos, extensión de cierre y acta de incidencias | [ADR-0013](adrs/0013-contingencia-jornada-procedimiento.md) |
| A3 — Clave de idempotencia | Persiste en `sessionStorage`; un choque con `UNIQUE` con clave distinta devuelve el comprobante emitido, no un error | ADR-0004 (actualizado) + criterios Flujo 1 |
| A4 — Retención de auditoría | Inmutable durante el año escolar + 2 años de impugnación; luego anonimización administrativa auditada | ADR-0010 + nota en PRD |
| A5 — Archivos binarios | Volumen Docker dedicado en el VPS, incluido en el plan de respaldos junto a PostgreSQL | ADR-0007 (actualizado) |
| S1 — Ráfaga de polling al publicar | Caché corta (5–10 s) en los agregados de resultados | ADR-0005 (actualizado) |
| S2 — Comprobantes dentro de la familia | Con el ADR-0011 pasa a ser inherente por diseño; se declara en las bases | ADR-0009 y ADR-0011 (costo residual) |
| S3 — Generación de PDFs | pdfmake; se descarta Playwright/Chromium en el worker | ADR-0002 (actualizado) |
| S4 — Mecanismo de sesión | Cookie httpOnly con sesión en el servidor (Redis): el bloqueo revoca la sesión al instante | ADR-0004 (actualizado) + criterios Flujo 5 |

Quedan abiertos (ya registrados en `TECH-DESIGN.md`): la prueba de carga, los aspectos de la ley
de datos personales distintos de la retención (región, cifrado, consentimiento), el ensayo del
procedimiento de contingencia, y la actualización de los wireframes/prototipo del Design.md al
flujo del ADR-0011.

## Acciones recomendadas (mínimas)

1. **ADR-0010** — contenido del evento `VOTO`, campos expuestos por la auditoría según rol, y
   política ante la legibilidad identidad↔elección desde la base (cierra C1).
2. **Corrección PRD ↔ modelo** sobre la cuenta con la que vota el padre (cierra C2).
3. Decidir el patrón **outbox** (`JobCorreo` dentro de la transacción del voto) o declarar a
   BullMQ/Redis como única cola con su riesgo asumido (cierra A1).
4. **Procedimiento de contingencia de jornada** en las bases del proceso: qué pasa con votos y
   comprobantes tras una restauración a mitad de votación (cierra A2).
5. Especificar persistencia de la clave de idempotencia y la respuesta ante `UNIQUE` con clave
   distinta (cierra A3).
6. Definir **política de retención** de la auditoría compatible con la ley de datos personales
   (cierra A4) y el **almacenamiento y respaldo de binarios** (cierra A5).
