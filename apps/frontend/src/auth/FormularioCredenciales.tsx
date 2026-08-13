import { useId, useState } from 'react';

interface FormularioCredencialesProps {
  onEnviar: (codigo: string, password: string) => void;
  cargando: boolean;
  mensajeError?: string;
}

/**
 * Presentacional puro (design.md D8): código institucional + contraseña,
 * NUNCA correo (spec: minimal-login, "Formulario de login con código
 * institucional y contraseña" — el backend solo resuelve por `codigo`).
 * El submit queda deshabilitado con cualquiera de los dos campos vacíos —
 * spec: "Campos vacíos no disparan la petición".
 */
export function FormularioCredenciales({
  onEnviar,
  cargando,
  mensajeError,
}: FormularioCredencialesProps) {
  const [codigo, setCodigo] = useState('');
  const [password, setPassword] = useState('');
  const idCodigo = useId();
  const idPassword = useId();

  const camposCompletos = codigo.trim() !== '' && password.trim() !== '';

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(evento) => {
        evento.preventDefault();
        if (camposCompletos) onEnviar(codigo, password);
      }}
    >
      <div>
        <label htmlFor={idCodigo} className="text-label-md text-on-surface-variant">
          Código institucional
        </label>
        <input
          id={idCodigo}
          value={codigo}
          onChange={(evento) => setCodigo(evento.target.value)}
          autoComplete="username"
          className="mt-1 w-full rounded-control border border-border-gray bg-surface-white px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
        />
      </div>

      <div>
        <label htmlFor={idPassword} className="text-label-md text-on-surface-variant">
          Contraseña
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

      {mensajeError && (
        <p role="alert" className="text-label-md text-error">
          {mensajeError}
        </p>
      )}

      <button
        type="submit"
        disabled={!camposCompletos || cargando}
        className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary disabled:opacity-50"
      >
        Continuar
      </button>
    </form>
  );
}
