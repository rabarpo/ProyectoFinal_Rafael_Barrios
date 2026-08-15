import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';
import { createPgClient } from '../schema/helpers/pg-client';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-votos-concurrencia';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * vote-casting (#14, PR4; design.md D4/D5, "Estrategia de pruebas", tareas 13.1-13.5, 14.4).
 * Arnés de concurrencia REAL, explícitamente distinto del `Promise.all` de `procesos-abrir.e2e-
 * spec.ts` [13.1] (#13): `Promise.all` no garantiza una interleaving real de dos transacciones de
 * Postgres -- el pool de conexiones y el bucle de eventos de Node pueden serializar el trabajo sin
 * que la carrera real ocurra (proposal.md, "Enfoque de pruebas"). Los casos (a) y (b) de abajo usan
 * conexiones `pg` crudas coordinadas manualmente por pasos -- BEGIN, sentencia, sincronización
 * explícita con un `setTimeout`, COMMIT -- para forzar el bloqueo real del índice único y el 23505
 * genuino que Postgres emite, en vez de confiar en que el bucle de eventos intercale las peticiones
 * de la forma correcta. El caso (c) es la red de seguridad probabilística que la propuesta pide
 * como complemento, nunca como reemplazo.
 */
describe('POST /votos e2e -- concurrencia determinista y frontera de cierre [D3-D5, PR4]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-votos-concurrencia-e2e-2026';
  let passwordHash: string;
  let sufijoBase: number;
  let contador = 0;

  function extraerCookie(respuesta: Response): string | null {
    const setCookie = respuesta.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? `${COOKIE_NAME}=${match[1]}` : null;
  }

  async function postLogin(codigo: string, password: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, password }),
    });
  }

  function headersCon(cookie: string | null): Record<string, string> {
    return { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) };
  }

  async function postCrear(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function postAbrir(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/procesos/${id}/abrir`, {
      method: 'POST',
      headers: headersCon(cookie),
      body: JSON.stringify({ confirmar: true }),
    });
  }

  async function postVotos(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/votos`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getPapeleta(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/votos/papeleta/${id}`, { headers: headersCon(cookie) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Votos Concurrencia E2E ${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-votos-concurrencia-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `votos-concurrencia-${sufijo}@e2e.local`,
        nombres: `Usuario E2E ${sufijo}`,
        rol: overrides.rol ?? 'administrador',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    return { usuario, codigo };
  }

  async function loginYObtenerCookie(codigo: string): Promise<string> {
    const respuesta = await postLogin(codigo, PASSWORD_CORRECTA);
    expect(respuesta.status).toBe(200);
    return extraerCookie(respuesta) as string;
  }

  async function crearAnioEscolarActivo() {
    return prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: true } });
  }

  async function crearArbolConAula(anioEscolarId: string) {
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const grado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });
    const seccion = await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolarId },
    });
    const aula = await prisma.aula.create({
      data: { turno: 'manana', grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolarId },
    });
    return { aula };
  }

  async function crearVotante(aulaId: string, anioEscolarId: string) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-votos-concurrencia-est-${sufijo}`;
    const estudiante = await prisma.usuario.create({
      data: {
        codigo,
        dni: `est-${sufijo}`,
        correo: `est-${sufijo}@e2e.local`,
        nombres: `Estudiante E2E ${sufijo}`,
        rol: 'estudiante',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    await prisma.matricula.create({ data: { usuario_id: estudiante.id, aula_id: aulaId, anio_escolar_id: anioEscolarId } });
    const cookie = await loginYObtenerCookie(codigo);
    return { estudiante, codigo, cookie };
  }

  function dtoProceso(overrides: Record<string, unknown> = {}) {
    return {
      nombre: nombreUnico(),
      tipo: 'municipio',
      fecha_apertura_prevista: '2026-09-01T09:00:00.000Z',
      fecha_cierre_prevista: '2026-09-05T18:00:00.000Z',
      publico_objetivo: 'estudiantes',
      alcance: 'aulas',
      ...overrides,
    };
  }

  // Materializa un proceso abierto + un DerechoVoto real (vía #13) + una Lista activa, listo para
  // `POST /votos` o para que un `pg` crudo simule directamente la sentencia D4.
  async function crearEscenario(cookieAdmin: string, anioEscolarId: string) {
    const { aula } = await crearArbolConAula(anioEscolarId);
    const votante = await crearVotante(aula.id, anioEscolarId);

    const respuestaCrear = await postCrear(dtoProceso({ aula_ids: [aula.id] }), cookieAdmin);
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoId } = await respuestaCrear.json();

    const respuestaAbrir = await postAbrir(procesoId, cookieAdmin);
    expect(respuestaAbrir.status).toBe(200);

    const lista = await prisma.lista.create({
      data: { proceso_id: procesoId, nombre: nombreUnico(), numero: 1, estado: 'activo' },
    });

    const derecho = await prisma.derechoVoto.findFirstOrThrow({
      where: { proceso_id: procesoId, usuario_id: votante.estudiante.id, en_calidad_de: 'estudiante' },
    });

    return { procesoId, votante, lista, derecho };
  }

  function claveIdempotencia(): string {
    contador += 1;
    return `clave-${sufijoBase}-${contador}`;
  }

  async function crearAdminYProceso() {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    return crearEscenario(cookieAdmin, anioEscolar.id);
  }

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID;
    process.env.GOOGLE_HOSTED_DOMAINS = GOOGLE_HOSTED_DOMAINS;

    passwordHash = await hash(PASSWORD_CORRECTA, ARGON2_OPTIONS);
    sufijoBase = Date.now();

    const stubClient = {
      verifyIdToken: async () => {
        throw new Error('no usado en esta suite');
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_OAUTH_CLIENT)
      .useValue(stubClient)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0);

    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;
  }, 30_000);

  afterAll(async () => {
    await app.close();
    await redis.quit();
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.anioEscolar.updateMany({ data: { activo: false } });
  });

  // [13.1] (a) -- LA PRUEBA FUERTE (design.md, "Estrategia de pruebas"): un `pg` crudo abre su
  // propia transacción, hace BEGIN + INSERT "Voto" para el MISMO derecho SIN COMMIT -- el índice
  // único queda con una entrada pendiente, sin liberar. Mientras esa transacción sigue abierta, se
  // dispara el `POST /votos` REAL: su `SELECT ... FOR UPDATE OF dv` no bloquea (el crudo nunca tocó
  // `DerechoVoto`), su snapshot no ve el `Voto` no comiteado (MVCC), así que decide seguir e
  // intenta su propio `INSERT "Voto"` -- que SÍ bloquea, porque Postgres debe esperar a que la
  // transacción en conflicto sobre el índice único termine antes de poder decidir si hay colisión.
  // Solo entonces se commitea el crudo: el `INSERT` real, ya bloqueado, recibe un 23505 GENUINO (no
  // simulado), el servicio lo captura (D5) y responde 200 con el comprobante del voto que ganó la
  // carrera -- el del crudo. Esto ejercita el `catch` real de `VotosService.emitir()`, no una
  // simulación en SQL.
  it(
    '[13.1] INSERT crudo sin commit bloquea el INSERT real; al commitear, el endpoint recibe un 23505 ' +
      'genuino, lo captura (D5) y responde 200 con el comprobante del crudo',
    async () => {
      const { procesoId, votante, lista, derecho } = await crearAdminYProceso();

      const rawClient = await createPgClient();
      await rawClient.query('BEGIN');

      const votoCrudoId = randomUUID();
      const codigoComprobanteCrudo = `crudo-comprobante-${derecho.id}`;
      const claveCrudo = `crudo-clave-${derecho.id}`;
      await rawClient.query(
        `INSERT INTO "Voto"
           (id, proceso_id, derecho_voto_id, lista_id, blanco, codigo_comprobante, clave_idempotencia)
         VALUES ($1, $2, $3, $4, false, $5, $6)`,
        [votoCrudoId, procesoId, derecho.id, lista.id, codigoComprobanteCrudo, claveCrudo],
      );
      // Deliberadamente SIN COMMIT todavía: el índice único queda con una entrada pendiente.

      const respuestaPromise = postVotos(
        { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
        votante.cookie,
      );

      // Margen para que el INSERT real llegue al motor y quede bloqueado en el índice único antes
      // de commitear el crudo -- sin este margen la carrera podría no alcanzar a plantearse.
      await esperar(400);

      await rawClient.query('COMMIT');
      await rawClient.end();

      const respuesta = await respuestaPromise;
      expect(respuesta.status).toBe(200);
      const cuerpo = await respuesta.json();
      expect(cuerpo.codigo_comprobante).toBe(codigoComprobanteCrudo);

      const votos = await prisma.voto.findMany({ where: { derecho_voto_id: derecho.id } });
      expect(votos).toHaveLength(1);
      expect(votos[0].id).toBe(votoCrudoId);
    },
    15_000,
  );

  // [13.2] (b) -- dos conexiones `pg` crudas, coordinadas manualmente por pasos, reproducen
  // directamente la sentencia D4 (`FOR UPDATE OF dv`): ambas intentan bloquear el mismo `DerechoVoto`
  // -- la segunda se bloquea de verdad (se verifica con una bandera antes de liberar la primera),
  // solo avanza cuando la primera libera el lock al COMMIT/ROLLBACK, y su propio `INSERT` recibe un
  // 23505 real sobre `Voto_proceso_id_derecho_voto_id_key`.
  it(
    '[13.2] dos conexiones pg coordinadas: la segunda SELECT ... FOR UPDATE OF dv bloquea hasta que la ' +
      'primera libera; ambos INSERT dejan exactamente una fila y un 23505 real en la segunda',
    async () => {
      const { procesoId, lista, derecho } = await crearAdminYProceso();

      const clientA = await createPgClient();
      const clientB = await createPgClient();

      await clientA.query('BEGIN');
      await clientB.query('BEGIN');

      await clientA.query('SELECT dv.id FROM "DerechoVoto" dv WHERE dv.id = $1 FOR UPDATE OF dv', [derecho.id]);

      let clienteBDesbloqueado = false;
      const selectBPromise = clientB
        .query('SELECT dv.id FROM "DerechoVoto" dv WHERE dv.id = $1 FOR UPDATE OF dv', [derecho.id])
        .then((r) => {
          clienteBDesbloqueado = true;
          return r;
        });

      await esperar(400);
      // Verificación determinista de que el bloqueo es real, no una carrera afortunada: B sigue sin
      // resolver mientras A no libera su lock.
      expect(clienteBDesbloqueado).toBe(false);

      const votoAId = randomUUID();
      await clientA.query(
        `INSERT INTO "Voto"
           (id, proceso_id, derecho_voto_id, lista_id, blanco, codigo_comprobante, clave_idempotencia)
         VALUES ($1, $2, $3, $4, false, $5, $6)`,
        [votoAId, procesoId, derecho.id, lista.id, `A-comprobante-${derecho.id}`, `A-clave-${derecho.id}`],
      );
      await clientA.query('COMMIT');

      await selectBPromise;
      expect(clienteBDesbloqueado).toBe(true);

      let errorB: { code?: string; constraint?: string } | undefined;
      try {
        await clientB.query(
          `INSERT INTO "Voto"
             (id, proceso_id, derecho_voto_id, lista_id, blanco, codigo_comprobante, clave_idempotencia)
           VALUES ($1, $2, $3, $4, false, $5, $6)`,
          [randomUUID(), procesoId, derecho.id, lista.id, `B-comprobante-${derecho.id}`, `B-clave-${derecho.id}`],
        );
      } catch (e) {
        errorB = e as { code?: string; constraint?: string };
      }

      expect(errorB).toBeDefined();
      expect(errorB?.code).toBe('23505');
      expect(errorB?.constraint).toBe('Voto_proceso_id_derecho_voto_id_key');

      await clientB.query('ROLLBACK');
      await clientA.end();
      await clientB.end();

      const votos = await prisma.voto.findMany({ where: { derecho_voto_id: derecho.id } });
      expect(votos).toHaveLength(1);
      expect(votos[0].id).toBe(votoAId);
    },
    15_000,
  );

  // [13.3] (c) -- red de seguridad probabilística que la propuesta exige como complemento, nunca
  // como reemplazo de (a)/(b): 8 peticiones reales concurrentes con `Promise.all` sobre el mismo
  // derecho, cada una con su propia clave de idempotencia.
  it('[13.3][red de seguridad] 8 POST /votos concurrentes sobre el mismo derecho: exactamente 1 fila, 0 respuestas 5xx', async () => {
    const { votante, lista, derecho } = await crearAdminYProceso();

    const respuestas = await Promise.all(
      Array.from({ length: 8 }, () =>
        postVotos(
          { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
          votante.cookie,
        ),
      ),
    );

    expect(respuestas.some((r) => r.status >= 500)).toBe(false);
    expect(respuestas.every((r) => r.status === 200 || r.status === 201)).toBe(true);

    const votos = await prisma.voto.findMany({ where: { derecho_voto_id: derecho.id } });
    expect(votos).toHaveLength(1);
  });

  // [14.4] design.md D3/D4, threat matrix TOCTOU/concurrencia: el proceso cierra en la ventana entre
  // la lectura de la papeleta (paso 1, D13 -- lectura pura, no valida) y la confirmación del paso 3.
  // La única fuente de verdad es la transacción de `emitir()`, nunca lo que la papeleta devolvió.
  it('[14.4] proceso que cierra entre la lectura de la papeleta y la confirmación del paso 3 rechaza con VOTACION_CERRADA', async () => {
    const { procesoId, votante, lista, derecho } = await crearAdminYProceso();

    const papeletaAntes = await getPapeleta(derecho.id, votante.cookie);
    expect(papeletaAntes.status).toBe(200);

    await prisma.procesoElectoral.update({
      where: { id: procesoId },
      data: { fecha_cierre_prevista: new Date(Date.now() - 60_000) },
    });

    const respuesta = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );

    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'VOTACION_CERRADA' });
    expect(await prisma.voto.count({ where: { derecho_voto_id: derecho.id } })).toBe(0);
  });
});
