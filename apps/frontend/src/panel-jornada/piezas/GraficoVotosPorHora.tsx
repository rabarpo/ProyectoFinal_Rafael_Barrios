import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { VotosPorHoraDto } from '../panel-jornada-api';

interface GraficoVotosPorHoraProps {
  franjas: VotosPorHoraDto['franjas'];
}

// observación del usuario: paleta más llamativa para "Votos por Hora". Es magnitud (conteo de
// votos por franja), no identidad, así que en vez de recolorear cada barra con un color distinto
// (eso confundiría "más colorido" con "más categorías", cuando en realidad es la MISMA métrica en
// el tiempo) se usa una rampa SECUENCIAL de un solo matiz, clara→oscura, del skill de dataviz
// (references/palette.md, rampa "azul"): la franja con más votos se pinta más intensa, la de menos
// vota más clara — sigue siendo vistoso y además la intensidad ahora comunica el pico de la
// jornada, en vez de ser puramente decorativo.
const RAMPA_SECUENCIAL = [
  '#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7',
  '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b',
];

function colorPorMagnitud(votos: number, maxVotos: number): string {
  if (maxVotos <= 0) return RAMPA_SECUENCIAL[0];
  const t = Math.min(1, Math.max(0, votos / maxVotos));
  const indice = Math.round(t * (RAMPA_SECUENCIAL.length - 1));
  return RAMPA_SECUENCIAL[indice];
}

/**
 * dashboard-panel-jornada (Backlog #20, PR3; design.md "Estrategia de pruebas", tasks.md
 * 11.2/11.5). Mismo gotcha de `recharts`/jsdom que `GraficoDesglose` (#16): bajo jsdom
 * `ResponsiveContainer` mide 0×0 y no dibuja — las pruebas asertan sobre la tabla espejo, nunca
 * sobre el SVG. El orden de `franjas` lo decide el servidor (cronológico, D-votos-por-hora); el
 * componente NUNCA reordena.
 */
export function GraficoVotosPorHora({ franjas }: GraficoVotosPorHoraProps) {
  const maxVotos = franjas.reduce((max, franja) => Math.max(max, franja.votos), 0);
  const datosGrafico = franjas.map((franja) => ({
    etiqueta: new Date(franja.hora_inicio).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    votos: franja.votos,
    color: colorPorMagnitud(franja.votos, maxVotos),
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
            <Bar dataKey="votos" isAnimationActive={false}>
              {datosGrafico.map((fila) => (
                <Cell key={fila.etiqueta} fill={fila.color} />
              ))}
            </Bar>
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
