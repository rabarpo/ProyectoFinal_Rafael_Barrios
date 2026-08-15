import { useRef } from 'react';

function claveStorage(procesoId: string, derechoVotoId: string): string {
  return `seei:voto:${procesoId}:${derechoVotoId}`;
}

/**
 * vote-casting, PR5 (design.md D15, tasks.md 16.5-16.7). `crypto.randomUUID()` persistido en
 * `sessionStorage` bajo `seei:voto:{procesoId}:{derechoVotoId}` — escrita antes del `POST` y
 * NUNCA borrada durante la sesión (D15: borrarla tras el éxito abriría un camino de colisión
 * inofensivo pero evitable). Si `sessionStorage` lanza (modo privado), cae a un `useRef` en
 * memoria del propio componente: sigue estable dentro de la misma sesión de render aunque no
 * sobreviva a un remount — "protege el doble clic pero no la recarga" (D15).
 */
export function useClaveIdempotencia(procesoId: string, derechoVotoId: string): string {
  const clave = claveStorage(procesoId, derechoVotoId);
  const memoriaRef = useRef<string | undefined>(undefined);

  try {
    const existente = window.sessionStorage.getItem(clave);
    if (existente) return existente;
    const nueva = crypto.randomUUID();
    window.sessionStorage.setItem(clave, nueva);
    return nueva;
  } catch {
    if (!memoriaRef.current) {
      memoriaRef.current = crypto.randomUUID();
    }
    return memoriaRef.current;
  }
}
