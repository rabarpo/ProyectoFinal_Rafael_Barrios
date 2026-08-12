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
    <div role="dialog" aria-label="Vincular cuenta de Google">
      <p>
        Esta cuenta ya tiene contraseña. Confirmá tu contraseña actual para vincularla con Google.
      </p>

      <label htmlFor={idPassword}>Contraseña actual</label>
      <input
        id={idPassword}
        type="password"
        value={password}
        onChange={(evento) => setPassword(evento.target.value)}
        autoComplete="current-password"
      />

      <button
        type="button"
        onClick={() => {
          if (passwordCompleta) onConfirmar(password);
        }}
        disabled={!passwordCompleta || cargando}
      >
        Confirmar
      </button>
      <button type="button" onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  );
}
