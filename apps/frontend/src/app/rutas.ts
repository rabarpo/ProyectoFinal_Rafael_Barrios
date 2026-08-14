/**
 * Enrutador hand-rolled (design.md D10, spec: minimal-frontend-router): unión
 * discriminada + parser total. `parsearRuta` NUNCA lanza — cualquier
 * `pathname` no reconocido, con segmentos `.`/`..`, o de forma inesperada
 * cae en la variante `no-encontrada` (threat matrix "Enrutamiento (cliente)":
 * `/../../etc/passwd`, ruta inexistente). `rutaAPath` es la inversa exacta
 * para las variantes navegables.
 */
export type Ruta =
  | { nombre: 'proceso-nuevo' }
  | { nombre: 'procesos' }
  | { nombre: 'candidatos'; procesoId: string }
  | { nombre: 'candidato-nuevo'; procesoId: string }
  | { nombre: 'candidato-edicion'; procesoId: string; candidatoId: string }
  | { nombre: 'apertura'; procesoId: string }
  | { nombre: 'no-encontrada'; pathname: string };

function segmentos(pathname: string): string[] {
  return pathname.split('/').filter((segmento) => segmento.length > 0);
}

function segmentoValido(segmento: string): boolean {
  return segmento !== '.' && segmento !== '..';
}

export function parsearRuta(pathname: string): Ruta {
  const partes = segmentos(pathname);

  if (partes.some((parte) => !segmentoValido(parte))) {
    return { nombre: 'no-encontrada', pathname };
  }

  if (partes.length === 0) {
    return { nombre: 'proceso-nuevo' };
  }

  if (partes.length === 1 && partes[0] === 'procesos') {
    return { nombre: 'procesos' };
  }

  // Los ids se pasan tal cual (sin validar formato UUID en el cliente): el
  // backend los valida con ParseUUIDPipe y responde 400 si no lo son
  // (design.md, threat matrix "Enrutamiento (cliente)").
  if (partes[0] === 'procesos' && partes.length >= 3 && partes[2] === 'candidatos') {
    const procesoId = partes[1];

    if (partes.length === 3) {
      return { nombre: 'candidatos', procesoId };
    }
    if (partes.length === 4 && partes[3] === 'nuevo') {
      return { nombre: 'candidato-nuevo', procesoId };
    }
    if (partes.length === 4) {
      return { nombre: 'candidato-edicion', procesoId, candidatoId: partes[3] };
    }
  }

  if (partes[0] === 'procesos' && partes.length === 3 && partes[2] === 'abrir') {
    return { nombre: 'apertura', procesoId: partes[1] };
  }

  return { nombre: 'no-encontrada', pathname };
}

export function rutaAPath(ruta: Ruta): string {
  switch (ruta.nombre) {
    case 'proceso-nuevo':
      return '/';
    case 'procesos':
      return '/procesos';
    case 'candidatos':
      return `/procesos/${ruta.procesoId}/candidatos`;
    case 'candidato-nuevo':
      return `/procesos/${ruta.procesoId}/candidatos/nuevo`;
    case 'candidato-edicion':
      return `/procesos/${ruta.procesoId}/candidatos/${ruta.candidatoId}`;
    case 'apertura':
      return `/procesos/${ruta.procesoId}/abrir`;
    case 'no-encontrada':
      return ruta.pathname;
  }
}
