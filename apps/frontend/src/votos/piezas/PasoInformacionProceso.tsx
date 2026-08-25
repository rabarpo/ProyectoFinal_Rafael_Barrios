import { useState } from 'react';
import { urlLogo } from '../../configuracion/configuracion-api';
import { BarraProgresoVotacion } from './BarraProgresoVotacion';

interface ProcesoInfo {
  nombre: string;
  descripcion: string | null;
  fecha_cierre_prevista: string;
}

interface PasoInformacionProcesoProps {
  proceso: ProcesoInfo;
  yaVoto: boolean;
  onContinuar: () => void;
}

const REGLAS = [
  {
    titulo: 'Voto secreto',
    descripcion: 'Nadie puede ver por quién votaste — tu elección nunca queda ligada a tu identidad.',
  },
  {
    titulo: 'Una sola vez',
    descripcion: 'Podés emitir tu voto una única vez en este proceso.',
  },
  {
    titulo: 'Proceso irreversible',
    descripcion: 'Una vez confirmado, tu voto no se puede modificar ni deshacer.',
  },
];

/**
 * rediseno-boleta-votacion, PR4 (design.md D4/D5, tasks.md 16.1-16.4). Paso 1 rediseñado: barra de
 * progreso compartida (`pasoActual=1`), imagen institucional ya configurada en Configuración
 * General (`GET /configuracion/logo` sin campo nuevo en `ProcesoElectoral`) y 3 tarjetas de reglas
 * fijas del dominio (secreto/única vez/irreversible). El votante llama `urlLogo()` sin versión
 * (D4): un logo cacheado tras un reemplazo es un desvío puramente cosmético. Sin logo persistido el
 * endpoint responde 404 — se oculta con `onError` + `useState` local, sin romper el paso.
 */
export function PasoInformacionProceso({ proceso, yaVoto, onContinuar }: PasoInformacionProcesoProps) {
  const [logoRoto, setLogoRoto] = useState(false);

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <BarraProgresoVotacion pasoActual={1} totalPasos={3} />

      {!logoRoto && (
        <img
          src={urlLogo()}
          alt="Logo institucional"
          onError={() => setLogoRoto(true)}
          className="mx-auto mt-6 h-20 w-20 object-contain"
        />
      )}

      <h1 className="mt-4 text-headline-lg-mobile text-primary md:text-headline-lg">{proceso.nombre}</h1>
      {proceso.descripcion && (
        <p className="mt-2 text-body-md text-on-surface-variant">{proceso.descripcion}</p>
      )}
      <p className="mt-2 text-label-md text-on-surface-variant">
        Cierra: {new Date(proceso.fecha_cierre_prevista).toLocaleString()}
      </p>

      <div className="mt-6 space-y-3">
        {REGLAS.map((regla) => (
          <div
            key={regla.titulo}
            className="rounded-card border border-border-gray bg-surface-white p-4"
          >
            <p className="text-title-md text-on-surface">{regla.titulo}</p>
            <p className="mt-1 text-body-md text-on-surface-variant">{regla.descripcion}</p>
          </div>
        ))}
      </div>

      {yaVoto && (
        <p role="alert" className="mt-4 text-label-md text-on-surface">
          Ya votaste en este proceso.
        </p>
      )}

      <div className="mt-6">
        <button
          type="button"
          onClick={onContinuar}
          disabled={yaVoto}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-primary"
        >
          Comenzar Votación
        </button>
      </div>
    </div>
  );
}
