import { useState } from 'react';
import { useSesion } from '../auth/sesion-context';
import { PESTANAS } from './pestanas';
import type { PestanaAcademica } from './pestanas';
import { PanelAniosEscolares } from './paneles/PanelAniosEscolares';
import { PanelNiveles } from './paneles/PanelNiveles';
import { PanelGrados } from './paneles/PanelGrados';
import { PanelSecciones } from './paneles/PanelSecciones';
import { PanelAulas } from './paneles/PanelAulas';
import { PanelMatriculas } from './paneles/PanelMatriculas';

/**
 * administracion-academica, PR1 (#26; design.md D1/D2/D8). Resuelve `rol` ⇒ `soloLectura`
 * (allowlist fail-closed: cualquier rol que NO sea `administrador`/`director` cae en sólo
 * lectura, nunca `rol === 'comite'` — D8) y la pestaña activa vía `useState` LOCAL, nunca URL ni
 * contexto (D1). Renderiza SÓLO el panel activo — los otros 5 quedan desmontados. `anios`/`niveles`
 * montan los paneles reales desde PR4 (tasks.md 13.1); `grados`/`secciones` desde PR5 (tasks.md
 * 16.1); `aulas` desde PR6 (tasks.md 17.5); `matriculas` desde PR7 (tasks.md 18.11), la última
 * pestaña del chain.
 */
export function AcademicaPage() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const soloLectura = rol !== 'administrador' && rol !== 'director';
  const [pestana, setPestana] = useState<PestanaAcademica>('anios');

  function renderPanel() {
    switch (pestana) {
      case 'anios':
        return <PanelAniosEscolares soloLectura={soloLectura} />;
      case 'niveles':
        return <PanelNiveles soloLectura={soloLectura} />;
      case 'grados':
        return <PanelGrados soloLectura={soloLectura} />;
      case 'secciones':
        return <PanelSecciones soloLectura={soloLectura} />;
      case 'aulas':
        return <PanelAulas soloLectura={soloLectura} />;
      case 'matriculas':
        return <PanelMatriculas soloLectura={soloLectura} />;
    }
  }

  return (
    <div className="mx-auto w-full max-w-page px-5 md:px-12">
      <h1 className="mb-6 text-headline-lg-mobile text-primary md:text-headline-lg">Académica</h1>

      <div role="tablist" className="mb-6 flex gap-2 border-b border-border-gray" aria-label="Secciones académicas">
        {PESTANAS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={pestana === p.id}
            className={
              pestana === p.id
                ? 'border-b-2 border-primary px-4 py-3 text-label-md text-primary'
                : 'rounded-t-control px-4 py-3 text-label-md text-on-surface-variant transition-colors hover:bg-primary/10 hover:text-primary'
            }
            onClick={() => setPestana(p.id)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      <div className="rounded-card border border-border-gray bg-surface-white p-6 shadow-elevation">
        {renderPanel()}
      </div>

      {soloLectura && (
        <p className="sr-only" data-testid="academica-solo-lectura">
          Sección en modo de sólo lectura
        </p>
      )}
    </div>
  );
}
