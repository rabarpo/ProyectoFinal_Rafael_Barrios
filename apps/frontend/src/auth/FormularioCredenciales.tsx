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
      onSubmit={(evento) => {
        evento.preventDefault();
        if (camposCompletos) onEnviar(codigo, password);
      }}
    >
      <label htmlFor={idCodigo}>Código institucional</label>
      <input
        id={idCodigo}
        value={codigo}
        onChange={(evento) => setCodigo(evento.target.value)}
        autoComplete="username"
      />

      <label htmlFor={idPassword}>Contraseña</label>
      <input
        id={idPassword}
        type="password"
        value={password}
        onChange={(evento) => setPassword(evento.target.value)}
        autoComplete="current-password"
      />

      {mensajeError && <p role="alert">{mensajeError}</p>}

      <button type="submit" disabled={!camposCompletos || cargando}>
        Continuar
      </button>
    </form>
  );
}
