import type { EstadoPadron } from '../usePadronEnVivo';

interface PasoPadronProps {
  estadoPadron: EstadoPadron;
}

/**
 * Presentacional, paso 3 del asistente (design.md D7): conteo en vivo,
 * desglose por aula, aulas excluidas y aviso de `MATRICULA_DUPLICADA`. No
 * dispara la petición — recibe el resultado de `usePadronEnVivo` ya resuelto
 * por el contenedor (mismo patrón que `PasoDatos`/`PasoPublico`: el único
 * componente con efectos es `ProcesoWizardPage`, aquí vía el hook).
 */
export function PasoPadron({ estadoPadron }: PasoPadronProps) {
  const { cargando, datos, error } = estadoPadron;

  return (
    <section>
      <h2>Padrón en vivo</h2>

      {cargando && <p>Calculando…</p>}
      {error && <p role="alert">No se pudo calcular el padrón</p>}

      {!cargando && !error && !datos && <p>Completá el público y la segmentación del paso anterior.</p>}

      {datos && (
        <>
          <dl>
            <dt>Derechos totales</dt>
            <dd>{datos.derechos_totales}</dd>
            <dt>Estudiantes elegibles</dt>
            <dd>{datos.estudiantes}</dd>
            <dt>Con apoderado registrado</dt>
            <dd>{datos.padres}</dd>
            <dt>Cuentas distintas</dt>
            <dd>{datos.cuentas_distintas}</dd>
          </dl>

          {datos.aviso === 'MATRICULA_DUPLICADA' && (
            <p role="alert">
              Aviso: hay estudiantes con más de una matrícula activa en el año escolar; el conteo
              puede sobrestimar la cantidad de cuentas.
            </p>
          )}

          <h3>Desglose por aula</h3>
          <ul>
            {datos.aulas.map((aula) => (
              <li key={aula.aula_id}>
                {aula.aula_id}: {aula.derechos} derechos ({aula.estudiantes} estudiantes,{' '}
                {aula.padres} con apoderado)
              </li>
            ))}
          </ul>

          {datos.aulas_excluidas.length > 0 && (
            <>
              <h3>Aulas excluidas (sin matrícula activa)</h3>
              <ul>
                {datos.aulas_excluidas.map((aulaId) => (
                  <li key={aulaId}>{aulaId}</li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
