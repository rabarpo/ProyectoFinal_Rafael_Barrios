import { describe, expect, it } from 'vitest';
import { MENU_POR_ROL } from './menu-por-rol';
import type { RolSesion } from './menu-por-rol';
import { parsearRuta, rutaAPath } from './rutas';

// [design.md D2/D3/D8; spec: menu-navegacion-post-login] `MENU_POR_ROL` es la ÚNICA fuente para
// `NavegacionPrincipal` e `InicioPage` — espeja los `@Roles` reales verificados en el backend
// (design.md, tabla D3). Se prueba como dato (sin render): exhaustivo por rol, no depende de
// jsdom y no se rompe al retocar un `className`.
describe('MENU_POR_ROL', () => {
  const idsPorRol: Record<RolSesion, string[]> = {
    administrador: ['procesos', 'proceso-nuevo', 'academica', 'usuarios', 'configuracion', 'importacion-excel'],
    director: ['procesos', 'proceso-nuevo', 'academica', 'usuarios', 'configuracion', 'importacion-excel'],
    comite: ['procesos', 'proceso-nuevo', 'academica'],
    docente: [],
    estudiante: [],
  };

  it.each(Object.keys(idsPorRol) as RolSesion[])('[4.1] el rol %s expone exactamente su conjunto de ids', (rol) => {
    const idsEsperados = idsPorRol[rol];
    const idsReales = MENU_POR_ROL[rol].map((item) => item.id);

    expect(new Set(idsReales)).toEqual(new Set(idsEsperados));
    expect(idsReales).toHaveLength(idsEsperados.length);
  });

  // administracion-academica, PR1 (#26; design.md D12, tasks.md 2.1). `académica` deja de ser
  // placeholder para administrador/director/comité: pasa a item navegable con `Ruta 'academica'`.
  it('[2.1] académica es navegable para administrador, director y comité', () => {
    for (const rol of ['administrador', 'director', 'comite'] as RolSesion[]) {
      const item = MENU_POR_ROL[rol].find((i) => i.id === 'academica');
      expect(item).toEqual({ clase: 'navegable', id: 'academica', etiqueta: 'Académica', ruta: { nombre: 'academica' } });
    }
  });

  it('[2.1] docente y estudiante no tienen item académica', () => {
    expect(MENU_POR_ROL.docente).toEqual([]);
    expect(MENU_POR_ROL.estudiante).toEqual([]);
  });

  it('[4.2] ningún item "proximamente" expone una ruta', () => {
    for (const items of Object.values(MENU_POR_ROL)) {
      for (const item of items) {
        if (item.clase === 'proximamente') {
          expect((item as { ruta?: unknown }).ruta).toBeUndefined();
        }
      }
    }
  });

  it('[4.3] toda ruta de item navegable hace round-trip con parsearRuta/rutaAPath', () => {
    for (const items of Object.values(MENU_POR_ROL)) {
      for (const item of items) {
        if (item.clase === 'navegable') {
          expect(parsearRuta(rutaAPath(item.ruta))).toEqual(item.ruta);
        }
      }
    }
  });
});
