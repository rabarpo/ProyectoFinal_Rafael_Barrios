import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';
import type { RolUsuario, Turno } from '@prisma/client';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';
import { GOOGLE_OAUTH_CLIENT } from '../src/auth/google-oauth.provider';
import { CABECERA_PADRON } from '../src/importacion/padron-csv';

const COOKIE_NAME = 'seei_session';
const ARGON2_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const GOOGLE_CLIENT_ID = 'e2e-google-client-id-importacion';
const GOOGLE_HOSTED_DOMAINS = 'colegio.edu.ar';

/**
 * importacion-excel, PR3 (design.md "Data Flow"/"Testing Strategy", tarea 3.5, spec
 * `importacion-excel`). Corre contra Postgres+Redis reales, mismo criterio que
 * `test/academico/matriculas.e2e-spec.ts`. Sube archivos `.csv` construidos a mano vía
 * `multipart/form-data` (`fetch` + `FormData`/`Blob` nativos de Node) — `exceljs` procesa `.csv` y
 * `.xlsx` con la misma API (D3), y la cobertura de parseo real ya vive en
 * `importacion.service.spec.ts`; acá se prueba el contrato HTTP de punta a punta.
 *
 * DESVIACIÓN declarada (mismo criterio que PR1/PR2 de este change y el resto del monorepo):
 * `docker ps` no tiene daemon Docker disponible en este entorno, así que esta suite NO pudo
 * correrse hasta GREEN en esta sesión. Queda escrita y type-checkeada (`pnpm typecheck` en verde)
 * contra el contrato real de `ImportacionController`/`ImportacionService`, lista para ejecutarse
 * en CI o en un entorno con `docker-compose.test.yml` levantado. La cobertura equivalente de
 * orquestación/lógica de negocio (bucle por fila, atomicidad, Redis, auditoría agregada) ya está
 * en verde como unit tests en `src/importacion/importacion.service.spec.ts`.
 */
describe('Importacion e2e — POST /importaciones/padron + GET .../errores.csv [R1-R7]', () => {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6380');

  let app: INestApplication;
  let baseUrl: string;

  const PASSWORD_CORRECTA = 'clave-correcta-importacion-e2e-2026';
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

  async function loginYObtenerCookie(codigo: string): Promise<string> {
    const respuesta = await postLogin(codigo, PASSWORD_CORRECTA);
    expect(respuesta.status).toBe(200);
    return extraerCookie(respuesta) as string;
  }

  async function postPadron(csv: string, nombreArchivo: string, cookie: string | null): Promise<Response> {
    const form = new FormData();
    form.append('archivo', new Blob([csv], { type: 'text/csv' }), nombreArchivo);
    return fetch(`${baseUrl}/api/importaciones/padron`, {
      method: 'POST',
      headers: cookie ? { cookie } : {},
      body: form,
    });
  }

  async function getErroresCsv(importacionId: string, cookie: string | null): Promise<Response> {
    return fetch(`${baseUrl}/api/importaciones/${importacionId}/errores.csv`, {
      headers: cookie ? { cookie } : {},
    });
  }

  interface UsuarioOverrides {
    rol?: RolUsuario;
  }

  async function crearUsuarioDirecto(overrides: UsuarioOverrides = {}) {
    contador += 1;
    const sufijo = `${sufijoBase}-${contador}`;
    const codigo = `e2e-importacion-${sufijo}`;
    const usuario = await prisma.usuario.create({
      data: {
        codigo,
        dni: `usr-${sufijo}`,
        correo: `importacion-${sufijo}@e2e.local`,
        nombres: `Usuario E2E ${sufijo}`,
        rol: overrides.rol ?? 'administrador',
        estado: 'activo',
        password_hash: passwordHash,
      },
    });
    return { usuario, codigo };
  }

  function nombreUnico(): string {
    contador += 1;
    return `Importacion E2E ${sufijoBase}-${contador}`;
  }

  /** Crea AnioEscolar + Aula (Nivel/Grado/Seccion) coherentes, identificables por nombre legible. */
  async function crearArbolCoherente(turno: Turno = 'manana') {
    const anioEscolar = await prisma.anioEscolar.create({ data: { nombre: nombreUnico(), activo: false } });
    const nivel = await prisma.nivel.create({ data: { nombre: nombreUnico() } });
    const grado = await prisma.grado.create({ data: { nombre: nombreUnico(), nivel_id: nivel.id } });
    const seccion = await prisma.seccion.create({
      data: { nombre: nombreUnico(), grado_id: grado.id, anio_escolar_id: anioEscolar.id },
    });
    const aula = await prisma.aula.create({
      data: { turno, grado_id: grado.id, seccion_id: seccion.id, anio_escolar_id: anioEscolar.id },
    });
    return { anioEscolar, grado, seccion, aula, turno };
  }

  function filaPadron(overrides: {
    nombres: string;
    dni: string;
    codigo: string;
    correo: string;
    arbol: { grado: { nombre: string }; seccion: { nombre: string }; turno: Turno; anioEscolar: { nombre: string } };
  }): string[] {
    return [
      overrides.nombres,
      overrides.dni,
      overrides.codigo,
      overrides.correo,
      overrides.arbol.grado.nombre,
      overrides.arbol.seccion.nombre,
      overrides.arbol.turno,
      overrides.arbol.anioEscolar.nombre,
    ];
  }

  function construirCsv(filas: string[][]): string {
    return filas.map((fila) => fila.join(',')).join('\n');
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

  // R1/R2: archivo mixto — filas válidas se importan, filas inválidas se reportan sin abortar.
  it('[R1][R2] archivo con filas válidas e inválidas mezcladas: importa todas las válidas, reporta cada inválida', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const arbol = await crearArbolCoherente();
    const sufijo = `${sufijoBase}-${++contador}`;

    const filaValida1 = filaPadron({
      nombres: 'Ana Pérez',
      dni: `dni-${sufijo}-1`,
      codigo: `cod-${sufijo}-1`,
      correo: `ana-${sufijo}@e2e.local`,
      arbol,
    });
    const filaVacia = ['', '', '', '', '', '', '', ''];
    const filaCorreoInvalido = filaPadron({
      nombres: 'Rota',
      dni: `dni-${sufijo}-2`,
      codigo: `cod-${sufijo}-2`,
      correo: 'no-es-un-correo',
      arbol,
    });
    const filaValida2 = filaPadron({
      nombres: 'Luis Gómez',
      dni: `dni-${sufijo}-3`,
      codigo: `cod-${sufijo}-3`,
      correo: `luis-${sufijo}@e2e.local`,
      arbol,
    });

    const csv = construirCsv([[...CABECERA_PADRON], filaValida1, filaVacia, filaCorreoInvalido, filaValida2]);
    const respuesta = await postPadron(csv, 'padron.csv', cookie);

    expect(respuesta.status).toBe(201);
    const cuerpo = await respuesta.json();
    expect(cuerpo.filas_totales).toBe(4);
    expect(cuerpo.filas_creadas).toBe(2);
    expect(cuerpo.filas_invalidas).toBe(2);
    expect(cuerpo.errores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fila: 2, motivo: 'fila_vacia' }),
        expect.objectContaining({ fila: 3, campo: 'correo', motivo: 'formato' }),
      ]),
    );
    expect(await prisma.usuario.findFirst({ where: { codigo: `cod-${sufijo}-1` } })).not.toBeNull();
    expect(await prisma.usuario.findFirst({ where: { codigo: `cod-${sufijo}-3` } })).not.toBeNull();
    expect(await prisma.usuario.findFirst({ where: { codigo: `cod-${sufijo}-2` } })).toBeNull();
    expect(await contarEventos(cuerpo.importacion_id, 'PADRON_IMPORTADO')).toBe(1);
  });

  // R3: reimportar el mismo archivo no duplica Usuario ni Matricula.
  it('[R3] reimportar el mismo archivo no duplica Usuario ni Matricula: la segunda vez responde filas_existentes', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const arbol = await crearArbolCoherente();
    const sufijo = `${sufijoBase}-${++contador}`;
    const fila = filaPadron({
      nombres: 'Reimport Test',
      dni: `dni-reimport-${sufijo}`,
      codigo: `cod-reimport-${sufijo}`,
      correo: `reimport-${sufijo}@e2e.local`,
      arbol,
    });
    const csv = construirCsv([[...CABECERA_PADRON], fila]);

    const primera = await postPadron(csv, 'padron.csv', cookie);
    expect(primera.status).toBe(201);
    const cuerpoPrimera = await primera.json();
    expect(cuerpoPrimera.filas_creadas).toBe(1);

    const segunda = await postPadron(csv, 'padron.csv', cookie);
    expect(segunda.status).toBe(201);
    const cuerpoSegunda = await segunda.json();
    expect(cuerpoSegunda.filas_creadas).toBe(0);
    expect(cuerpoSegunda.filas_existentes).toBe(1);
    expect(cuerpoSegunda.filas_invalidas).toBe(0);

    expect(await prisma.usuario.count({ where: { codigo: `cod-reimport-${sufijo}` } })).toBe(1);
    expect(await prisma.matricula.count({ where: { usuario: { codigo: `cod-reimport-${sufijo}` } } })).toBe(1);
  });

  // R1: cabecera inválida se rechaza sin procesar ninguna fila.
  it('[R1] cabecera de columnas incorrecta responde 400 y no crea ningún Usuario', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const sufijo = `${sufijoBase}-${++contador}`;
    const csv = construirCsv([
      ['nombre', 'dni_incorrecto'],
      ['x', `dni-${sufijo}`],
    ]);

    const respuesta = await postPadron(csv, 'padron.csv', cookie);
    expect(respuesta.status).toBe(400);
    expect((await respuesta.json()).codigo).toBe('CABECERA_INVALIDA');
    expect(await prisma.usuario.findFirst({ where: { dni: `dni-${sufijo}` } })).toBeNull();
  });

  // R1: archivo con más de 2000 filas de datos se rechaza sin procesar ninguna.
  it('[R1] archivo con más de 2000 filas de datos responde 400 y no crea ningún Usuario', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const arbol = await crearArbolCoherente();
    const sufijo = `${sufijoBase}-${++contador}`;
    const filaBase = filaPadron({
      nombres: 'Exceso',
      dni: `dni-exceso-${sufijo}`,
      codigo: `cod-exceso-${sufijo}`,
      correo: `exceso-${sufijo}@e2e.local`,
      arbol,
    });
    const filasDeMas = Array.from({ length: 2001 }, () => filaBase);
    const csv = construirCsv([[...CABECERA_PADRON], ...filasDeMas]);

    const respuesta = await postPadron(csv, 'padron.csv', cookie);
    expect(respuesta.status).toBe(400);
    expect((await respuesta.json()).codigo).toBe('LIMITE_FILAS_EXCEDIDO');
    expect(await prisma.usuario.findFirst({ where: { dni: `dni-exceso-${sufijo}` } })).toBeNull();
  }, 30_000);

  // D7: `.xlsm` nunca se acepta, aunque su contenido "parezca" un CSV/Excel válido.
  it('[D7] archivo .xlsm se rechaza con 400 sin procesar ninguna fila', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const arbol = await crearArbolCoherente();
    const fila = filaPadron({
      nombres: 'Macro',
      dni: `dni-xlsm-${sufijoBase}`,
      codigo: `cod-xlsm-${sufijoBase}`,
      correo: `xlsm-${sufijoBase}@e2e.local`,
      arbol,
    });
    const csv = construirCsv([[...CABECERA_PADRON], fila]);

    const respuesta = await postPadron(csv, 'padron.xlsm', cookie);
    expect(respuesta.status).toBe(400);
    expect((await respuesta.json()).codigo).toBe('EXTENSION_NO_PERMITIDA');
  });

  // R4: descarga del CSV de errores.
  it('[R4] GET /importaciones/:id/errores.csv devuelve el CSV de errores; id inexistente responde 404', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'administrador' });
    const cookie = await loginYObtenerCookie(codigo);
    const arbol = await crearArbolCoherente();
    const sufijo = `${sufijoBase}-${++contador}`;
    const filaInvalida = filaPadron({
      nombres: 'Error CSV',
      dni: `dni-csv-${sufijo}`,
      codigo: `cod-csv-${sufijo}`,
      correo: 'correo-invalido',
      arbol,
    });
    const csv = construirCsv([[...CABECERA_PADRON], filaInvalida]);

    const importacion = await postPadron(csv, 'padron.csv', cookie);
    expect(importacion.status).toBe(201);
    const { importacion_id } = await importacion.json();

    const descarga = await getErroresCsv(importacion_id, cookie);
    expect(descarga.status).toBe(200);
    expect(descarga.headers.get('content-type')).toContain('text/csv');
    const contenido = await descarga.text();
    expect(contenido).toContain('fila,campo,motivo,valor_recibido');
    expect(contenido).toContain('correo,formato,correo-invalido');

    const inexistente = await getErroresCsv('00000000-0000-0000-0000-000000000000', cookie);
    expect(inexistente.status).toBe(404);
  });

  // R7: rol no autorizado no accede a la importación ni a la descarga del CSV.
  it('[R7] rol comite recibe 403 en POST /importaciones/padron y en GET .../errores.csv', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'comite' });
    const cookie = await loginYObtenerCookie(codigo);
    const arbol = await crearArbolCoherente();
    const fila = filaPadron({
      nombres: 'Sin Permiso',
      dni: `dni-403-${sufijoBase}`,
      codigo: `cod-403-${sufijoBase}`,
      correo: `sin-permiso-${sufijoBase}@e2e.local`,
      arbol,
    });
    const csv = construirCsv([[...CABECERA_PADRON], fila]);

    expect((await postPadron(csv, 'padron.csv', cookie)).status).toBe(403);
    expect((await getErroresCsv('00000000-0000-0000-0000-000000000000', cookie)).status).toBe(403);
    expect(await prisma.usuario.findFirst({ where: { dni: `dni-403-${sufijoBase}` } })).toBeNull();
  });

  // R7: director ejecuta el flujo completo con idéntico resultado que administrador.
  it('[R7] director importa el padrón y descarga el CSV de errores con idéntico resultado que administrador', async () => {
    const { codigo } = await crearUsuarioDirecto({ rol: 'director' });
    const cookie = await loginYObtenerCookie(codigo);
    const arbol = await crearArbolCoherente();
    const sufijo = `${sufijoBase}-${++contador}`;
    const filaValida = filaPadron({
      nombres: 'Director OK',
      dni: `dni-director-${sufijo}`,
      codigo: `cod-director-${sufijo}`,
      correo: `director-${sufijo}@e2e.local`,
      arbol,
    });
    const csv = construirCsv([[...CABECERA_PADRON], filaValida]);

    const respuesta = await postPadron(csv, 'padron.csv', cookie);
    expect(respuesta.status).toBe(201);
    const { importacion_id } = await respuesta.json();

    expect((await getErroresCsv(importacion_id, cookie)).status).toBe(200);
  });
});
