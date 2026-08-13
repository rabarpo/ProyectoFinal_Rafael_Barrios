import { useId } from 'react';
import type { DatosProceso, TipoProceso } from '../wizard-reducer';

interface PasoDatosProps {
  datos: DatosProceso;
  onCambiarNombre: (valor: string) => void;
  onCambiarDescripcion: (valor: string) => void;
  onCambiarTipo: (valor: TipoProceso) => void;
  onCambiarFechaApertura: (valor: string) => void;
  onCambiarFechaCierre: (valor: string) => void;
}

const OPCIONES_TIPO: { valor: TipoProceso; etiqueta: string }[] = [
  { valor: 'municipio', etiqueta: 'Municipio escolar' },
  { valor: 'representante_aula', etiqueta: 'Representante de aula' },
  { valor: 'padres', etiqueta: 'Padres de familia' },
  { valor: 'consulta', etiqueta: 'Consulta' },
];

/**
 * Presentacional puro, paso 1 del asistente (design.md D7): nombre,
 * descripción, tipo y fechas previstas. Elegir `tipo` es lo único que
 * invalida `alcance` en el reducer (spec: "Selección de tipo determina las
 * opciones de segmentación disponibles") — este componente no conoce esa
 * regla, solo notifica el cambio.
 */
export function PasoDatos({
  datos,
  onCambiarNombre,
  onCambiarDescripcion,
  onCambiarTipo,
  onCambiarFechaApertura,
  onCambiarFechaCierre,
}: PasoDatosProps) {
  const idNombre = useId();
  const idDescripcion = useId();
  const idTipo = useId();
  const idApertura = useId();
  const idCierre = useId();

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-headline-lg-mobile md:text-headline-lg text-on-surface">
        Datos del proceso
      </h2>

      <div className="flex flex-col gap-1">
        <label htmlFor={idNombre} className="text-label-md text-on-surface-variant">
          Nombre
        </label>
        <input
          id={idNombre}
          value={datos.nombre}
          onChange={(e) => onCambiarNombre(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idDescripcion} className="text-label-md text-on-surface-variant">
          Descripción
        </label>
        <textarea
          id={idDescripcion}
          value={datos.descripcion}
          onChange={(e) => onCambiarDescripcion(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idTipo} className="text-label-md text-on-surface-variant">
          Tipo de proceso
        </label>
        <select
          id={idTipo}
          value={datos.tipo ?? ''}
          onChange={(e) => onCambiarTipo(e.target.value as TipoProceso)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        >
          <option value="" disabled>
            Elegí un tipo
          </option>
          {OPCIONES_TIPO.map((opcion) => (
            <option key={opcion.valor} value={opcion.valor}>
              {opcion.etiqueta}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idApertura} className="text-label-md text-on-surface-variant">
          Fecha de apertura prevista
        </label>
        <input
          id={idApertura}
          type="datetime-local"
          value={datos.fecha_apertura_prevista}
          onChange={(e) => onCambiarFechaApertura(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idCierre} className="text-label-md text-on-surface-variant">
          Fecha de cierre prevista
        </label>
        <input
          id={idCierre}
          type="datetime-local"
          value={datos.fecha_cierre_prevista}
          onChange={(e) => onCambiarFechaCierre(e.target.value)}
          className="w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>
    </section>
  );
}
