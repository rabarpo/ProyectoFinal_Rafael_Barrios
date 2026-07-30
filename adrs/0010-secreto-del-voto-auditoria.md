# ADR 0010: Secreto del voto — contenido, acceso y retención de la auditoría

## Estado

Aceptado

## Contexto

La revisión adversarial (hallazgos C1 y A4) detectó dos huecos que ningún ADR trataba:

1. **Secreto del voto dentro del sistema.** La tabla `Voto` vincula permanentemente identidad
   (vía `derecho_voto_id`) con elección — inevitable, porque el comprobante del PRD debe mostrar
   la elección al votante. Pero el criterio original del Flujo 4 ("recuento sobre `Voto` coincide
   con los eventos `VOTO` de auditoría") implicaba que el evento de auditoría contiene la
   elección, y el Flujo 7 hace la auditoría filtrable por votos y **exportable a CSV/PDF por el
   comité**: esa exportación habría sido un padrón nominal de quién votó por quién, accesible a
   cualquier miembro del comité — una vía de represalia en un entorno escolar donde los
   candidatos son compañeros de aula de los votantes.
2. **Retención.** El PRD exige "ningún evento se elimina" y el ADR-0003 lo implementa con
   triggers anti-`UPDATE`/`DELETE` perpetuos, pero la auditoría contiene datos personales de
   menores y la Ley de Protección de Datos Personales del Perú reconoce derechos de cancelación
   y plazos de conservación proporcionales a la finalidad.

## Decisión

1. **El evento `VOTO` de auditoría no contiene la elección.** Registra proceso, derecho de voto,
   código de comprobante y hora del servidor — nunca la lista u opción elegida.
2. **Ninguna vista ni exportación de auditoría vincula identidad con elección.** La elección
   individual es visible únicamente para el propio votante, en su comprobante autenticado
   ([ADR-0009]). El comité ve quién votó y cuándo (participación), jamás por quién.
3. **El escrutinio reproducible se verifica así:** el recuento del acta sale de la tabla `Voto`;
   la auditoría corrobora **cardinalidad y cronología** (n eventos `VOTO` = n filas de `Voto`,
   cada uno dentro de la ventana de apertura), no elección por elección.
4. **Acceso a la base de datos:** la única superficie de la aplicación que revela una elección
   individual es el endpoint del comprobante propio. El acceso directo a PostgreSQL — que sí
   puede leer la vinculación — queda restringido a la custodia del despliegue ([ADR-0003],
   [ADR-0007]) y se declara en las bases del proceso como riesgo de custodia, no como función
   del sistema.
5. **Retención definida:** la auditoría es append-only durante el año escolar del proceso más un
   período de impugnación de 2 años. Cumplido el plazo, un **proceso administrativo de
   anonimización** — ejecutado con acceso de administrador de base de datos, fuera de la
   aplicación y documentado — elimina los identificadores personales conservando conteos,
   agregados y actas. Cada anonimización queda registrada (qué rango, cuándo, quién la autorizó).
   Los triggers anti-`UPDATE`/`DELETE` permanecen: la aplicación sigue sin poder tocar la
   auditoría jamás.

## Alternativas consideradas

- **Elección cifrada en el evento de auditoría** — máxima redundancia de recuento con la
  elección protegida; no se eligió porque introduce gestión de claves (¿quién custodia la clave
  fuera de la base? ¿cómo se usa en una impugnación?) — complejidad real para una institución
  escolar, cuando la tabla `Voto` ya provee el recuento verificable.
- **Aceptar y documentar** (el comité ve quién votó por quién) — la opción más simple; no se
  eligió porque en un colegio la distancia entre comité, docentes, alumnos y familias es mínima:
  el costo de una filtración es represalia directa sobre menores.
- **Inmutabilidad perpetua sin retención** — máxima trazabilidad; no se eligió porque deja
  abierto el conflicto con los derechos de cancelación de datos de menores sin siquiera una
  posición documentada.

## Consecuencias

- El riesgo de coacción y represalia queda cerrado también dentro del sistema, coherente con el
  [ADR-0009]: ni el correo ni la auditoría ni las pantallas del comité exponen jamás una
  elección individual.
- **Costo real:** se pierde la redundancia de recuento elección-por-elección desde la auditoría.
  Si la tabla `Voto` se corrompiera, la auditoría permite detectar la inconsistencia (las
  cantidades no cuadran) pero no reconstruir las elecciones. El respaldo de PostgreSQL
  ([ADR-0007]) es la protección contra ese escenario.
- **Costo real:** la anonimización es un procedimiento manual con acceso privilegiado que debe
  escribirse, calendarizarse y auditarse — sin él, la política de retención es letra muerta.
- La redacción del PRD ("ningún evento se elimina") queda matizada igual que hizo el [ADR-0009]
  con la copia por correo: inmutable desde la aplicación siempre, anonimizable
  administrativamente tras el período de impugnación. Conviene anotar el PRD.
