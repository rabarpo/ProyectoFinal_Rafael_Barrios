import { useState } from 'react';
import { urlLogo } from '../../configuracion/configuracion-api';
import { BarraProgresoVotacion } from './BarraProgresoVotacion';
import { IconoVotoSecreto, IconoUnaSolaVez, IconoIrreversible } from './iconos-reglas';

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
    Icono: IconoVotoSecreto,
  },
  {
    titulo: 'Una sola vez',
    descripcion: 'Podés emitir tu voto una única vez en este proceso.',
    Icono: IconoUnaSolaVez,
  },
  {
    titulo: 'Proceso irreversible',
    descripcion: 'Una vez confirmado, tu voto no se puede modificar ni deshacer.',
    Icono: IconoIrreversible,
  },
];

const TEXTO_HERO_TITULO = 'Tu voz construye el futuro.';
const TEXTO_HERO_SUBTITULO =
  'Participar en la democracia escolar es el primer paso para liderar con responsabilidad.';

/**
 * fidelidad-visual-boleta-votacion, PR2 (design.md D4/D5/D8, tasks.md 6.1-7.1). Reescritura de
 * fidelidad visual del paso 1 sobre lo entregado por rediseno-boleta-votacion (#31): badge de
 * estado del proceso, hero grande con la imagen ya configurada en Configuración General
 * (`GET /configuracion/logo`, misma fuente sin campo nuevo en `ProcesoElectoral`) con texto
 * institucional superpuesto sobre un degradado, 3 tarjetas de reglas fijas del dominio con ícono
 * propio (`iconos-reglas.tsx`), y footer. Cambio de comportamiento respecto de #31 (D4): si no hay
 * logo persistido (`GET /configuracion/logo` → 404), el bloque hero YA NO se oculta — se pinta un
 * respaldo `bg-primary` sólido detrás del degradado y el texto institucional permanece visible,
 * para que el layout de dos columnas nunca colapse.
 */
export function PasoInformacionProceso({ proceso, yaVoto, onContinuar }: PasoInformacionProcesoProps) {
  const [logoRoto, setLogoRoto] = useState(false);

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <BarraProgresoVotacion pasoActual={1} totalPasos={3} />

      <span className="mt-6 inline-block rounded-full bg-primary-fixed px-3 py-1 text-label-md text-on-primary-fixed">
        Proceso Activo
      </span>

      <h1 className="mt-3 text-headline-lg-mobile text-primary md:text-headline-lg">{proceso.nombre}</h1>
      {proceso.descripcion && (
        <p className="mt-2 text-body-md text-on-surface-variant">{proceso.descripcion}</p>
      )}
      <p className="mt-2 text-label-md text-on-surface-variant">
        Cierra: {new Date(proceso.fecha_cierre_prevista).toLocaleString()}
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-primary">
          {!logoRoto && (
            <img
              src={urlLogo()}
              alt="Logo institucional"
              onError={() => setLogoRoto(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/30 to-transparent"
          />
          <div className="absolute inset-x-0 bottom-0 p-4 text-on-primary">
            <p className="text-title-md">{TEXTO_HERO_TITULO}</p>
            <p className="mt-1 text-body-md text-on-primary/90">{TEXTO_HERO_SUBTITULO}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {REGLAS.map(({ titulo, descripcion, Icono }) => (
            <div
              key={titulo}
              className={
                titulo === 'Proceso irreversible'
                  ? 'rounded-card border border-secondary/30 bg-surface-white p-4 shadow-elevation md:col-span-2'
                  : 'rounded-card border border-border-gray bg-surface-white p-4 shadow-elevation'
              }
            >
              <Icono
                className={
                  titulo === 'Proceso irreversible' ? 'h-6 w-6 text-secondary' : 'h-6 w-6 text-primary'
                }
              />
              <p
                className={
                  titulo === 'Proceso irreversible'
                    ? 'mt-2 text-title-md text-secondary'
                    : 'mt-2 text-title-md text-on-surface'
                }
              >
                {titulo}
              </p>
              <p className="mt-1 text-body-md text-on-surface-variant">{descripcion}</p>
            </div>
          ))}
        </div>
      </div>

      {yaVoto && (
        <p role="alert" className="mt-6 text-label-md text-on-surface">
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

      <footer className="mt-10 border-t border-border-gray bg-surface-container-low px-1 py-4 text-caption text-on-surface-variant">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} SEEI — Sistema de Elecciones Electrónicas</p>
          <p className="flex gap-4">
            <span>Privacidad</span>
            <span>Términos</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
