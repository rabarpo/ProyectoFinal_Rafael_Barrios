import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface ItemDesglose {
  id: string;
  etiqueta: string;
  votos: number;
  estado: 'activo' | 'baja';
}

interface GraficoDesgloseProps {
  dimension: 'lista' | 'candidato' | 'opcion';
  desglose: ItemDesglose[];
  blancos: number;
}

const COLOR_CATEGORIA = 'var(--color-primary)';
const COLOR_BLANCOS = 'var(--color-outline)';

interface FilaGrafico {
  etiqueta: string;
  votos: number;
  esBlanco: boolean;
}

/**
 * resultados-en-vivo (#16, PR4; design.md D12, tasks.md 17.1-17.7). Reemplaza a `DesgloseSimple`
 * (interino de PR3). El orden de `desglose` lo decide el servidor (votos desc, etiqueta asc,
 * `design.md` D4/D12) — el componente NUNCA reordena, ni para el gráfico ni para la tabla espejo.
 *
 * Mapeo dimension → tipo de gráfico (D12): `'opcion'` (consulta, partición excluyente de pocas
 * categorías) ⇒ pastel; `'lista'`/`'candidato'` (la pregunta es el orden, "quién va adelante") ⇒
 * barras horizontales. `blancos` se agrega como última categoría del gráfico con un token de
 * color distinto (`COLOR_BLANCOS`), nunca mezclado visualmente con las filas de
 * candidato/lista/opción — pero el array `desglose` recibido no se muta.
 *
 * La tabla `<table>` es obligatoria (D12): mismos datos en texto plano, para accesibilidad y
 * porque bajo jsdom `ResponsiveContainer` mide 0×0 y no dibuja — las pruebas asertan sobre la
 * tabla, no sobre el SVG.
 */
export function GraficoDesglose({ dimension, desglose, blancos }: GraficoDesgloseProps) {
  const datosGrafico: FilaGrafico[] = [
    ...desglose.map((item) => ({ etiqueta: item.etiqueta, votos: item.votos, esBlanco: false })),
    { etiqueta: 'Blancos', votos: blancos, esBlanco: true },
  ];

  return (
    <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
      <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Desglose</h2>

      <div className="mt-4 h-64">
        {dimension === 'opcion' ? (
          <div data-testid="grafico-pastel" className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={datosGrafico} dataKey="votos" nameKey="etiqueta" isAnimationActive={false}>
                  {datosGrafico.map((fila) => (
                    <Cell
                      key={fila.etiqueta}
                      fill={fila.esBlanco ? COLOR_BLANCOS : COLOR_CATEGORIA}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div data-testid="grafico-barras" className="h-full w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosGrafico} layout="vertical">
                <XAxis type="number" />
                <YAxis type="category" dataKey="etiqueta" width={120} />
                <Tooltip />
                <Bar dataKey="votos" isAnimationActive={false}>
                  {datosGrafico.map((fila) => (
                    <Cell
                      key={fila.etiqueta}
                      fill={fila.esBlanco ? COLOR_BLANCOS : COLOR_CATEGORIA}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <table className="mt-4 w-full text-body-md text-on-surface">
        <thead>
          <tr className="border-b border-border-gray text-left text-on-surface-variant">
            <th scope="col" className="py-2">Etiqueta</th>
            <th scope="col" className="py-2 text-right">Votos</th>
          </tr>
        </thead>
        <tbody>
          {desglose.map((item) => (
            <tr key={item.id} className="border-b border-border-gray">
              <td className="py-2">
                {item.etiqueta}
                {item.estado === 'baja' ? ' (de baja)' : ''}
              </td>
              <td className="py-2 text-right">{item.votos}</td>
            </tr>
          ))}
          <tr>
            <td className="py-2">Blancos</td>
            <td className="py-2 text-right">{blancos}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
