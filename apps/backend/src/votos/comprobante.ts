// vote-casting, PR1 (design.md D12, tarea 2.3). Derivación determinista del código de
// comprobante a partir de `Voto.id` (UUID, ya globalmente único): si el `id` es único, el código
// lo es — sin segunda fuente de aleatoriedad ni verificación de unicidad dentro de la transacción
// crítica de PR2. Se toman los primeros 80 bits del UUID (20 caracteres hex, sin guiones) y se
// codifican en Crockford Base32 (alfabeto de 32 símbolos que excluye deliberadamente I/L/O/U, para
// que el comprobante se pueda dictar por teléfono sin ambigüedad 0/O, 1/I/L — ADR-0013). 80 bits /
// 5 bits por símbolo = exactamente 16 caracteres, sin relleno, agrupados de a 4 con guiones.
const ALFABETO_CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BITS_TOTALES = 80;
const BITS_POR_SIMBOLO = 5;
const SIMBOLOS = BITS_TOTALES / BITS_POR_SIMBOLO; // 16

export function derivarComprobante(votoId: string): string {
  const hex80Bits = votoId.replace(/-/g, '').slice(0, BITS_TOTALES / 4);
  let valor = BigInt(`0x${hex80Bits}`);

  const simbolos: string[] = [];
  for (let i = 0; i < SIMBOLOS; i++) {
    const indice = Number(valor & 0x1fn);
    simbolos.unshift(ALFABETO_CROCKFORD[indice]);
    valor >>= BigInt(BITS_POR_SIMBOLO);
  }

  const codigo = simbolos.join('');
  return codigo.match(/.{4}/g)!.join('-');
}
