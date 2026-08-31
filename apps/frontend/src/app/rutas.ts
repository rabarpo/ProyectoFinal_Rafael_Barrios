/**
 * Enrutador hand-rolled (design.md D10, spec: minimal-frontend-router): unión
 * discriminada + parser total. `parsearRuta` NUNCA lanza — cualquier
 * `pathname` no reconocido, con segmentos `.`/`..`, o de forma inesperada
 * cae en la variante `no-encontrada` (threat matrix "Enrutamiento (cliente)":
 * `/../../etc/passwd`, ruta inexistente). `rutaAPath` es la inversa exacta
 * para las variantes navegables. `academica` (administracion-academica, PR1;
 * design.md D1) es una ruta plana sin sub-rutas: la pestaña activa vive en
 * estado de componente, nunca en la URL. `usuarios` y `cuentas-bloqueadas`
 * (administracion-usuarios-apoderados, PR1, #27; design.md D1) son también planas y sin
 * parámetros: el usuario abierto vive en estado de componente (`UsuariosPage`), nunca en la
 * URL, y `cuentas-bloqueadas` cuelga de la RAÍZ (no anidada bajo `usuarios`) porque sus roles
 * (`comite` vs. `administrador`/`director`) son disjuntos. `configuracion`
 * (frontend-configuracion-general, PR1, #28; design.md D1) es también plana y singleton: el
 * recurso es una sola fila (`clave='institucional'`), así que `/configuracion/...` cae siempre en
 * 'no-encontrada'.
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
  | { nombre: 'usuarios' }
  | { nombre: 'cuentas-bloqueadas' }
  | { nombre: 'configuracion' }
  | { nombre: 'panel-jornada' }
  | { nombre: 'proyeccion'; procesoId: string }
  | { nombre: 'mis-votaciones' }
  | { nombre: 'importacion-excel' }
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

  // administracion-usuarios-apoderados, PR1 (#27; design.md D1, tasks.md 1.1-1.2): dos rutas
  // planas sin parámetros, sin `usuarioId` embebido — la selección vive en estado de componente
  // (`UsuariosPage`), nunca en la URL. `cuentas-bloqueadas` cuelga de la RAÍZ, no anidada bajo
  // `usuarios`, porque sus roles (`comite` vs. `administrador`/`director`) son disjuntos.
  if (partes.length === 1 && partes[0] === 'usuarios') {
    return { nombre: 'usuarios' };
  }

  if (partes.length === 1 && partes[0] === 'cuentas-bloqueadas') {
    return { nombre: 'cuentas-bloqueadas' };
  }

  // frontend-configuracion-general, PR1 (#28; design.md D1, tasks.md 1.3): ruta plana singleton,
  // sin sub-rutas ni estado de navegación interna por pestañas — `/configuracion/logo` y
  // `/configuracion/comite` NO son variantes separadas, caen en 'no-encontrada'.
  if (partes.length === 1 && partes[0] === 'configuracion') {
    return { nombre: 'configuracion' };
  }

  // dashboard-panel-jornada, PR2 (Backlog #20; design.md D2/D10, tasks.md 9.1): `panel-jornada`
  // es plana (sin procesoId embebido: la selección de proceso vive en estado de componente).
  // `proyeccion` SÍ lleva `procesoId` en la URL porque la pantalla de kiosco debe sobrevivir a
  // un recargo (D10). `/proyeccion` sin id y `/panel-jornada/algo` caen en 'no-encontrada'.
  if (partes.length === 1 && partes[0] === 'panel-jornada') {
    return { nombre: 'panel-jornada' };
  }

  if (partes[0] === 'proyeccion' && partes.length === 2) {
    return { nombre: 'proyeccion', procesoId: partes[1] };
  }

  // descubrimiento-derechos-voto, PR2 (#30; design.md D7, tasks.md 5.2): ruta plana
  // `/mis-votaciones`, mismo criterio que `/academica`/`/usuarios` — sin `derechoVotoId`
  // embebido, el listado se resuelve dentro de `MisVotacionesPage`. Cualquier
  // `/mis-votaciones/...` cae en 'no-encontrada'.
  if (partes.length === 1 && partes[0] === 'mis-votaciones') {
    return { nombre: 'mis-votaciones' };
  }

  // frontend-importacion-excel, PR1 (#29; design.md D1, tasks.md 1.2; spec: minimal-frontend-router,
  // "Variante `Ruta 'importacion-excel'` plana"): ruta plana sin parámetros, mismo criterio que
  // `/academica`/`/usuarios`/`/configuracion` — la pantalla es un contenedor único sin sub-rutas
  // ni pestañas en la URL, y el `ResultadoImportacionDto` sólo viaja en la respuesta del `POST`
  // (no hay resultado recuperable por deep-link). Cualquier `/importacion-excel/...` cae en
  // 'no-encontrada'.
  if (partes.length === 1 && partes[0] === 'importacion-excel') {
    return { nombre: 'importacion-excel' };
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
    case 'usuarios':
      return '/usuarios';
    case 'cuentas-bloqueadas':
      return '/cuentas-bloqueadas';
    case 'configuracion':
      return '/configuracion';
    case 'panel-jornada':
      return '/panel-jornada';
    case 'proyeccion':
      return `/proyeccion/${ruta.procesoId}`;
    case 'mis-votaciones':
      return '/mis-votaciones';
    case 'importacion-excel':
      return '/importacion-excel';
    case 'no-encontrada':
      return ruta.pathname;
  }
}
