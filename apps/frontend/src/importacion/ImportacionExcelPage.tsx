import { useSesion } from '../auth/sesion-context';

/**
 * frontend-importacion-excel, PR1 (#29; design.md D8/D9, tasks.md 1.6; spec: importacion-excel,
 * "Pantalla única de importación de padrón" / "Rol no autorizado no alcanza la pantalla").
 *
 * PR1 entrega sólo el esqueleto: el gate binario allowlist fail-closed (D9) y el estado vacío.
 * NO hay fetch, NO hay piezas (`CampoArchivo`, `ResumenImportacion`, `TablaErroresImportacion`),
 * NO hay máquina de estados todavía — llegan en PR2/PR3/PR4.
 *
 * D9: `puedeImportar = rol === 'administrador' || rol === 'director'`, mismo criterio que
 * `ConfiguracionPage` (#28 D10) — `ImportacionController` es `@Roles('administrador','director')`
 * a nivel de clase, así que ninguna de sus dos rutas es alcanzable por otro rol. Allowlist ⇒ un
 * rol futuro o `estado !== 'autenticado'` cae del lado cerrado. Si el gate falla: aviso
 * `role="status"`, cero piezas y (cuando exista) cero llamadas a la API. La autorización real
 * sigue siendo `@Roles()` server-side; este gate es presentación.
 */
export function ImportacionExcelPage() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const puedeImportar = rol === 'administrador' || rol === 'director';

  if (!puedeImportar) {
    return (
      <p
        role="status"
        className="mx-auto w-full max-w-page px-5 py-6 text-body-md text-on-surface-variant md:px-12"
      >
        Esta sección no está disponible para tu rol.
      </p>
    );
  }

  return (
    <div
      data-testid="importacion-excel-contenido"
      className="mx-auto w-full max-w-page px-5 md:px-12"
    >
      <h1 className="text-headline-lg-mobile text-primary md:text-headline-lg">
        Importación de padrón
      </h1>
      <p className="py-6 text-body-md text-on-surface-variant">
        Todavía no has importado ningún padrón. Selecciona un archivo <code>.xlsx</code> o{' '}
        <code>.csv</code> para comenzar.
      </p>
    </div>
  );
}
