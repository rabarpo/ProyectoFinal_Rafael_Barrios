import { useState } from 'react';
import { useSesion } from '../auth/sesion-context';
import { PESTANAS } from './pestanas';
import type { PestanaAcademica } from './pestanas';

/**
 * administracion-academica, PR1 (#26; design.md D1/D2/D8). Resuelve `rol` ⇒ `soloLectura`
 * (allowlist fail-closed: cualquier rol que NO sea `administrador`/`director` cae en sólo
 * lectura, nunca `rol === 'comite'` — D8) y la pestaña activa vía `useState` LOCAL, nunca URL ni
 * contexto (D1). Renderiza SÓLO el panel activo — los otros 5 quedan desmontados. Los `case` de
 * este `switch` se reemplazan por paneles reales en PR4-PR7; hasta entonces cada uno es un stub.
 */
export function AcademicaPage() {
  const contexto = useSesion();
  const rol = contexto.estado === 'autenticado' ? contexto.sesion.rol : undefined;
  const soloLectura = rol !== 'administrador' && rol !== 'director';
  const [pestana, setPestana] = useState<PestanaAcademica>('anios');

  function renderPanel() {
    switch (pestana) {
      case 'anios':
        return <p data-testid="panel-stub-anios">Aún no implementado</p>;
      case 'niveles':
        return <p data-testid="panel-stub-niveles">Aún no implementado</p>;
      case 'grados':
        return <p data-testid="panel-stub-grados">Aún no implementado</p>;
      case 'secciones':
        return <p data-testid="panel-stub-secciones">Aún no implementado</p>;
      case 'aulas':
        return <p data-testid="panel-stub-aulas">Aún no implementado</p>;
      case 'matriculas':
        return <p data-testid="panel-stub-matriculas">Aún no implementado</p>;
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
                : 'px-4 py-3 text-label-md text-on-surface-variant hover:bg-surface-container'
            }
            onClick={() => setPestana(p.id)}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>

      {renderPanel()}

      {soloLectura && (
        <p className="sr-only" data-testid="academica-solo-lectura">
          Sección en modo de sólo lectura
        </p>
      )}
    </div>
  );
}
