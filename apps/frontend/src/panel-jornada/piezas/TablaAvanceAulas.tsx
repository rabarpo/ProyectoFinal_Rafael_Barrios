import type { AvanceAulasDto } from '../panel-jornada-api';

interface TablaAvanceAulasProps {
  aulas: AvanceAulasDto['aulas'];
}

/**
 * dashboard-panel-jornada (Backlog #20, PR3; design.md D7, tasks.md 11.3/11.5; threat:
 * inferencia en aulas pequeñas). Presentacional pura: nunca emite desglose por candidato, sólo
 * participación (mismo contrato que `AulaAvanceDto`). `rezagada` se resalta con
 * `data-rezagada="true"`; defensa en profundidad del lado del cliente: `padron === 0` NUNCA se
 * marca rezagada, aunque el prop lo indique (el servidor ya garantiza esto, D7, pero el
 * componente no confía ciegamente en un payload adversario).
 */
export function TablaAvanceAulas({ aulas }: TablaAvanceAulasProps) {
  return (
    <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
      <h2 className="text-headline-lg-mobile text-primary md:text-headline-lg">Avance por aula</h2>

      <table className="mt-4 w-full text-body-md text-on-surface">
        <thead>
          <tr className="border-b border-border-gray text-left text-on-surface-variant">
            <th scope="col" className="py-2">Aula</th>
            <th scope="col" className="py-2 text-right">Padrón</th>
            <th scope="col" className="py-2 text-right">Votos</th>
            <th scope="col" className="py-2 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {aulas.map((aula) => {
            const rezagada = aula.rezagada && aula.padron > 0;
            return (
              <tr
                key={aula.aula_id}
                data-rezagada={rezagada}
                className={`border-b border-border-gray ${rezagada ? 'bg-error-container' : ''}`}
              >
                <td className="py-2">{aula.etiqueta}</td>
                <td className="py-2 text-right">{aula.padron}</td>
                <td className="py-2 text-right">{aula.votos}</td>
                <td className="py-2 text-right">{aula.porcentaje.toFixed(1)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
