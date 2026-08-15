import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../../src/app.module';
import { AUDIT_EVENT_TYPES } from '../../src/auditoria/audit-event-types';
import { AuditoriaService } from '../../src/auditoria/auditoria.service';
import { GOOGLE_OAUTH_CLIENT } from '../../src/auth/google-oauth.provider';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-votos-emitir';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * vote-casting (#14, PR3; design.md D2-D13, "Contratos HTTP", tareas 11.2-11.13). Corre contra
 * Postgres+Redis reales, mismo patrón que `test/procesos/procesos-abrir.e2e-spec.ts` (#13, PR4):
 * `fetch` contra el servidor real + `PrismaClient` propio para asertar filas/auditoría. Los
 * `DerechoVoto` no se insertan a mano: se materializan vía el flujo real `POST /procesos` +
 * `POST /procesos/:id/abrir` (#13), la misma garantía que este change consume.
 */
describe('POST /votos e2e — camino feliz, idempotencia, rechazos y secreto del voto [D2-D13]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-votos-emitir-e2e-2026';
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

  async function postVotos(body: unknown, cookie: string | null, servidor = baseUrl): Promise<Response> {
    return fetch(`${servidor}/api/votos`, { method: 'POST', headers: headersCon(cookie), body: JSON.stringify(body) });
  }

  function nombreUnico(): string {
    contador += 1;
    return `Votos Emitir E2E ${sufijoBase}-${contador}`;
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-votos-emitir-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `votos-emitir-${sufijo}@e2e.local`,
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

  interface VotanteOverrides {
    conApoderado?: boolean;
  }

  // A diferencia de `matricularEstudiante` de #13 (usuario sin credenciales — el admin actúa por
  // él), este votante necesita loguearse por sí mismo: password_hash compartido con el resto de la
  // suite (misma estrategia que `crearUsuarioDirecto`).
  async function crearVotante(aulaId: string, anioEscolarId: string, overrides: VotanteOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-votos-emitir-est-${sufijo}`;
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
    if (overrides.conApoderado) {
      await prisma.apoderado.create({
        data: { nombres: `Apoderado E2E ${sufijo}`, dni: `apo-${sufijo}`, usuario_id: estudiante.id },
      });
    }
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

  interface ProcesoAbiertoOverrides {
    publico_objetivo?: 'estudiantes' | 'padres' | 'comunidad';
  }

  // Materializa un proceso abierto + un DerechoVoto real (vía #13) + una Lista activa propia, listo
  // para `POST /votos`. `en_calidad_de` del votante se resuelve consultando el DerechoVoto real
  // materializado por la apertura — nunca asumido.
  async function crearProcesoAbiertoConVotante(cookieAdmin: string, anioEscolarId: string, overrides: ProcesoAbiertoOverrides = {}) {
    const { aula } = await crearArbolConAula(anioEscolarId);
    const votante = await crearVotante(aula.id, anioEscolarId, { conApoderado: overrides.publico_objetivo === 'comunidad' });

    const respuestaCrear = await postCrear(
      dtoProceso({ aula_ids: [aula.id], publico_objetivo: overrides.publico_objetivo ?? 'estudiantes' }),
      cookieAdmin,
    );
    expect(respuestaCrear.status).toBe(201);
    const { id: procesoId } = await respuestaCrear.json();

    const respuestaAbrir = await postAbrir(procesoId, cookieAdmin);
    expect(respuestaAbrir.status).toBe(200);

    const lista = await prisma.lista.create({
      data: { proceso_id: procesoId, nombre: nombreUnico(), numero: 1, estado: 'activo' },
    });

    return { procesoId, votante, lista, aulaId: aula.id };
  }

  async function derechoDe(procesoId: string, usuarioId: string, enCalidadDe = 'estudiante') {
    return prisma.derechoVoto.findFirstOrThrow({ where: { proceso_id: procesoId, usuario_id: usuarioId, en_calidad_de: enCalidadDe } });
  }

  function claveIdempotencia(): string {
    contador += 1;
    return `clave-${sufijoBase}-${contador}`;
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

  // 11.2: camino feliz -> 201, comprobante, una fila Voto, DerechoVoto ejercido (derivado), evento
  // VOTO sin elección.
  it('[11.2] camino feliz responde 201 con comprobante, crea exactamente una fila Voto y un evento VOTO sin elección', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    const respuesta = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );

    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo.codigo_comprobante).toMatch(/^[0-9A-Z-]{19}$/);
    expect(cuerpo.proceso.id).toBe(procesoId);
    expect(cuerpo.en_calidad_de).toBe('estudiante');
    expect(cuerpo.eleccion_resumen).toBe(lista.nombre);

    const votos = await prisma.voto.findMany({ where: { derecho_voto_id: derecho.id } });
    expect(votos).toHaveLength(1);
    expect(votos[0].lista_id).toBe(lista.id);

    const eventos = await prisma.eventoAuditoria.findMany({ where: { event_type: 'VOTO', entity_id: votos[0].id } });
    expect(eventos).toHaveLength(1);
    const payload = eventos[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({ proceso_id: procesoId, derecho_voto_id: derecho.id });
    expect(Object.keys(payload).sort()).toEqual(['codigo_comprobante', 'derecho_voto_id', 'hora_servidor', 'proceso_id']);
  });

  // 11.3: fallo intermedio (auditoría forzada a fallar) -> rollback completo, cero filas Voto,
  // DerechoVoto sigue pendiente, sin evento VOTO. Segunda instancia de Nest con AuditoriaService
  // sobrescrito solo para VOTO -- el resto de los flujos de este mismo app (login, etc.) sigue
  // auditando de verdad, delegando a una instancia real de AuditoriaService.
  it('[11.3] fallo intermedio (auditoría forzada) revierte todo: cero filas Voto, sin evento VOTO', async () => {
    const auditoriaReal = new AuditoriaService();
    const auditoriaForzadorFallo = {
      log: (tx: Parameters<AuditoriaService['log']>[0], eventType: Parameters<AuditoriaService['log']>[1], ...resto: unknown[]) => {
        if (eventType === AUDIT_EVENT_TYPES.VOTO) {
          throw new Error('payload de auditoría malformado (forzado, tarea 11.3)');
        }
        return (auditoriaReal.log as (...args: unknown[]) => Promise<void>)(tx, eventType, ...resto);
      },
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(GOOGLE_OAUTH_CLIENT)
      .useValue({
        verifyIdToken: async () => {
          throw new Error('no usado en esta suite');
        },
      })
      .overrideProvider(AuditoriaService)
      .useValue(auditoriaForzadorFallo)
      .compile();

    const appForzado = moduleRef.createNestApplication();
    appForzado.setGlobalPrefix('api');
    await appForzado.init();
    await appForzado.listen(0);
    const address = appForzado.getHttpServer().address();
    const puerto = typeof address === 'object' && address !== null ? address.port : 3000;
    const servidorForzado = `http://127.0.0.1:${puerto}`;

    try {
      const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
      const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
      const anioEscolar = await crearAnioEscolarActivo();

      const { aula } = await crearArbolConAula(anioEscolar.id);
      const votante = await crearVotante(aula.id, anioEscolar.id);
      const respuestaCrear = await postCrear(
        dtoProceso({ aula_ids: [aula.id], publico_objetivo: 'estudiantes' }),
        cookieAdmin,
      );
      expect(respuestaCrear.status).toBe(201);
      const { id: procesoId } = await respuestaCrear.json();
      const respuestaAbrir = await postAbrir(procesoId, cookieAdmin);
      expect(respuestaAbrir.status).toBe(200);
      const lista = await prisma.lista.create({
        data: { proceso_id: procesoId, nombre: nombreUnico(), numero: 1, estado: 'activo' },
      });
      const derecho = await derechoDe(procesoId, votante.estudiante.id);

      const respuesta = await postVotos(
        { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
        votante.cookie,
        servidorForzado,
      );

      expect(respuesta.status).toBeGreaterThanOrEqual(500);

      const votos = await prisma.voto.findMany({ where: { derecho_voto_id: derecho.id } });
      expect(votos).toHaveLength(0);
      const eventosVoto = await prisma.eventoAuditoria.count({ where: { event_type: 'VOTO', entity_id: { not: null } } });
      const eventosVotoDeEsteDerecho = await prisma.eventoAuditoria.findMany({ where: { event_type: 'VOTO' } });
      expect(eventosVotoDeEsteDerecho.some((e) => (e.payload as Record<string, unknown>).derecho_voto_id === derecho.id)).toBe(false);
      expect(eventosVoto).toBeGreaterThanOrEqual(0);
    } finally {
      await appForzado.close();
    }
  });

  // 11.4: reintento con la misma clave_idempotencia -> 200, mismo comprobante, sigue exactamente
  // una fila Voto.
  it('[11.4] reintento con la misma clave_idempotencia responde 200 con el mismo comprobante, sin fila nueva', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);
    const clave = claveIdempotencia();

    const primera = await postVotos({ derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: clave }, votante.cookie);
    expect(primera.status).toBe(201);
    const cuerpoPrimera = await primera.json();

    const segunda = await postVotos({ derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: clave }, votante.cookie);
    expect(segunda.status).toBe(200);
    const cuerpoSegunda = await segunda.json();
    expect(cuerpoSegunda).toEqual(cuerpoPrimera);

    const votos = await prisma.voto.findMany({ where: { derecho_voto_id: derecho.id } });
    expect(votos).toHaveLength(1);
  });

  // 11.5: segundo intento con clave distinta sobre el mismo derecho ya ejercido -> 200 con el
  // comprobante existente (causa 4, D10), nunca 500/409 genérico.
  it('[11.5] segunda clave distinta sobre el mismo derecho ya ejercido responde 200 con el comprobante existente', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    const primera = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(primera.status).toBe(201);
    const cuerpoPrimera = await primera.json();

    const segunda = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(segunda.status).toBe(200);
    const cuerpoSegunda = await segunda.json();
    expect(cuerpoSegunda.codigo_comprobante).toBe(cuerpoPrimera.codigo_comprobante);

    const votos = await prisma.voto.findMany({ where: { derecho_voto_id: derecho.id } });
    expect(votos).toHaveLength(1);

    const eventosRechazo = await prisma.eventoAuditoria.findMany({ where: { event_type: 'RECHAZO', entity_id: derecho.id } });
    expect(eventosRechazo.some((e) => (e.payload as Record<string, unknown>).motivo === 'derecho_ya_ejercido')).toBe(true);
  });

  // 11.6: proceso cerrado -> 409 VOTACION_CERRADA, evento RECHAZO propio, cero filas Voto nuevas.
  it('[11.6] proceso cerrado responde 409 VOTACION_CERRADA con evento RECHAZO propio, cero filas Voto', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

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
    const eventosRechazo = await prisma.eventoAuditoria.findMany({ where: { event_type: 'RECHAZO', entity_id: derecho.id } });
    expect(eventosRechazo.some((e) => (e.payload as Record<string, unknown>).motivo === 'proceso_cerrado')).toBe(true);
  });

  // 11.7: derecho ajeno o inexistente -> 403 idéntico en ambos casos, sin evento RECHAZO
  // [threat matrix: IDOR/enumeración].
  it('[11.7][adversarial] derecho ajeno responde 403 sin cuerpo discriminante, sin evento RECHAZO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derechoAjeno = await derechoDe(procesoId, votante.estudiante.id);

    const { aula: aulaOtro } = await crearArbolConAula(anioEscolar.id);
    const otroVotante = await crearVotante(aulaOtro.id, anioEscolar.id);

    const respuesta = await postVotos(
      { derecho_voto_id: derechoAjeno.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      otroVotante.cookie,
    );

    expect(respuesta.status).toBe(403);
    const eventosAntes = await prisma.eventoAuditoria.count({ where: { event_type: 'RECHAZO', entity_id: derechoAjeno.id } });
    expect(eventosAntes).toBe(0);
    expect(await prisma.voto.count({ where: { derecho_voto_id: derechoAjeno.id } })).toBe(0);
  });

  it('[11.7][adversarial] derecho inexistente responde 403 idéntico al de derecho ajeno', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const respuesta = await postVotos(
      { derecho_voto_id: '00000000-0000-0000-0000-000000000000', lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );

    expect(respuesta.status).toBe(403);
    // D9: mismo cuerpo "sin código discriminante" que un derecho ajeno -- nunca un `codigo` que
    // permita distinguir "existe pero es ajeno" de "no existe".
    expect(await respuesta.json()).not.toHaveProperty('codigo');
  });

  // 11.8: voto en blanco -> Voto.blanco = true, resto de columnas de elección null.
  it('[11.8] voto en blanco crea Voto con blanco=true y el resto de la elección en null', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    const respuesta = await postVotos(
      { derecho_voto_id: derecho.id, blanco: true, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );

    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo.eleccion_resumen).toBe('Voto en blanco');

    const voto = await prisma.voto.findFirstOrThrow({ where: { derecho_voto_id: derecho.id } });
    expect(voto.blanco).toBe(true);
    expect(voto.lista_id).toBeNull();
    expect(voto.opcion_id).toBeNull();
    expect(voto.candidato_id).toBeNull();
  });

  // 11.9: doble derecho ADR-0011 (estudiante+padre) -- ejercer uno no afecta el estado pendiente
  // del otro.
  it('[11.9] doble derecho (estudiante+padre): ejercer uno no afecta el otro, sigue pendiente', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id, {
      publico_objetivo: 'comunidad',
    });

    const derechoEstudiante = await derechoDe(procesoId, votante.estudiante.id, 'estudiante');
    const derechoPadre = await derechoDe(procesoId, votante.estudiante.id, 'padre');
    expect(derechoEstudiante.id).not.toBe(derechoPadre.id);

    const respuesta = await postVotos(
      { derecho_voto_id: derechoEstudiante.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(respuesta.status).toBe(201);

    expect(await prisma.voto.count({ where: { derecho_voto_id: derechoEstudiante.id } })).toBe(1);
    expect(await prisma.voto.count({ where: { derecho_voto_id: derechoPadre.id } })).toBe(0);

    // El derecho de padre sigue "pendiente" (derivado): ejercerlo por separado sigue funcionando.
    const segundaRespuesta = await postVotos(
      { derecho_voto_id: derechoPadre.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    expect(segundaRespuesta.status).toBe(201);
    expect(await prisma.voto.count({ where: { derecho_voto_id: derechoPadre.id } })).toBe(1);
  });

  // 11.10: hora_servidor del comprobante cae entre dos clock_timestamp() de la propia base, nunca
  // comparado contra Date.now() de Node.
  it('[11.10] hora_servidor del comprobante cae entre dos clock_timestamp() de la propia base', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    const [{ antes }] = await prisma.$queryRaw<{ antes: Date }[]>`SELECT clock_timestamp() AS antes`;
    const respuesta = await postVotos(
      { derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );
    const [{ despues }] = await prisma.$queryRaw<{ despues: Date }[]>`SELECT clock_timestamp() AS despues`;

    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    const horaServidor = new Date(cuerpo.hora_servidor).getTime();
    expect(horaServidor).toBeGreaterThanOrEqual(antes.getTime());
    expect(horaServidor).toBeLessThanOrEqual(despues.getTime());
  });

  // 11.11: ningún payload VOTO/RECHAZO capturado contiene candidato_id/lista_id/opcion_id/blanco/
  // eleccion.
  it('[11.11] ningún payload VOTO o RECHAZO contiene las claves prohibidas de la elección', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    await postVotos({ derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() }, votante.cookie);
    // Reintento con clave distinta -> también dispara un evento RECHAZO (causa 4).
    await postVotos({ derecho_voto_id: derecho.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() }, votante.cookie);

    const eventos = await prisma.eventoAuditoria.findMany({ where: { entity_id: derecho.id, event_type: { in: ['VOTO', 'RECHAZO'] } } });
    const eventosPorVoto = await prisma.eventoAuditoria.findMany({ where: { event_type: 'VOTO' } });
    const todos = [...eventos, ...eventosPorVoto];
    const claveProhibidas = ['candidato_id', 'lista_id', 'opcion_id', 'blanco', 'eleccion'];
    for (const evento of todos) {
      const claves = Object.keys(evento.payload as Record<string, unknown>);
      for (const prohibida of claveProhibidas) {
        expect(claves).not.toContain(prohibida);
      }
    }
  });

  // 11.12 [threat matrix, SQL crudo parametrizado]: derecho_voto_id no-UUID o literal de inyección
  // -> 400, cero filas afectadas.
  it('[11.12][adversarial] derecho_voto_id no-UUID responde 400, cero filas afectadas', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const antesVotos = await prisma.voto.count();
    const respuesta = await postVotos(
      { derecho_voto_id: "'; DROP TABLE \"Voto\"; --", lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      votante.cookie,
    );

    expect(respuesta.status).toBe(400);
    expect(await prisma.voto.count()).toBe(antesVotos);
  });

  // 401/400 de regresión mínima del contrato (D6/D9).
  it('[regresión] sin cookie responde 401, sin filas Voto', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { votante, lista } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);

    const respuesta = await postVotos(
      { derecho_voto_id: votante.estudiante.id, lista_id: lista.id, clave_idempotencia: claveIdempotencia() },
      null,
    );
    expect(respuesta.status).toBe(401);
  });

  it('[regresión] elección ausente (ni lista/opcion/candidato ni blanco) responde 400 CAMPO_INVALIDO', async () => {
    const { codigo: codigoAdmin } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookieAdmin = await loginYObtenerCookie(codigoAdmin);
    const anioEscolar = await crearAnioEscolarActivo();
    const { procesoId, votante } = await crearProcesoAbiertoConVotante(cookieAdmin, anioEscolar.id);
    const derecho = await derechoDe(procesoId, votante.estudiante.id);

    const respuesta = await postVotos({ derecho_voto_id: derecho.id, clave_idempotencia: claveIdempotencia() }, votante.cookie);
    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toMatchObject({ codigo: 'CAMPO_INVALIDO' });
  });
});
