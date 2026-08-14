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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-listas';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.pe';

/**
 * candidatos-listas-opciones-consulta, PR2 (design.md D5-D9, tareas 5.1-5.6, 6.3-6.7, 7.1). Corre
 * contra Postgres+Redis reales, mismo criterio que `test/academico/aulas.e2e-spec.ts` y
 * `test/configuracion/configuracion.e2e-spec.ts` (multipart del subrecurso plan-trabajo).
 */
describe('Listas e2e — CRUD, baja, borrado guardado y subrecurso plan-trabajo [D5-D9]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-listas-e2e-2026';
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

  async function postLista(body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/listas`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  async function getListas(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/listas${query}`, { headers: headersCon(cookie) });
  }

  async function patchListaEstado(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/listas/${id}/estado`, {
      method: 'PATCH',
      headers: headersCon(cookie),
      body: JSON.stringify(body),
    });
  }

  async function deleteLista(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/listas/${id}`, { method: 'DELETE', headers: headersCon(cookie) });
  }

  async function putPlanTrabajo(id: string, contenido: Buffer, nombreArchivo: string, mimeType: string, cookie: string): Promise<Response> {
    const form = new FormData();
    form.set('plan_trabajo', new Blob([contenido], { type: mimeType }), nombreArchivo);
    return fetch(`${baseUrl}/api/listas/${id}/plan-trabajo`, { method: 'PUT', headers: { cookie }, body: form });
  }

  async function getPlanTrabajo(id: string, cookie: string): Promise<Response> {
    return fetch(`${baseUrl}/api/listas/${id}/plan-trabajo`, { headers: { cookie } });
  }

  async function deletePlanTrabajo(id: string, cookie: string): Promise<Response> {
    return fetch(`${baseUrl}/api/listas/${id}/plan-trabajo`, { method: 'DELETE', headers: { cookie } });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-listas-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-lst-${sufijo}`,
        correo: `listas-${sufijo}@e2e.local`,
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
    return `Proceso Listas E2E ${sufijoBase}-${contador}`;
  }

  async function crearProceso() {
    return prisma.procesoElectoral.create({
      data: {
        nombre: nombreUnico(),
        tipo: 'municipio',
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

  // 5.1: POST /listas con proceso_id inexistente -> 409 REFERENCIA_INEXISTENTE.
  it('[5.1] proceso_id inexistente responde 409 REFERENCIA_INEXISTENTE sin crear la lista', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await postLista(
      { proceso_id: '00000000-0000-0000-0000-000000000000', nombre: 'Lista X', numero: 1 },
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'REFERENCIA_INEXISTENTE' });
  });

  // 5.2: numero repetido en el mismo proceso_id -> 409 RESTRICCION_UNICA.
  it('[5.2] numero repetido en el mismo proceso responde 409 RESTRICCION_UNICA', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const primera = await postLista({ proceso_id: proceso.id, nombre: 'Lista A', numero: 1 }, cookie);
    expect(primera.status).toBe(201);

    const segunda = await postLista({ proceso_id: proceso.id, nombre: 'Lista B', numero: 1 }, cookie);
    expect(segunda.status).toBe(409);
    expect(await segunda.json()).toMatchObject({ codigo: 'RESTRICCION_UNICA' });
  });

  // 5.3: GET /listas?proceso_id=&estado= filtra y nunca expone bytes.
  it('[5.3] GET /listas filtra por proceso_id/estado y nunca expone bytes', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const creada = await prisma.lista.create({
      data: { proceso_id: proceso.id, nombre: 'Lista Filtro', numero: 7 },
    });

    const respuesta = await getListas(`?proceso_id=${proceso.id}&estado=activo`, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as Array<Record<string, unknown>>;
    const fila = cuerpo.find((l) => l.id === creada.id);
    expect(fila).toBeDefined();
    expect(fila).not.toHaveProperty('plan_trabajo');
    expect(fila).toMatchObject({ plan_trabajo_presente: false });

    const invalido = await getListas('?estado=inexistente', cookie);
    expect(invalido.status).toBe(400);
  });

  // 5.4: PATCH /listas/:id/estado {estado:'baja'} fija baja_en, permitido con Proceso abierto.
  it("[5.4] PATCH /listas/:id/estado {estado:'baja'} fija baja_en con Proceso abierto", async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const creada = await prisma.lista.create({
      data: { proceso_id: proceso.id, nombre: 'Lista Baja', numero: 2 },
    });

    const respuesta = await patchListaEstado(creada.id, { estado: 'baja' }, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as { estado: string; baja_en?: string };
    expect(cuerpo.estado).toBe('baja');
    expect(cuerpo.baja_en).toBeDefined();

    const procesoDespues = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: proceso.id } });
    expect(procesoDespues.estado).toBe('abierto');
  });

  // 5.5: DELETE /listas/:id con Candidato/Voto dependientes -> 409 ENTIDAD_CON_DEPENDIENTES, en
  // ese orden (Voto primero).
  it('[5.5] DELETE con Candidato dependiente responde 409 ENTIDAD_CON_DEPENDIENTES {relacion:Candidato}', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const lista = await prisma.lista.create({
      data: { proceso_id: proceso.id, nombre: 'Lista Con Candidato', numero: 3 },
    });
    await prisma.candidato.create({
      data: { proceso_id: proceso.id, lista_id: lista.id, nombres: 'Candidato E2E' },
    });

    const respuesta = await deleteLista(lista.id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Candidato' });
    expect(await prisma.lista.findUnique({ where: { id: lista.id } })).not.toBeNull();
  });

  // 5.6: exactamente una fila LISTA_CREADA/LISTA_DADA_DE_BAJA/LISTA_ELIMINADA por operación
  // exitosa.
  it('[5.6] auditoría: exactamente una fila LISTA_CREADA/LISTA_DADA_DE_BAJA/LISTA_ELIMINADA por operación', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const creacion = await postLista({ proceso_id: proceso.id, nombre: 'Lista Auditoria', numero: 4 }, cookie);
    expect(creacion.status).toBe(201);
    const { id } = (await creacion.json()) as { id: string };
    expect(await contarEventos(id, 'LISTA_CREADA')).toBe(1);

    const baja = await patchListaEstado(id, { estado: 'baja' }, cookie);
    expect(baja.status).toBe(200);
    expect(await contarEventos(id, 'LISTA_DADA_DE_BAJA')).toBe(1);

    const eliminacion = await deleteLista(id, cookie);
    expect(eliminacion.status).toBe(204);
    expect(await contarEventos(id, 'LISTA_ELIMINADA')).toBe(1);
  });

  // 6.3: creación/edición de Lista sin PDF adjunto se acepta, plan_trabajo en NULL.
  it('[6.3] creación de Lista sin PDF adjunto se acepta con plan_trabajo_presente=false', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const respuesta = await postLista({ proceso_id: proceso.id, nombre: 'Lista Sin PDF', numero: 5 }, cookie);
    expect(respuesta.status).toBe(201);
    const cuerpo = (await respuesta.json()) as { plan_trabajo_presente: boolean };
    expect(cuerpo.plan_trabajo_presente).toBe(false);
  });

  // 6.4: PUT /listas/:id/plan-trabajo con PDF de 4MB se almacena y GET lo sirve con
  // Content-Disposition: attachment + plan_trabajo_nombre original.
  it('[6.4] PDF válido de 4MB se almacena y GET lo sirve con attachment + nombre original', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const lista = await prisma.lista.create({
      data: { proceso_id: proceso.id, nombre: 'Lista PDF', numero: 6 },
    });
    const contenido = Buffer.alloc(4 * 1024 * 1024, 'p');

    const subida = await putPlanTrabajo(lista.id, contenido, 'plan-original.pdf', 'application/pdf', cookie);
    expect(subida.status).toBe(200);
    const cuerpoSubida = (await subida.json()) as { plan_trabajo_presente: boolean; plan_trabajo_nombre: string };
    expect(cuerpoSubida.plan_trabajo_presente).toBe(true);
    expect(cuerpoSubida.plan_trabajo_nombre).toBe('plan-original.pdf');

    const descarga = await getPlanTrabajo(lista.id, cookie);
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get('content-type')).toContain('application/pdf');
    expect(descarga.headers.get('content-disposition')).toContain('attachment');
    expect(descarga.headers.get('content-disposition')).toContain('plan-original.pdf');
    expect(descarga.headers.get('x-content-type-options')).toBe('nosniff');
  });

  // 6.5: PDF de 6MB -> 400 ARCHIVO_DEMASIADO_GRANDE sin persistir.
  it('[6.5] PDF de 6MB responde 400 ARCHIVO_DEMASIADO_GRANDE sin persistir', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const lista = await prisma.lista.create({
      data: { proceso_id: proceso.id, nombre: 'Lista PDF Grande', numero: 8 },
    });
    const contenido = Buffer.alloc(6 * 1024 * 1024, 'p');

    const respuesta = await putPlanTrabajo(lista.id, contenido, 'plan-grande.pdf', 'application/pdf', cookie);
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ARCHIVO_DEMASIADO_GRANDE' });

    const filaEnDb = await prisma.lista.findUniqueOrThrow({ where: { id: lista.id } });
    expect(filaEnDb.plan_trabajo).toBeNull();
  });

  // 6.6: PDF de 0 bytes -> 400 ARCHIVO_VACIO; extension doble (plan.pdf.exe) -> 400
  // FORMATO_NO_PERMITIDO.
  it('[6.6] PDF de 0 bytes responde 400 ARCHIVO_VACIO', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const lista = await prisma.lista.create({
      data: { proceso_id: proceso.id, nombre: 'Lista PDF Vacio', numero: 9 },
    });

    const respuesta = await putPlanTrabajo(lista.id, Buffer.alloc(0), 'plan-vacio.pdf', 'application/pdf', cookie);
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ARCHIVO_VACIO' });
  });

  it('[6.6] extensión doble (plan.pdf.exe) responde 400 FORMATO_NO_PERMITIDO', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const lista = await prisma.lista.create({
      data: { proceso_id: proceso.id, nombre: 'Lista PDF Doble Extension', numero: 10 },
    });

    const respuesta = await putPlanTrabajo(
      lista.id,
      Buffer.from('contenido'),
      'plan.pdf.exe',
      'application/pdf',
      cookie,
    );
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'FORMATO_NO_PERMITIDO' });
  });

  // 6.7: DELETE /listas/:id/plan-trabajo limpia las 3 columnas y audita
  // LISTA_PLAN_TRABAJO_ACTUALIZADO con {presente:false}.
  it('[6.7] DELETE /listas/:id/plan-trabajo limpia las columnas y audita {presente:false}', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const lista = await prisma.lista.create({
      data: {
        proceso_id: proceso.id,
        nombre: 'Lista PDF A Borrar',
        numero: 11,
        plan_trabajo: Buffer.from('contenido'),
        plan_trabajo_mime: 'application/pdf',
        plan_trabajo_nombre: 'previo.pdf',
      },
    });

    const respuesta = await deletePlanTrabajo(lista.id, cookie);
    expect(respuesta.status).toBe(204);

    const filaEnDb = await prisma.lista.findUniqueOrThrow({ where: { id: lista.id } });
    expect(filaEnDb.plan_trabajo).toBeNull();
    expect(filaEnDb.plan_trabajo_mime).toBeNull();
    expect(filaEnDb.plan_trabajo_nombre).toBeNull();

    const eventos = await prisma.eventoAuditoria.findMany({
      where: { entity_id: lista.id, event_type: 'LISTA_PLAN_TRABAJO_ACTUALIZADO' },
      orderBy: { occurred_at: 'desc' },
    });
    expect(eventos.length).toBeGreaterThanOrEqual(1);
    expect(eventos[0]?.payload).toMatchObject({ presente: false });
  });

  // 7.1: 401 sin cookie y 403 con docente/estudiante en las rutas de /listas.
  it('[7.1] rutas de /listas sin cookie responden 401', async () => {
    expect((await postLista({ proceso_id: '00000000-0000-0000-0000-000000000000', nombre: 'X', numero: 1 }, null)).status).toBe(401);
    expect((await getListas('', null)).status).toBe(401);
  });

  it.each(['docente', 'estudiante'] as RolUsuario[])(
    '[7.1] rutas de /listas con rol %s responden 403',
    async (rol) => {
      const { codigo } = await crearUsuarioDirecto({ rol });
      const cookie = await loginYObtenerCookie(codigo);
      const proceso = await crearProceso();

      expect(
        (await postLista({ proceso_id: proceso.id, nombre: 'X', numero: 99 }, cookie)).status,
      ).toBe(403);
      expect((await getListas('', cookie)).status).toBe(403);
    },
  );
});
