/**
 * Enrutador hand-rolled (design.md D10, spec: minimal-frontend-router): unión
 * discriminada + parser total. `parsearRuta` NUNCA lanza — cualquier
 * `pathname` no reconocido, con segmentos `.`/`..`, o de forma inesperada
 * cae en la variante `no-encontrada` (threat matrix "Enrutamiento (cliente)":
 * `/../../etc/passwd`, ruta inexistente). `rutaAPath` es la inversa exacta
 * para las variantes navegables. `academica` (administracion-academica, PR1;
 * design.md D1) es una ruta plana sin sub-rutas: la pestaña activa vive en
 * estado de componente, nunca en la URL.
 */
export type Ruta =
  | { nombre: 'inicio' }
  | { nombre: 'proceso-nuevo' }
  | { nombre: 'procesos' }
  | { nombre: 'candidatos'; procesoId: string }
  | { nombre: 'candidato-nuevo'; procesoId: string }
  | { nombre: 'candidato-edicion'; procesoId: string; candidatoId: string }
  | { nombre: 'apertura'; procesoId: string }
  | { nombre: 'votacion'; derechoVotoId: string }
  | { nombre: 'comprobante'; votoId: string }
  | { nombre: 'resultados'; procesoId: string }
  | { nombre: 'academica' }
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
    return { nombre: 'inicio' };
  }

  if (partes.length === 1 && partes[0] === 'procesos') {
    return { nombre: 'procesos' };
  }

  // menu-navegacion-post-login (#25; design.md D1): agrupa la creación bajo su recurso, igual
  // que `/procesos/:id/abrir` — `/procesos/nuevo` NO colisiona con el bloque de candidatos
  // (exige `length >= 3`) ni con `apertura` (exige `length === 3`).
  if (partes[0] === 'procesos' && partes.length === 2 && partes[1] === 'nuevo') {
    return { nombre: 'proceso-nuevo' };
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

  // vote-casting, PR5 (design.md D14, tasks.md 16.1): ruta plana `/votar/:derechoVotoId`, fuera de
  // `/procesos` — el votante no gestiona procesos, ejerce un derecho propio.
  if (partes[0] === 'votar' && partes.length === 2) {
    return { nombre: 'votacion', derechoVotoId: partes[1] };
  }

  // outbox-correo-comprobante-autenticado, PR4 (design.md D12, tasks.md 13.2): ruta plana
  // `/comprobante/:votoId`, mismo criterio que `/votar/:derechoVotoId` (#14 D14) — el votante no
  // gestiona, ejerce/relee. `/comprobante` sin id cae en 'no-encontrada' (sin listado agregado).
  if (partes[0] === 'comprobante' && partes.length === 2) {
    return { nombre: 'comprobante', votoId: partes[1] };
  }

  // resultados-en-vivo, PR2 (#16; design.md D11, tasks.md 10.1-10.2): ruta plana
  // `/resultados/:procesoId`, mismo criterio que `/votar/:derechoVotoId` (#14 D14) y
  // `/comprobante/:votoId` (#15 D12) — el votante no gestiona el proceso, consulta un dato propio.
  // `/resultados` sin id cae en 'no-encontrada' (sin listado agregado en este change).
  if (partes[0] === 'resultados' && partes.length === 2) {
    return { nombre: 'resultados', procesoId: partes[1] };
  }

  // administracion-academica, PR1 (design.md D1, tasks.md 1.1): ruta plana `/academica`, sin
  // rutas anidadas — la pestaña activa vive en estado de componente (`AcademicaPage`), nunca en
  // la URL. Cualquier `/academica/...` cae en 'no-encontrada'.
  if (partes.length === 1 && partes[0] === 'academica') {
    return { nombre: 'academica' };
  }

  return { nombre: 'no-encontrada', pathname };
}

export function rutaAPath(ruta: Ruta): string {
  switch (ruta.nombre) {
    case 'inicio':
      return '/';
    case 'proceso-nuevo':
      return '/procesos/nuevo';
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
    case 'votacion':
      return `/votar/${ruta.derechoVotoId}`;
    case 'comprobante':
      return `/comprobante/${ruta.votoId}`;
    case 'resultados':
      return `/resultados/${ruta.procesoId}`;
    case 'academica':
      return '/academica';
    case 'no-encontrada':
      return ruta.pathname;
  }
}
