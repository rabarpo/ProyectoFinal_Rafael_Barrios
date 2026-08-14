import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-opciones';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.pe';

/**
 * candidatos-listas-opciones-consulta, PR3 (design.md D5/D7/D9, tareas 8.2-8.6, 9.1). Corre contra
 * Postgres+Redis reales, mismo criterio que `test/candidatos/listas.e2e-spec.ts`. `OpcionConsulta`
 * no tiene `estado`/`baja_en` en el schema (design.md "Contratos HTTP") — sin baja lógica, solo
 * CRUD con borrado guardado por `Voto`.
 */
describe('Opciones e2e — CRUD y borrado guardado sin baja lógica [D5/D7/D9]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-opciones-e2e-2026';
  let passwordHash: string;
  let sufijoBase: number;
  let contador = 0;

  function extraerCookie(respuesta: Response): string | null {
    const setCookie = respuesta.headers.get('set-cookie');
    if (!setCookie) return null;
    const match = setCookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
    return match ? `${COOKIE_NAME}=${match[1]}` : null;
  }

  async function contarEventos(entityId: string | null, eventType: string): Promise<number> {
    return prisma.eventoAuditoria.count({ where: { entity_id: entityId, event_type: eventType } });
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

  async function postOpcion(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/opciones`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getOpciones(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/opciones${query}`, { headers: headersCon(cookie) });
  }

  async function deleteOpcion(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/opciones/${id}`, { method: 'DELETE', headers: headersCon(cookie) });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-opciones-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-opc-${sufijo}`,
        correo: `opciones-${sufijo}@e2e.local`,
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

  function nombreUnico(): string {
    contador += 1;
    return `Proceso Opciones E2E ${sufijoBase}-${contador}`;
  }

  async function crearProceso() {
    return prisma.procesoElectoral.create({
      data: {
        nombre: nombreUnico(),
        tipo: 'consulta',
        estado: 'abierto',
        fecha_apertura_prevista: new Date(),
        fecha_cierre_prevista: new Date(Date.now() + 86_400_000),
        publico_objetivo: 'estudiantes',
        alcance: 'institucion',
      },
    });
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

  // 8.2: POST /opciones con etiqueta="Sí" se acepta sin restricción A/B/C.
  it('[8.2] etiqueta personalizada "Sí" se acepta sin restricción A/B/C', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const respuesta = await postOpcion({ proceso_id: proceso.id, etiqueta: 'Sí' }, cookie);
    expect(respuesta.status).toBe(201);
    const cuerpo = (await respuesta.json()) as { etiqueta: string };
    expect(cuerpo.etiqueta).toBe('Sí');
  });

  // 8.3: etiqueta repetida en el mismo proceso_id -> 409 RESTRICCION_UNICA.
  it('[8.3] etiqueta repetida en el mismo proceso responde 409 RESTRICCION_UNICA', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const primera = await postOpcion({ proceso_id: proceso.id, etiqueta: 'A' }, cookie);
    expect(primera.status).toBe(201);

    const segunda = await postOpcion({ proceso_id: proceso.id, etiqueta: 'A' }, cookie);
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toMatchObject({ codigo: 'RESTRICCION_UNICA' });
  });

  // 8.4: proceso_id inexistente -> 409 REFERENCIA_INEXISTENTE.
  it('[8.4] proceso_id inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la opción', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postOpcion(
      { proceso_id: '00000000-0000-0000-0000-000000000000', etiqueta: 'B' },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
  });

  // 8.5: DELETE /opciones/:id con Voto dependiente -> 409 ENTIDAD_CON_DEPENDIENTES.
  it('[8.5] DELETE con Voto dependiente responde 409 ENTIDAD_CON_DEPENDIENTES {relacion:Voto}', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const opcion = await prisma.opcionConsulta.create({
      data: { proceso_id: proceso.id, etiqueta: 'C' },
    });
    const votante = await prisma.usuario.create({
      data: {
        codigo: `e2e-opciones-votante-${sufijoBase}-${++contador}`,
        dni: `usr-vot-${sufijoBase}-${contador}`,
        correo: `votante-${sufijoBase}-${contador}@e2e.local`,
        nombres: 'Votante E2E',
        rol: 'estudiante',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    const derechoVoto = await prisma.derechoVoto.create({
      data: {
        proceso_id: proceso.id,
        usuario_id: votante.id,
        en_calidad_de: 'estudiante',
        aula_snapshot: 'snapshot-opciones-e2e',
      },
    });
    await prisma.voto.create({
      data: {
        proceso_id: proceso.id,
        derecho_voto_id: derechoVoto.id,
        opcion_id: opcion.id,
        codigo_comprobante: `comprobante-opciones-${derechoVoto.id}`,
        clave_idempotencia: `idem-opciones-${derechoVoto.id}`,
      },
    });

    const respuesta = await deleteOpcion(opcion.id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Voto' });
    expect(await prisma.opcionConsulta.findUnique({ where: { id: opcion.id } })).not.toBeNull();
  });

  // 8.6: exactamente una fila OPCION_CONSULTA_CREADA/_ACTUALIZADA/_ELIMINADA por operación exitosa.
  it('[8.6] auditoría: exactamente una fila OPCION_CONSULTA_CREADA/_ACTUALIZADA/_ELIMINADA por operación', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const creacion = await postOpcion({ proceso_id: proceso.id, etiqueta: 'D' }, cookie);
    expect(creacion.status).toBe(201);
    const { id } = (await creacion.json()) as { id: string };
    expect(await contarEventos(id, 'OPCION_CONSULTA_CREADA')).toBe(1);

    const actualizacion = await fetch(`${baseUrl}/api/opciones/${id}`, {
      method: 'PATCH',
      headers: headersCon(cookie),
      body: JSON.stringify({ descripcion: 'Descripción actualizada' }),
    });
    expect(actualizacion.status).toBe(200);
    expect(await contarEventos(id, 'OPCION_CONSULTA_ACTUALIZADA')).toBe(1);

    const eliminacion = await deleteOpcion(id, cookie);
    expect(eliminacion.status).toBe(204);
    expect(await contarEventos(id, 'OPCION_CONSULTA_ELIMINADA')).toBe(1);
  });

  // GET /opciones?proceso_id= filtra por proceso.
  it('[8.7] GET /opciones filtra por proceso_id', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const creada = await prisma.opcionConsulta.create({
      data: { proceso_id: proceso.id, etiqueta: 'Filtro' },
    });

    const respuesta = await getOpciones(`?proceso_id=${proceso.id}`, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as Array<Record<string, unknown>>;
    const fila = cuerpo.find((o) => o.id === creada.id);
    expect(fila).toBeDefined();
    expect(fila).toMatchObject({ etiqueta: 'Filtro' });
  });

  // 9.1: 401 sin cookie y 403 con docente/estudiante en las rutas de /opciones.
  it('[9.1] rutas de /opciones sin cookie responden 401', async () => {
    expect((await postOpcion({ proceso_id: '00000000-0000-0000-0000-000000000000', etiqueta: 'X' }, null)).status).toBe(401);
    expect((await getOpciones('', null)).status).toBe(401);
  });

  it.each(['docente', 'estudiante'] as RolUsuario[])(
    '[9.1] rutas de /opciones con rol %s responden 403',
    async (rol) => {
      const { codigo } = await crearUsuarioDirecto({ rol });
      const cookie = await loginYObtenerCookie(codigo);
      const proceso = await crearProceso();

      expect(
        (await postOpcion({ proceso_id: proceso.id, etiqueta: 'X' }, cookie)).status,
      ).toBe(403);
      expect((await getOpciones('', cookie)).status).toBe(403);
    },
  );
});
