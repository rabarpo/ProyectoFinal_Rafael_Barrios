import { useId, useState } from 'react';
import { IconoCandado, IconoOjo, IconoOjoTachado, IconoUsuario } from './iconos';

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
  const [passwordVisible, setPasswordVisible] = useState(false);
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
        <div className="relative mt-1">
          <IconoUsuario className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-outline" />
          <input
            id={idCodigo}
            value={codigo}
            onChange={(evento) => setCodigo(evento.target.value)}
            autoComplete="username"
            className="w-full rounded-control border border-border-gray bg-surface-white py-2 pl-10 pr-3 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
        </div>
      </div>

      <div>
        <label htmlFor={idPassword} className="text-label-md text-on-surface-variant">
          Contraseña
        </label>
        <div className="relative mt-1">
          <IconoCandado className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-outline" />
          <input
            id={idPassword}
            type={passwordVisible ? 'text' : 'password'}
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            autoComplete="current-password"
            className="w-full rounded-control border border-border-gray bg-surface-white py-2 pl-10 pr-10 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-primary"
          />
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-outline hover:text-primary"
          >
            {passwordVisible ? <IconoOjoTachado className="size-5" /> : <IconoOjo className="size-5" />}
          </button>
        </div>
      </div>

      {mensajeError && (
        <p role="alert" className="text-label-md text-error">
          {mensajeError}
        </p>
      )}

      <button
        type="submit"
        disabled={!camposCompletos || cargando}
        className="rounded-control bg-primary px-6 py-3 text-label-md text-on-primary transition-colors hover:bg-primary-container disabled:opacity-50"
      >
        Continuar
      </button>
    </form>
  );
}
