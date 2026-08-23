import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { VotosPorHoraDto } from '../panel-jornada-api';

interface GraficoVotosPorHoraProps {
  franjas: VotosPorHoraDto['franjas'];
}

/**
 * dashboard-panel-jornada (Backlog #20, PR3; design.md "Estrategia de pruebas", tasks.md
 * 11.2/11.5). Mismo gotcha de `recharts`/jsdom que `GraficoDesglose` (#16): bajo jsdom
 * `ResponsiveContainer` mide 0×0 y no dibuja — las pruebas asertan sobre la tabla espejo, nunca
 * sobre el SVG. El orden de `franjas` lo decide el servidor (cronológico, D-votos-por-hora); el
 * componente NUNCA reordena.
 */
export function GraficoVotosPorHora({ franjas }: GraficoVotosPorHoraProps) {
  const datosGrafico = franjas.map((franja) => ({
    etiqueta: new Date(franja.hora_inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    votos: franja.votos,
  }));

  return (
    <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
      <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Votos por hora</h2>

      <div data-testid="grafico-votos-por-hora" className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={datosGrafico}>
            <XAxis dataKey="etiqueta" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="votos" isAnimationActive={false} fill="var(--color-primary)" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="mt-4 w-full text-body-md text-on-surface">
        <thead>
          <tr className="border-b border-border-gray text-left text-on-surface-variant">
            <th scope="col" className="py-2">Franja horaria</th>
            <th scope="col" className="py-2 text-right">Votos</th>
          </tr>
        </thead>
        <tbody>
          {franjas.map((franja) => (
            <tr key={franja.hora_inicio} className="border-b border-border-gray">
              <td className="py-2">{new Date(franja.hora_inicio).toLocaleTimeString()}</td>
              <td className="py-2 text-right">{franja.votos}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
