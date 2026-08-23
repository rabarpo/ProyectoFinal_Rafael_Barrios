interface ProcesoActivo {
  id: string;
  nombre: string;
}

interface SelectorProcesoActivoProps {
  procesos: ProcesoActivo[];
  procesoId: string | undefined;
  onSeleccionar: (procesoId: string) => void;
}

/**
 * dashboard-panel-jornada (Backlog #20, PR3; design.md "Cambios de archivos", tasks.md
 * 11.4/11.5; spec: "Panel lista procesos activos"). Presentacional pura, sin fetch propio: la
 * lista de procesos abiertos (`GET /procesos?estado=abierto`) la resuelve `PanelJornadaPage`, no
 * este componente (design.md, "Procesos activos reutiliza el endpoint existente" — sin endpoint
 * nuevo).
 */
export function SelectorProcesoActivo({ procesos, procesoId, onSeleccionar }: SelectorProcesoActivoProps) {
  return (
    <label className="block text-body-md text-on-surface">
      <span className="text-on-surface-variant">Proceso activo</span>
      <select
        className="mt-1 block w-full rounded-md border border-border-gray p-2"
        value={procesoId ?? ''}
        onChange={(evento) => onSeleccionar(evento.target.value)}
      >
        <option value="" disabled>
          Seleccionar proceso…
        </option>
        {procesos.map((proceso) => (
          <option key={proceso.id} value={proceso.id}>
            {proceso.nombre}
          </option>
        ))}
      </select>
    </label>
  );
}
