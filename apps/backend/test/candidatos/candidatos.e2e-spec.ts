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
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-candidatos';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.pe';

/**
 * candidatos-listas-opciones-consulta, PR4 (design.md D4/D6/D7/D8/D9, tareas 11.3-11.8, 12.1-12.4,
 * 13.1). Corre contra Postgres+Redis reales, mismo criterio que `test/candidatos/listas.e2e-spec.ts`
 * (multipart del subrecurso plan-trabajo) — acá el alta/edición completa de `Candidato` viaja como
 * multipart (D4), con `foto` obligatoria solo en `POST`.
 */
describe('Candidatos e2e — alta/edición multipart, baja y borrado guardado [D4/D6/D7/D9]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-candidatos-e2e-2026';
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

  function headersJson(cookie: string | null): Record<string, string> {
    return { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) };
  }

  interface CampoFoto {
    contenido: Buffer;
    nombreArchivo: string;
    mimeType: string;
  }

  function construirFormData(campos: Record<string, string | undefined>, foto: CampoFoto | undefined): FormData {
    const form = new FormData();
    for (const [clave, valor] of Object.entries(campos)) {
      if (valor !== undefined) {
        form.set(clave, valor);
      }
    }
    if (foto) {
      form.set('foto', new Blob([foto.contenido], { type: foto.mimeType }), foto.nombreArchivo);
    }
    return form;
  }

  async function postCandidato(
    campos: Record<string, string | undefined>,
    foto: CampoFoto | undefined,
    cookie: string | null,
  ): Promise<Response> {
    const form = construirFormData(campos, foto);
    return fetch(`${baseUrl}/api/candidatos`, {
      method: 'POST',
      headers: cookie ? { cookie } : {},
      body: form,
    });
  }

  async function patchCandidato(
    id: string,
    campos: Record<string, string | undefined>,
    foto: CampoFoto | undefined,
    cookie: string | null,
  ): Promise<Response> {
    const form = construirFormData(campos, foto);
    return fetch(`${baseUrl}/api/candidatos/${id}`, {
      method: 'PATCH',
      headers: cookie ? { cookie } : {},
      body: form,
    });
  }

  async function getCandidatos(query: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/candidatos${query}`, { headers: headersJson(cookie) });
  }

  async function patchCandidatoEstado(id: string, body: unknown, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/candidatos/${id}/estado`, {
      method: 'PATCH',
      headers: headersJson(cookie),
      body: JSON.stringify(body),
    });
  }

  async function deleteCandidato(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/candidatos/${id}`, { method: 'DELETE', headers: headersJson(cookie) });
  }

  async function getCandidatoFoto(id: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/candidatos/${id}/foto`, { headers: cookie ? { cookie } : {} });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-candidatos-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-can-${sufijo}`,
        correo: `candidatos-${sufijo}@e2e.local`,
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
    return `Proceso Candidatos E2E ${sufijoBase}-${contador}`;
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

  function fotoValida(bytes = 1024): CampoFoto {
    return { contenido: Buffer.alloc(bytes, 'f'), nombreArchivo: 'foto.png', mimeType: 'image/png' };
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

  // 11.3: POST /candidatos sin archivo de foto -> 400 FOTO_REQUERIDA, sin crear la fila.
  it('[11.3] creación sin foto responde 400 FOTO_REQUERIDA sin crear la fila', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const respuesta = await postCandidato({ proceso_id: proceso.id, nombres: 'Sin Foto' }, undefined, cookie);
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'FOTO_REQUERIDA' });
    expect(await prisma.candidato.count({ where: { proceso_id: proceso.id } })).toBe(0);
  });

  // 11.4: foto application/pdf -> rechazada por tipo no permitido.
  it('[11.4] foto application/pdf responde 400 FORMATO_NO_PERMITIDO', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const foto = { contenido: Buffer.from('contenido'), nombreArchivo: 'foto.pdf', mimeType: 'application/pdf' };
    const respuesta = await postCandidato({ proceso_id: proceso.id, nombres: 'Foto PDF' }, foto, cookie);
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'FORMATO_NO_PERMITIDO' });
  });

  // 11.5: foto PNG de 3MB -> 400 ARCHIVO_DEMASIADO_GRANDE (413 de multer traducido por
  // ArchivoTamanioExcedidoFilter, mismo criterio que 6.5 de listas.e2e-spec.ts).
  it('[11.5] foto PNG de 3MB responde 400 ARCHIVO_DEMASIADO_GRANDE sin crear la fila', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const foto = fotoValida(3 * 1024 * 1024);
    const respuesta = await postCandidato({ proceso_id: proceso.id, nombres: 'Foto Grande' }, foto, cookie);
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ARCHIVO_DEMASIADO_GRANDE' });
    expect(await prisma.candidato.count({ where: { proceso_id: proceso.id } })).toBe(0);
  });

  // 11.6: lista_id de otro proceso_id -> 409 COHERENCIA_JERARQUICA.
  it('[11.6] lista_id de otro proceso_id responde 409 COHERENCIA_JERARQUICA', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const otroProceso = await crearProceso();
    const listaDeOtroProceso = await prisma.lista.create({
      data: { proceso_id: otroProceso.id, nombre: 'Lista Otro Proceso', numero: 1 },
    });

    const respuesta = await postCandidato(
      { proceso_id: proceso.id, nombres: 'Coherencia', lista_id: listaDeOtroProceso.id },
      fotoValida(),
      cookie,
    );
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'COHERENCIA_JERARQUICA' });
  });

  // 11.7: cargo repetido dentro de la misma lista es aceptado.
  it('[11.7] cargo repetido dentro de la misma lista se acepta sin error', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const lista = await prisma.lista.create({
      data: { proceso_id: proceso.id, nombre: 'Lista Cargo Repetido', numero: 2 },
    });

    const primero = await postCandidato(
      { proceso_id: proceso.id, nombres: 'Candidato A', cargo: 'Vocal', lista_id: lista.id },
      fotoValida(),
      cookie,
    );
    expect(primero.status).toBe(201);

    const segundo = await postCandidato(
      { proceso_id: proceso.id, nombres: 'Candidato B', cargo: 'Vocal', lista_id: lista.id },
      fotoValida(),
      cookie,
    );
    expect(segundo.status).toBe(201);
  });

  // 11.8: foto PNG de 1MB se almacena con foto_mime='image/png'.
  it('[11.8] foto PNG válida se almacena con foto_mime image/png', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const respuesta = await postCandidato(
      { proceso_id: proceso.id, nombres: 'Con Foto' },
      fotoValida(1024 * 1024),
      cookie,
    );
    expect(respuesta.status).toBe(201);
    const cuerpo = (await respuesta.json()) as { id: string; foto_presente: boolean; foto_mime: string };
    expect(cuerpo.foto_presente).toBe(true);
    expect(cuerpo.foto_mime).toBe('image/png');

    const filaEnDb = await prisma.candidato.findUniqueOrThrow({ where: { id: cuerpo.id } });
    expect(filaEnDb.foto).not.toBeNull();
    expect(filaEnDb.foto_mime).toBe('image/png');
  });

  // 12.1: PATCH /candidatos/:id/estado {estado:'baja'} con Proceso.estado='abierto' -> 200,
  // baja_en fijado, Voto previos sin alteración.
  it('[12.1] baja con proceso abierto fija baja_en y no altera Voto previos', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const candidato = await prisma.candidato.create({
      data: { proceso_id: proceso.id, nombres: 'A Dar De Baja' },
    });
    const votante = await prisma.usuario.create({
      data: {
        codigo: `e2e-candidatos-votante-${sufijoBase}-${++contador}`,
        dni: `usr-vot-can-${sufijoBase}-${contador}`,
        correo: `votante-can-${sufijoBase}-${contador}@e2e.local`,
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
        aula_snapshot: 'snapshot-candidatos-e2e',
      },
    });
    const voto = await prisma.voto.create({
      data: {
        proceso_id: proceso.id,
        derecho_voto_id: derechoVoto.id,
        candidato_id: candidato.id,
        codigo_comprobante: `comprobante-candidatos-${derechoVoto.id}`,
        clave_idempotencia: `idem-candidatos-${derechoVoto.id}`,
      },
    });

    const respuesta = await patchCandidatoEstado(candidato.id, { estado: 'baja' }, cookie);
    expect(respuesta.status).toBe(200);
    const cuerpo = (await respuesta.json()) as { estado: string; baja_en?: string };
    expect(cuerpo.estado).toBe('baja');
    expect(cuerpo.baja_en).toBeDefined();

    const procesoActual = await prisma.procesoElectoral.findUniqueOrThrow({ where: { id: proceso.id } });
    expect(procesoActual.estado).toBe('abierto');

    const votoActual = await prisma.voto.findUniqueOrThrow({ where: { id: voto.id } });
    expect(votoActual.candidato_id).toBe(candidato.id);
  });

  // 12.2: DELETE /candidatos/:id con Voto asociado -> 409 ENTIDAD_CON_DEPENDIENTES, fila permanece.
  it('[12.2] borrado físico con Voto dependiente responde 409 ENTIDAD_CON_DEPENDIENTES', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const candidato = await prisma.candidato.create({
      data: { proceso_id: proceso.id, nombres: 'Con Voto' },
    });
    const votante = await prisma.usuario.create({
      data: {
        codigo: `e2e-candidatos-votante2-${sufijoBase}-${++contador}`,
        dni: `usr-vot2-can-${sufijoBase}-${contador}`,
        correo: `votante2-can-${sufijoBase}-${contador}@e2e.local`,
        nombres: 'Votante E2E 2',
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
        aula_snapshot: 'snapshot-candidatos-e2e-2',
      },
    });
    await prisma.voto.create({
      data: {
        proceso_id: proceso.id,
        derecho_voto_id: derechoVoto.id,
        candidato_id: candidato.id,
        codigo_comprobante: `comprobante-candidatos2-${derechoVoto.id}`,
        clave_idempotencia: `idem-candidatos2-${derechoVoto.id}`,
      },
    });

    const respuesta = await deleteCandidato(candidato.id, cookie);
    expect(respuesta.status).toBe(409);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ENTIDAD_CON_DEPENDIENTES', relacion: 'Voto' });
    expect(await prisma.candidato.findUnique({ where: { id: candidato.id } })).not.toBeNull();
  });

  // 12.3: DELETE /candidatos/:id sin Voto -> elimina la fila.
  it('[12.3] borrado físico sin Voto elimina la fila', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const candidato = await prisma.candidato.create({
      data: { proceso_id: proceso.id, nombres: 'Sin Voto' },
    });

    const respuesta = await deleteCandidato(candidato.id, cookie);
    expect(respuesta.status).toBe(204);
    expect(await prisma.candidato.findUnique({ where: { id: candidato.id } })).toBeNull();
  });

  // 12.4: exactamente una fila CANDIDATO_CREADO/CANDIDATO_DADO_DE_BAJA por operación exitosa.
  it('[12.4] auditoría: exactamente una fila CANDIDATO_CREADO/CANDIDATO_DADO_DE_BAJA por operación', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const creacion = await postCandidato({ proceso_id: proceso.id, nombres: 'Auditado' }, fotoValida(), cookie);
    expect(creacion.status).toBe(201);
    const { id } = (await creacion.json()) as { id: string };
    expect(await contarEventos(id, 'CANDIDATO_CREADO')).toBe(1);

    const baja = await patchCandidatoEstado(id, { estado: 'baja' }, cookie);
    expect(baja.status).toBe(200);
    expect(await contarEventos(id, 'CANDIDATO_DADO_DE_BAJA')).toBe(1);
  });

  // 14.2: GET /candidatos/:id/foto sirve StreamableFile con foto_mime persistido, nosniff, CSP
  // [spec: Foto válida se almacena y se sirve — completa 11.8].
  it('[14.2] GET /candidatos/:id/foto sirve la foto con Content-Type, nosniff y CSP', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();

    const creacion = await postCandidato(
      { proceso_id: proceso.id, nombres: 'Con Foto Servida' },
      fotoValida(2048),
      cookie,
    );
    expect(creacion.status).toBe(201);
    const { id } = (await creacion.json()) as { id: string };

    const respuesta = await getCandidatoFoto(id, cookie);
    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get('content-type')).toContain('image/png');
    expect(respuesta.headers.get('x-content-type-options')).toBe('nosniff');
    expect(respuesta.headers.get('content-security-policy')).toBe("default-src 'none'");
    const cuerpo = Buffer.from(await respuesta.arrayBuffer());
    expect(cuerpo.length).toBe(2048);
  });

  // 14.3: candidato sin foto -> 404 ARCHIVO_NO_ENCONTRADO, nunca undefined/500 [threat matrix:
  // Clasificación de archivo activo — verificación de cabeceras en la entrega].
  it('[14.3] candidato sin foto responde 404 ARCHIVO_NO_ENCONTRADO', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);
    const proceso = await crearProceso();
    const candidato = await prisma.candidato.create({
      data: { proceso_id: proceso.id, nombres: 'Sin Foto Servida' },
    });

    const respuesta = await getCandidatoFoto(candidato.id, cookie);
    expect(respuesta.status).toBe(404);
    expect(await respuesta.json()).toMatchObject({ codigo: 'ARCHIVO_NO_ENCONTRADO' });
  });

  it('[14.3] candidato inexistente en GET .../foto responde 404, nunca 500', async () => {
    const { codigo } = await crearUsuarioDirecto();
    const cookie = await loginYObtenerCookie(codigo);

    const respuesta = await getCandidatoFoto('00000000-0000-0000-0000-000000000000', cookie);
    expect(respuesta.status).toBe(404);
  });

  // 13.1: 401 sin cookie y 403 con docente/estudiante en las rutas de /candidatos.
  it('[13.1] rutas de /candidatos sin cookie responden 401', async () => {
    const proceso = { id: '00000000-0000-0000-0000-000000000000' };
    expect((await postCandidato({ proceso_id: proceso.id, nombres: 'X' }, fotoValida(), null)).status).toBe(401);
    expect((await getCandidatos('', null)).status).toBe(401);
  });

  it.each(['docente', 'estudiante'] as RolUsuario[])(
    '[13.1] rutas de /candidatos con rol %s responden 403',
    async (rol) => {
      const { codigo } = await crearUsuarioDirecto({ rol });
      const cookie = await loginYObtenerCookie(codigo);
      const proceso = await crearProceso();

      expect(
        (await postCandidato({ proceso_id: proceso.id, nombres: 'X' }, fotoValida(), cookie)).status,
      ).toBe(403);
      expect((await getCandidatos('', cookie)).status).toBe(403);
    },
  );
});
