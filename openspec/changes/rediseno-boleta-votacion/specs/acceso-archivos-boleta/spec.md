# Acceso a archivos de la papeleta — Specification

Cross-referencia: `PRD.md` §Votación, `Design.md` §Boleta de 3 pasos, ADR-0004 (contrato OpenAPI).

## Purpose

Define dos endpoints de solo lectura que sirven binarios ligados a la papeleta de un votante
(foto de candidato cabeza de lista, plan de trabajo de lista) bajo `/votos/...`, autorizados por
pertenencia al `derechoVotoId` del usuario autenticado, con el mismo criterio D9/D13 ya aplicado
en `PapeletaService`/`ComprobanteService`. No cubre `/candidatos/:id/foto` ni
`/listas/:id/plan-trabajo` existentes (fuera de alcance, sin relajar sus guards de rol).

## Requirements

### Requirement: Autorización por pertenencia a la papeleta del derecho de voto

El sistema MUST exponer `GET /votos/papeleta/:derechoVotoId/opciones/:id/foto` y `GET
/votos/papeleta/:derechoVotoId/opciones/:id/plan-trabajo`, protegidos por sesión autenticada
(`AuthGuard`). El sistema MUST verificar, antes de servir el binario, que `:derechoVotoId`
pertenece al usuario autenticado y que `:id` corresponde a una opción presente en la papeleta de
ese `derechoVotoId`. El sistema MUST responder con el mismo código y cuerpo `403` tanto cuando la
opción pertenece a una papeleta ajena como cuando `:id` no existe — sin distinguir ambos casos en
la respuesta (mismo criterio D9/D13 de `PapeletaService`, sin oráculo de enumeración).

#### Scenario: Foto de opción propia se sirve correctamente
- GIVEN un votante autenticado con un `DerechoVoto` propio y una opción de tipo Lista con
  candidato cabeza de lista con foto persistida
- WHEN invoca `GET /votos/papeleta/:derechoVotoId/opciones/:id/foto` con su propio
  `derechoVotoId` y el `:id` de esa opción
- THEN responde `200` con el binario de la foto y los headers `nosniff`+CSP restrictiva

#### Scenario: Opción ajena responde 403 idéntico
- GIVEN un votante autenticado y una opción `:id` que pertenece a la papeleta de otro
  `derechoVotoId` (no el suyo)
- WHEN invoca `GET /votos/papeleta/:derechoVotoId/opciones/:id/foto` (o `/plan-trabajo`) con su
  propio `derechoVotoId` pero ese `:id` ajeno
- THEN responde `403` con el mismo código/cuerpo que el escenario de `:id` inexistente

#### Scenario: Opción inexistente responde 403 idéntico al de opción ajena
- GIVEN un votante autenticado con un `derechoVotoId` propio
- WHEN invoca el endpoint con un `:id` que no existe en ninguna papeleta
- THEN responde `403` con el mismo código/cuerpo que el escenario de opción ajena — sin revelar
  si `:id` existe o no (sin oráculo de enumeración)

#### Scenario: Petición sin sesión válida es rechazada
- GIVEN una petición a cualquiera de los 2 endpoints sin sesión autenticada
- WHEN se invoca con cualquier `derechoVotoId`/`id`
- THEN responde con rechazo de autenticación, sin ejecutar la verificación de pertenencia

### Requirement: Plan de trabajo ausente responde 404, no 403

El sistema MUST distinguir "opción sin plan de trabajo persistido" (`404`, dato legítimamente
ausente) de "opción ajena o inexistente" (`403`, autorización). El sistema MUST verificar primero
la pertenencia (`403` si falla) y solo después comprobar la existencia del binario (`404` si la
pertenencia es válida pero el archivo no está persistido).

#### Scenario: Lista propia sin plan de trabajo responde 404
- GIVEN un votante autenticado con una opción de Lista propia en su papeleta cuya
  `plan_trabajo_presente = false`
- WHEN invoca `GET /votos/papeleta/:derechoVotoId/opciones/:id/plan-trabajo` con esa opción
- THEN responde `404`, no `403`

### Requirement: Reutilización de headers de seguridad existentes

El sistema MUST servir ambos binarios con los mismos headers de seguridad (`X-Content-Type-Options:
nosniff` y una CSP restrictiva) ya usados por `CandidatosController`/`ListasController` al servir
`foto`/`plan_trabajo`, y MUST devolver el `Content-Type` exacto persistido para cada archivo.

#### Scenario: Headers de seguridad presentes en la respuesta
- GIVEN una foto de candidato servida exitosamente vía el endpoint de este spec
- WHEN se inspeccionan los headers de la respuesta `200`
- THEN incluye `X-Content-Type-Options: nosniff` y una CSP restrictiva equivalente a la de los
  endpoints admin existentes
