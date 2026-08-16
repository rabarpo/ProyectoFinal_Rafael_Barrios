export interface ItemDesglose {
  id: string;
  etiqueta: string;
  votos: number;
  estado: 'activo' | 'baja';
}

interface DesgloseSimpleProps {
  desglose: ItemDesglose[];
  blancos: number;
}

/**
 * resultados-en-vivo (#16, PR3; design.md D12/D5, tasks.md Phase 13, "no gráficos todavía").
 * Presentacional puro e INTERINO: lista cruda candidato/lista/opción + conteo, sin ningún
 * gráfico de `recharts` (eso es PR4/Phase 17). `piezas/GraficoDesglose.tsx` reemplaza este
 * componente en `ResultadosPage` en la Phase 17.7 de `tasks.md`; el nombre y la forma de esta
 * pieza son una decisión de implementación de PR3, no de `design.md` — la estructura de datos
 * (`ItemDesglose[]`, ya ordenada por el servidor) es la misma que `GraficoDesglose` va a decorar.
 */
export function DesgloseSimple({ desglose, blancos }: DesgloseSimpleProps) {
  return (
    <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
      <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Desglose</h2>

      <ul className="mt-4 space-y-2 text-body-md text-on-surface">
        {desglose.map((item) => (
          <li key={item.id} className="flex justify-between border-b border-border-gray pb-2">
            <span>
              {item.etiqueta}
              {item.estado === 'baja' ? ' (de baja)' : ''}
            </span>
            <span>{item.votos}</span>
          </li>
        ))}
        <li className="flex justify-between pt-2">
          <span>Blancos</span>
          <span>{blancos}</span>
        </li>
      </ul>
    </div>
  );
}
