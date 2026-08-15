import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { createPgClient, withTransaction } from './helpers/pg-client';

/**
 * vote-casting (#14, PR4; design.md D3, "Estrategia de pruebas" -- Frontera de cierre, tareas
 * 14.1-14.3). D3 elige `now()` (= `transaction_timestamp()`) precisamente porque es CONSTANTE
 * dentro de una misma transacción: la hora que valida el cierre y la que se sellaría en el
 * comprobante nunca pueden diferir. Esto vuelve la frontera exacta `now() >= fecha_cierre_prevista`
 * reproducible al 100% sin ningún reloj inyectable -- basta con `UPDATE ... SET
 * fecha_cierre_prevista = now()` dentro de la MISMA transacción y evaluar la comparación a
 * continuación: como `now()` no cambia entre ambas sentencias, la igualdad exacta siempre se
 * cumple.
 */
describe('votos_frontera_cierre', () => {
  let client: Client;

  beforeAll(async () => {
    client = await createPgClient();
  });

  afterAll(async () => {
    await client.end();
  });

  async function crearProceso(query: Client['query']): Promise<string> {
    const procesoId = randomUUID();
    await query(
      `INSERT INTO "ProcesoElectoral"
         (id, nombre, tipo, estado, fecha_apertura_prevista, fecha_cierre_prevista,
          publico_objetivo, alcance, apertura_real)
       VALUES ($1, 'proceso-frontera-cierre', 'municipio', 'abierto', now() - interval '1 day',
               now() + interval '1 day', 'estudiantes', 'institucion', now() - interval '1 day')`,
      [procesoId],
    );
    return procesoId;
  }

  // [14.1] frontera exacta: `UPDATE ... SET fecha_cierre_prevista = now()` y luego evaluar
  // `now() >= fecha_cierre_prevista` -> TRUE (cierre cerrado por arriba, frontera inclusiva). Al
  // vivir dentro de la MISMA transacción que la sentencia D4 de `VotosService.emitir()` usaría,
  // `now()` es un único instante compartido por el UPDATE y el SELECT posterior: no hay ventana en
  // la que el resultado pueda variar entre corridas.
  it('[14.1] now() >= fecha_cierre_prevista es TRUE cuando fecha_cierre_prevista = now() (frontera exacta)', async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client));

      // `date_trunc('milliseconds', now())` en vez de `now()` crudo: la columna es
      // `Timestamptz(3)` y Postgres REDONDEA (no trunca) al guardar un valor de mayor precisión --
      // sin este truncado explícito, el redondeo puede empujar el valor almacenado por encima del
      // `now()` de microsegundos que se compara después, volviendo la frontera exacta flaky
      // (falla ~50% de las corridas según el resto de microsegundos). Truncar ANTES de escribir
      // garantiza `valor_almacenado <= now()` siempre, cumpliendo la promesa de D3 de
      // reproducibilidad al 100%.
      await client.query(
        "UPDATE \"ProcesoElectoral\" SET fecha_cierre_prevista = date_trunc('milliseconds', now()) WHERE id = $1",
        [procesoId],
      );

      const resultado = await client.query<{ cerrado_por_hora: boolean }>(
        'SELECT (now() >= fecha_cierre_prevista) AS cerrado_por_hora FROM "ProcesoElectoral" WHERE id = $1',
        [procesoId],
      );

      expect(resultado.rows[0].cerrado_por_hora).toBe(true);
    });
  });

  // [14.2] un segundo antes del cierre: `fecha_cierre_prevista = now() + interval '1 second'` ->
  // `now() >= fecha_cierre_prevista` es FALSE (aceptado). Se usa 1 segundo, no 1 microsegundo,
  // porque la columna es `Timestamptz(3)` (precisión de milisegundos) mientras `now()` conserva
  // microsegundos -- una diferencia de microsegundos podría truncarse al redondear la columna y
  // volver el caso "aceptado" indistinguible de la frontera exacta.
  it("[14.2] now() >= fecha_cierre_prevista es FALSE a cierre - 1s (fecha_cierre_prevista = now() + interval '1 second')", async () => {
    await withTransaction(client, async () => {
      const procesoId = await crearProceso(client.query.bind(client));

      await client.query(
        "UPDATE \"ProcesoElectoral\" SET fecha_cierre_prevista = now() + interval '1 second' WHERE id = $1",
        [procesoId],
      );

      const resultado = await client.query<{ cerrado_por_hora: boolean }>(
        'SELECT (now() >= fecha_cierre_prevista) AS cerrado_por_hora FROM "ProcesoElectoral" WHERE id = $1',
        [procesoId],
      );

      expect(resultado.rows[0].cerrado_por_hora).toBe(false);
    });
  });

  // Mismo criterio en la exacta sentencia D4 de `VotosService.emitir()` (`tx.$queryRaw` con
  // `(now() >= p.fecha_cierre_prevista) AS cerrado_por_hora`) -- se verifica textualmente contra la
  // misma forma, no solo una comparación equivalente, para que un cambio accidental de columna en
  // el servicio real quede cubierto por esta prueba de schema.
  it('[14.1/14.2] la misma comparación, calculada como en la sentencia D4 real (p.fecha_cierre_prevista), sigue la frontera inclusiva', async () => {
    await withTransaction(client, async () => {
      const usuarioId = randomUUID();
      await client.query(
        `INSERT INTO "Usuario" (id, nombres, dni, codigo, correo, rol, estado)
         VALUES ($1, 'Votante Frontera', $2, $3, $4, 'estudiante', 'activo')`,
        [usuarioId, `dni-frontera-${usuarioId}`, `codigo-frontera-${usuarioId}`, `frontera-${usuarioId}@seei.local`],
      );
      const procesoId = await crearProceso(client.query.bind(client));
      const derechoVotoId = randomUUID();
      await client.query(
        `INSERT INTO "DerechoVoto" (id, proceso_id, usuario_id, en_calidad_de, aula_snapshot)
         VALUES ($1, $2, $3, 'estudiante', $4)`,
        [derechoVotoId, procesoId, usuarioId, randomUUID()],
      );

      await client.query(
        "UPDATE \"ProcesoElectoral\" SET fecha_cierre_prevista = date_trunc('milliseconds', now()) WHERE id = $1",
        [procesoId],
      );

      const resultado = await client.query<{ cerrado_por_hora: boolean }>(
        `SELECT (now() >= p.fecha_cierre_prevista) AS cerrado_por_hora
           FROM "DerechoVoto" dv
           JOIN "ProcesoElectoral" p ON p.id = dv.proceso_id
          WHERE dv.id = $1
            FOR UPDATE OF dv`,
        [derechoVotoId],
      );

      expect(resultado.rows[0].cerrado_por_hora).toBe(true);
    });
  });
});
