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
    <section className="flex flex-col gap-6">
      <h2 className="text-title-md text-on-surface">Padrón en vivo</h2>

      {cargando && <p className="text-body-md text-on-surface-variant">Calculando…</p>}
      {error && (
        <p role="alert" className="text-label-md text-error">
          No se pudo calcular el padrón
        </p>
      )}

      {!cargando && !error && !datos && (
        <p className="text-body-md text-on-surface-variant">
          Completá el público y la segmentación del paso anterior.
        </p>
      )}

      {datos && (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-card bg-surface-container-low p-4">
            <dt className="text-label-md text-on-surface-variant">Derechos totales</dt>
            <dd className="text-body-lg text-on-surface">{datos.derechos_totales}</dd>
            <dt className="text-label-md text-on-surface-variant">Estudiantes elegibles</dt>
            <dd className="text-body-lg text-on-surface">{datos.estudiantes}</dd>
            <dt className="text-label-md text-on-surface-variant">Con apoderado registrado</dt>
            <dd className="text-body-lg text-on-surface">{datos.padres}</dd>
            <dt className="text-label-md text-on-surface-variant">Cuentas distintas</dt>
            <dd className="text-body-lg text-on-surface">{datos.cuentas_distintas}</dd>
          </dl>

          {datos.aviso === 'MATRICULA_DUPLICADA' && (
            <p role="alert" className="text-label-md text-error">
              Aviso: hay estudiantes con más de una matrícula activa en el año escolar; el conteo
              puede sobrestimar la cantidad de cuentas.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-label-md text-on-surface-variant">Desglose por aula</h3>
            <ul className="flex flex-col gap-1">
              {datos.aulas.map((aula) => (
                <li key={aula.aula_id} className="text-body-md text-on-surface">
                  {aula.aula_id}: {aula.derechos} derechos ({aula.estudiantes} estudiantes,{' '}
                  {aula.padres} con apoderado)
                </li>
              ))}
            </ul>
          </div>

          {datos.aulas_excluidas.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="text-label-md text-on-surface-variant">
                Aulas excluidas (sin matrícula activa)
              </h3>
              <ul className="flex flex-col gap-1">
                {datos.aulas_excluidas.map((aulaId) => (
                  <li key={aulaId} className="text-body-md text-on-surface">
                    {aulaId}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
