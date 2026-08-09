# Design: Importación de padrón desde Excel

## Technical Approach

`ImportacionModule` nuevo en `apps/backend/src/importacion/`, síncrono en un solo request.
El controlador valida cabecera, extensión y tope de filas *antes* de tocar la base; el servicio
recorre las filas y, **por fila**, abre una `prisma.$transaction` y encadena
`UsersService.crearIdempotente(datos, actorId, tx)` + `MatriculasService.crearIdempotente(..., tx)`
(ambos aceptan `tx` externo y no abren transacción propia). Los errores de fila se acumulan
tipados; el reporte queda en Redis con TTL para su descarga en CSV; al final se emite un único
evento de auditoría agregado.

## Architecture Decisions

| # | Decisión | Alternativas rechazadas | Fundamento |
|---|----------|-------------------------|------------|
| D1 | `UsersModule` exporta `UsersService` y `AcademicoModule` exporta `MatriculasService`; `ImportacionModule` los importa | Redeclarar los providers en `ImportacionModule` | Redeclarar duplicaría `PrismaService`/sesiones — mismo criterio ya documentado en `users.module.ts` (D3 de #7) |
| D2 | Una transacción **por fila**, no por archivo | Una `$transaction` para todo el archivo; sin transacción | Una fila inválida no debe abortar las demás (spec R2); dentro de la fila, `Usuario`+`Matrícula` deben ser atómicos |
| D3 | Librería: **`exceljs`** desde el registro npm (lee `.xlsx` y `.csv`) | `xlsx`/SheetJS (elección tentativa del proposal) | La última versión de `xlsx` publicada en npm quedó congelada y arrastra avisos; su canal soportado es un tarball de CDN, incompatible con `pnpm audit`/lockfile del monorepo. Verificar con `pnpm audit` antes de fijar (ver Open Questions) |
| D4 | Reporte de errores en **Redis** (`importacion:errores:{id}`, TTL 24 h) vía `REDIS_CLIENT` | Tabla Prisma nueva; devolver el CSV inline en el `POST` | El reporte es un artefacto transitorio, no evidencia de auditoría (esa es la fila `EventoAuditoria`); evita migración. Precedente: el contador de intentos fallidos de `bloqueo-desbloqueo-cuentas` vive solo en Redis |
| D5 | CSV generado a mano (sin dependencia): BOM UTF-8, escape RFC 4180 y neutralización de fórmulas (prefijo `'` si el valor inicia con `= + - @`) | Librería de CSV | Cuatro columnas fijas; una dependencia más no se justifica. El prefijo evita inyección de fórmulas al abrir el archivo en Excel |
| D6 | Clave de auditoría aditiva `PADRON_IMPORTADO`, un evento por importación, en su propia `$transaction` corta al cierre | Un evento por fila | Spec R5. Los `USUARIO_CREADO`/`MATRICULA_CREADA` por fila **siguen emitiéndose** (comportamiento vigente de los servicios reutilizados): el "único evento" aplica a la clave nueva. No toca la cláusula `WHEN` del trigger de ADR-0016 (no involucra `Voto`) |
| D7 | Rechazo temprano: allowlist `.xlsx`/`.csv` (nunca `.xlsm`), `limits.fileSize` en `FileInterceptor`, cabecera exacta (trim + case-insensitive), tope 2000 filas | Validar mientras se procesa | Spec R1 exige rechazar sin procesar ninguna fila |

## Data Flow

    POST /importaciones/padron (multipart)
      │ AuthGuard → RolesGuard(@Roles administrador,director)
      │ FileInterceptor (memoria, limits.fileSize)
      ▼
    ImportacionController ──► ImportacionService.importar(buffer, actorId)
      │ 1. parsear (exceljs) → filas[]
      │ 2. validar cabecera + tope 2000  ──► 400 sin procesar nada
      │ 3. por cada fila:
      │      prisma.$transaction(tx =>
      │         UsersService.crearIdempotente(datos, actorId, tx)
      │         MatriculasService.crearIdempotente(codigos, actorId, tx))
      │      catch → push ErrorFila{fila,campo,motivo,valor_recibido}
      │ 4. Redis SETEX importacion:errores:{id} (TTL 24 h)
      │ 5. prisma.$transaction(tx => auditoria.log(tx,'PADRON_IMPORTADO',...))
      ▼
    ResultadoImportacionDto { importacion_id, totales, errores[] }

    GET /importaciones/:id/errores.csv → Redis GET → StreamableFile (attachment)
                                          ausente/expirado → 404

## File Changes

| Archivo | Acción | Descripción |
|---------|--------|-------------|
| `apps/backend/src/importacion/importacion.module.ts` | Crear | Importa `AuthModule`, `AuditoriaModule`, `UsersModule`, `AcademicoModule`; `redisProvider`; `cookieParser()` en `forRoutes` |
| `apps/backend/src/importacion/importacion.controller.ts` | Crear | `POST /importaciones/padron`, `GET /importaciones/:id/errores.csv` |
| `apps/backend/src/importacion/importacion.service.ts` | Crear | Parseo, validación, bucle por fila, Redis, auditoría |
| `apps/backend/src/importacion/padron-csv.ts` | Crear | Cabecera esperada, parseo de fila y serialización del CSV de errores |
| `apps/backend/src/importacion/importacion.errors.ts` | Crear | `MOTIVOS_FILA` (`fila_vacia`, `formato`, `campo_duplicado`, `referencia_inexistente`) |
| `apps/backend/src/importacion/dto/*.ts` | Crear | `ResultadoImportacionDto`, `ErrorFilaDto` |
| `apps/backend/src/academico/matriculas.service.ts` | Modificar | Agregar `crearIdempotente()` (delta `student-enrollment`) |
| `apps/backend/src/academico/academico.module.ts` | Modificar | `exports: [MatriculasService]` |
| `apps/backend/src/users/users.module.ts` | Modificar | `exports: [UsersService]` |
| `apps/backend/src/auditoria/audit-event-types.ts` | Modificar | `PADRON_IMPORTADO` |
| `apps/backend/src/app.module.ts` | Modificar | Registrar `ImportacionModule` |
| `apps/backend/package.json` | Modificar | `exceljs`; dev `@types/multer` |

## Interfaces / Contracts

```ts
export const CABECERA_PADRON = ['nombres','dni','codigo','correo',
  'grado_nombre','seccion_nombre','turno','anio_escolar_codigo'] as const;

export interface ErrorFila { fila: number; campo: string; motivo: MotivoFila; valor_recibido: string }

export interface ResultadoImportacion {
  importacion_id: string;
  filas_totales: number; filas_creadas: number; filas_existentes: number; filas_invalidas: number;
  errores: ErrorFila[];
}

// matriculas.service.ts — referencias legibles, nunca UUID
crearIdempotente(
  datos: { usuario_id: string; grado_nombre: string; seccion_nombre: string;
           turno: Turno; anio_escolar_codigo: string },
  actorId: string, txExterno?: Prisma.TransactionClient,
): Promise<{ matricula: MatriculaRespuestaDto; creado: boolean }>;
```

`Aula` se resuelve por `(grado.nombre, seccion.nombre, turno, anio_escolar_id)` —
`@@unique([grado_id, seccion_id, anio_escolar_id])` la hace única; `AnioEscolar` por `nombre` (único).
`crearIdempotente` reutiliza las validaciones vigentes de `crear()` (rol `estudiante`, coherencia
jerárquica, existencia de referencias) y devuelve `creado: false` en vez de `409 RESTRICCION_UNICA`.

## Testing Strategy

| Capa | Qué | Cómo |
|------|-----|------|
| Unit | `crearIdempotente` (duplicado, referencia inexistente, rol, coherencia), parseo de cabecera, escape/anti-fórmula del CSV | Jest + mocks de Prisma, como `matriculas.service.spec.ts` |
| Integración | Bucle por fila: rollback aislado de una fila, filas posteriores procesadas | Jest con `PrismaService` mockeado |
| E2E | Archivo mixto, reimportación sin duplicados, cabecera inválida, >2000 filas, `.xlsm` rechazado, descarga del CSV, 403 por rol | `apps/backend/test/*.e2e-spec.ts` con Postgres/Redis reales |

## Threat Matrix

N/A — el cambio no toca enrutamiento de shell, subprocesos, automatización VCS/PR, clasificación de
archivos ejecutables ni integración de procesos. La superficie de archivo subido se cubre en D5/D7
(allowlist de extensión, `limits.fileSize`, tope de filas, anti-inyección de fórmulas en la salida).

## Migration / Rollout

Sin migración de datos ni de esquema. Cambio aditivo puro: módulo nuevo, método nuevo, dos `exports`,
una clave de auditoría y una dependencia. Rollback = quitar `ImportacionModule` de `app.module.ts`.

## Open Questions

- [ ] Confirmar `exceljs` con `pnpm audit` y verificar que su lectura de `.csv` respeta la cabecera
      fija; si falla, alternativa `xlsx` desde el canal soportado de SheetJS (D3).
- [ ] TTL de 24 h y tamaño máximo del multipart (propuesta: 5 MB) — valores sin precedente interno.
