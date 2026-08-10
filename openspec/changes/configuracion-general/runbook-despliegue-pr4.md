# Runbook de despliegue — PR4 (corte de `GoogleOauthService`/`EmailModule` a `Configuracion`)

Este documento operacionaliza design.md, sección "Runbook de despliegue" (R1-R4), para las
tareas 4.R1-4.R4 de tasks.md. Es un procedimiento **por entorno**: MUST repetirse completo en cada
entorno destino (staging, producción, etc.) antes de considerar ese entorno migrado a PR4.

**Estado en este `sdd-apply`**: el código de PR4 (tareas 4.1-4.9) y el script de backfill
idempotente (`apps/backend/prisma/runbook/backfill-configuracion-institucional.{sql,sh}`) quedan
escritos y listos. **La EJECUCIÓN de los 4 pasos contra un entorno real (staging o producción)
queda PENDIENTE** — no hay entorno real disponible en esta sesión (sandbox sin Postgres/Redis
vivos, `docker ps` sin daemon). Es responsabilidad de quien despliegue ejecutar y verificar cada
paso contra el entorno destino real antes de avanzar al siguiente.

## Orden obligatorio (no negociable)

`dominios_google` arranca en `'{}'` tras la migración (default aditivo) y `GoogleOauthService` es
fail-closed (D2): desplegar el código de PR4 antes del backfill bloquea TODO login Google
Workspace, incluido el del administrador que debería arreglarlo.

| # | Paso | Comando / acción | Verificación de salida | Estado |
|---|---|---|---|---|
| R1 | Migrar | `pnpm --filter backend exec prisma migrate deploy` (o `pnpm -C apps/backend exec prisma migrate deploy`) contra `DATABASE_URL` del entorno destino | Columnas `dominios_google`/`smtp_host`/`smtp_puerto`/`smtp_remitente` presentes; fila `clave='institucional'` intacta (mismo `id`) | **Pendiente de ejecución real** |
| R2 | Backfill de `dominios_google` y SMTP (OPERACIONAL, CRÍTICO) | `apps/backend/prisma/runbook/backfill-configuracion-institucional.sh` con `DATABASE_URL`/`GOOGLE_HOSTED_DOMAINS`/`SMTP_HOST`/`SMTP_PORT`/`SMTP_FROM` del entorno destino en el environment del shell | El script MUST salir con código 0 y reportar `dominios_google` no vacío. Si sale con código 1, **DETENERSE — no continuar a R3** | **Pendiente de ejecución real** |
| R3 | Desplegar código | Deploy del backend con las tareas 4.1-4.9 ya mergeadas — **solo después de que R2 haya pasado su verificación en ESE MISMO entorno** | Smoke test: un login Google Workspace real tiene éxito; un envío de recuperación real usa el host SMTP de `Configuracion` (no de env var) | **Pendiente de ejecución real** |
| R4 | Retirar env vars | Eliminar `GOOGLE_HOSTED_DOMAINS`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM` del entorno de ese backend. `SMTP_USER`/`SMTP_PASSWORD` **permanecen** (D4 — la contraseña SMTP nunca vive en `Configuracion`) | Reiniciar el proceso sin esas 4 vars: login Google Workspace y envío de correo siguen funcionando (confirma que D8 no dejó ningún fallback oculto a env var) | **Pendiente de ejecución real** |

## Repetición por entorno

Este procedimiento (R1→R4) MUST correrse completo, en ese orden, por cada entorno independiente
(staging primero, producción después) — nunca asumir que backfillar staging cubre producción.

## Rollback

Revertir el commit de código de PR4 restaura la lectura de `process.env.GOOGLE_HOSTED_DOMAINS` /
`process.env.SMTP_HOST` / etc. Por eso R4 (retirar env vars) se ejecuta último: mientras esas vars
sigan configuradas en el entorno, un rollback de código sigue funcionando sin backfill adicional.
La migración de PR1/PR4 no tiene `down` que elimine `smtp_host`/`smtp_puerto`/`smtp_remitente`
(columnas preexistentes, no agregadas por este change).

## Verificación de que no queda fallback oculto (D8)

design.md D8 exige que, tras el corte, `Configuracion` sea la única fuente — sin `env ?? DB`
silencioso. La verificación de salida de R4 (reiniciar sin las 4 env vars y confirmar que login y
correo siguen funcionando) es la prueba operativa de esa garantía; el guard test estático
`src/email/email.module.spec.ts` (`[4.6][R10]`) es la prueba de código equivalente para
`EmailModule` (ningún `PrismaService`/`JobCorreo`/`Notificacion` referenciado fuera del patrón
esperado).
