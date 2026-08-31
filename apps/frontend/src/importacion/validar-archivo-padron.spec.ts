import { describe, expect, it } from 'vitest';
import { validarArchivoPadron } from './validar-archivo-padron';

// [tasks.md 2.1] Matriz extensión × tamaño (design.md D6, threat matrix "Clasificación de
// archivo activo"). Espeja `filtroArchivoPadron` del backend: extensión REAL `/\.(xlsx|csv)$/i`
// y `0 < size <= 5 MB`. SIN pareo de MIME — el MIME de `.xlsx` que reporta el navegador varía
// por plataforma y el backend sólo mira `originalname`.
const MB = 1024 * 1024;
const TOPE = 5 * MB;

function conTamano(name: string, size: number, type = ''): File {
  const f = new File([], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('importacion/validar-archivo-padron', () => {
  it('acepta un .xlsx dentro del tope (devuelve null)', () => {
    expect(validarArchivoPadron(conTamano('padron.xlsx', 1024))).toBeNull();
  });

  it('acepta un .csv dentro del tope (devuelve null)', () => {
    expect(validarArchivoPadron(conTamano('padron.csv', 1024))).toBeNull();
  });

  it('acepta .XLSX en mayúsculas (regex case-insensitive)', () => {
    expect(validarArchivoPadron(conTamano('PADRON.XLSX', 1024))).toBeNull();
  });

  it('ignora el MIME: .xlsx con type vacío se acepta', () => {
    expect(validarArchivoPadron(conTamano('padron.xlsx', 1024, ''))).toBeNull();
  });

  it('ignora el MIME: .xlsx con type application/octet-stream se acepta', () => {
    expect(
      validarArchivoPadron(conTamano('padron.xlsx', 1024, 'application/octet-stream')),
    ).toBeNull();
  });

  it.each(['padron.xlsm', 'padron.xls', 'padron.pdf', 'padron', 'padron.xlsx.xlsm'])(
    'rechaza la extensión no permitida: %s',
    (name) => {
      const mensaje = validarArchivoPadron(conTamano(name, 1024));
      expect(mensaje).toBeTruthy();
      expect(mensaje).toMatch(/xlsx|csv|formato/i);
    },
  );

  it('rechaza un archivo de 0 bytes', () => {
    expect(validarArchivoPadron(conTamano('padron.xlsx', 0))).toBeTruthy();
  });

  it('acepta exactamente 5 MB (límite inclusivo)', () => {
    expect(validarArchivoPadron(conTamano('padron.xlsx', TOPE))).toBeNull();
  });

  it('rechaza 5 MB + 1 byte', () => {
    const mensaje = validarArchivoPadron(conTamano('padron.xlsx', TOPE + 1));
    expect(mensaje).toBeTruthy();
    expect(mensaje).toMatch(/5 MB|tama/i);
  });

  it('la extensión se evalúa antes que el tamaño: .xlsm de 6 MB da mensaje de formato', () => {
    const mensaje = validarArchivoPadron(conTamano('padron.xlsm', 6 * MB));
    expect(mensaje).toMatch(/xlsx|csv|formato/i);
  });
});
