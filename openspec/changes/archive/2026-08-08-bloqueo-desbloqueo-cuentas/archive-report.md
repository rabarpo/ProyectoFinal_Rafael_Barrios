# Reporte de archivo: bloqueo-desbloqueo-cuentas (Backlog #6)

## Resumen del ciclo

Ciclo SDD completo: exploración → propuesta → spec (+ delta sobre `auth-server-sessions`) → diseño
→ tareas → apply (3 PRs encadenados) → verify → archive.

## Estado de verificación

**PASS WITH WARNINGS** (0 CRITICAL, 2 WARNING no bloqueantes, 0 SUGGESTION). Ver
`verify-report.md` en esta misma carpeta para el detalle completo.

- 10/10 requisitos cubiertos (7 nuevos en `bloqueo-desbloqueo-cuentas` + 3 MODIFIED en
  `auth-server-sessions`)
- 22/22 escenarios con test cubridor real en runtime (Postgres/Redis efímeros)
- 58/58 tareas completas (PR1 fundación, PR2 auto-bloqueo, PR3 desbloqueo manual + listado)
- Un CRITICAL de contrato OpenAPI desactualizado fue detectado y corregido antes del PASS final
  (mismo patrón que #4/#5), commit `0789758`
- WARNING 1 (pre-existente, no relacionado): `migrate-baseline.e2e-spec.ts`, deuda técnica de
  `system-scaffolding`/`base-schema-and-migrations`
- WARNING 2 (nuevo, no bloqueante): flakiness de tests unitarios bajo workers paralelos de Jest por
  colisión de claves Redis entre workers (`session.service.spec.ts`,
  `recovery.service.spec.ts`, `bloqueo.service.spec.ts`); confirmado no causado por este change,
  reproducible solo con `--runInBand` desactivado

## Excepciones de tamaño aceptadas

Los 3 PRs superaron el presupuesto de 400 líneas — mismo patrón que #3/#4/#5, `size:exception`
aceptado por el usuario en cada caso con el mismo criterio (excedente es cobertura de test
adversarial necesaria para un flujo de seguridad crítica, no lógica de producción inflada):

| PR | Líneas | Producción | Tests |
|---|---|---|---|
| PR1 — Fundación | 367 | 151 | 216 |
| PR2 — Auto-bloqueo | 849 | 119 | 730 |
| PR3 — Desbloqueo manual + listado | 613 | 158 | 455 |

## Specs sincronizadas

- `openspec/specs/bloqueo-desbloqueo-cuentas/spec.md` — nueva spec de dominio (7 requisitos, 14
  escenarios)
- `openspec/specs/auth-server-sessions/spec.md` — 3 requisitos MODIFIED fusionados (login exitoso
  resetea contador, login fallido incrementa contador, login contra bloqueado considera
  `bloqueado_hasta`)

## Hallazgo colateral no resuelto en este change

El diseño encontró que `Usuario.estado='inactivo'` puede loguearse hoy (`login()` solo rechaza
`'bloqueado'`) — hueco preexistente de `auth-server-sessions` (#4). Este change lo contiene (la
transacción de auto-bloqueo usa `where: {estado: 'activo'}`, nunca `not: 'bloqueado'`, para que la
fuerza bruta no reactive una cuenta inactiva), pero no lo cierra. Cerrarlo queda para
`administracion-usuarios-apoderados` (#7).

## Desbloqueo de dependencias

Con #6 archivado, ningún ítem restante del backlog depende formalmente de él. El endpoint de
listado de bloqueados (`GET auth/usuarios/bloqueados`) es un mínimo deliberado para no bloquear el
panel del comité mientras #7 (administración general de usuarios) no exista todavía.
