import { ProcesoRespuestaDto } from './proceso-respuesta.dto';

// administracion-procesos-electorales, PR7 (design.md "Contratos HTTP"/spec "Listado de procesos
// en borrador", tarea 19.1). `GET /procesos/:id` reusa la forma de `ProcesoRespuestaDto` heredando
// todos sus campos sin cambios: `publico_objetivo`, el snapshot de nivel/grado y `aulas` (los
// `ProcesoAula` asociados, como ids de `Aula`) ya están ahí. Se declara como clase propia —sin
// campos nuevos— porque el contrato distingue explícitamente el detalle del listado (D3 de
// design.md, "Contratos HTTP"), aunque hoy la forma coincida.
export class ProcesoDetalleRespuestaDto extends ProcesoRespuestaDto {}
