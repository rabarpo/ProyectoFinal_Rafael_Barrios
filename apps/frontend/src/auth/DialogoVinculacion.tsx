import { useId, useState } from 'react';

interface DialogoVinculacionProps {
  onConfirmar: (password: string) => void;
  onCancelar: () => void;
  cargando: boolean;
}

/**
 * Presentacional puro (design.md D8): segundo paso de `VINCULACION_REQUERIDA`
 * (409 de `POST /auth/google`). El `idToken` ya recibido de Google queda del
 * lado de `LoginPage` — este componente solo pide y devuelve la contraseña
 * actual (spec: minimal-login, "Vinculación requerida (409) no autentica ni
 * redirige").
 */
export function DialogoVinculacion({ onConfirmar, onCancelar, cargando }: DialogoVinculacionProps) {
  const [password, setPassword] = useState('');
  const idPassword = useId();

  const passwordCompleta = password.trim() !== '';

  return (
    <div
      role="dialog"
      aria-label="Vincular cuenta de Google"
      className="rounded-card bg-surface-white p-6 shadow-elevation"
    >
      <p className="text-body-md text-on-surface">
        Esta cuenta ya tiene contraseña. Confirmá tu contraseña actual para vincularla con Google.
      </p>

      <div className="mt-4">
        <label htmlFor={idPassword} className="text-label-md text-on-surface-variant">
          Contraseña actual
        </label>
        <input
          id={idPassword}
          type="password"
          value={password}
          onChange={(evento) => setPassword(evento.target.value)}
          autoComplete="current-password"
          className="mt-1 w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <div className="mt-6 flex gap-4">
        <button
          type="button"
          onClick={() => {
            if (passwordCompleta) onConfirmar(password);
          }}
          disabled={!passwordCompleta || cargando}
          className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary disabled:opacity-50"
        >
          Confirmar
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-control px-4 py-3 text-label-md text-primary"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
