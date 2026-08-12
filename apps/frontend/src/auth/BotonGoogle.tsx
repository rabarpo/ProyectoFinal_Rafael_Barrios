import { useRef } from 'react';
import { useGoogleIdentity } from './useGoogleIdentity';

interface BotonGoogleProps {
  onCredential: (idToken: string) => void;
}

/**
 * Presentacional puro (design.md D8): render del botón de Google Identity
 * Services. **Fail-closed (D10)**: sin `VITE_GOOGLE_CLIENT_ID` NO renderiza
 * nada — ni deshabilitado ni "roto" — en espejo de la regla de ADR-0017 de
 * que `GOOGLE_CLIENT_ID` ausente rechaza todo login OAuth en el backend.
 */
export function BotonGoogle({ onCredential }: BotonGoogleProps) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const contenedorRef = useRef<HTMLDivElement>(null);

  useGoogleIdentity({ clientId, onCredential, contenedorRef });

  if (!clientId) return null;

  return <div ref={contenedorRef} data-testid="boton-google" />;
}
