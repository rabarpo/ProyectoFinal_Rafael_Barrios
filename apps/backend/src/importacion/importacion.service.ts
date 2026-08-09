import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import type { Turno } from '@prisma/client';
import { ACADEMICO_ERROR_CODES } from '../academico/academico.errors';
import { MatriculasService } from '../academico/matriculas.service';
import { PrismaService } from '../prisma/prisma.service';
import { USERS_ERROR_CODES } from '../users/users.errors';
import type { DatosUsuario } from '../users/users.service';
import { UsersService } from '../users/users.service';
import type { ErrorFilaDto } from './dto/error-fila.dto';
import type { ResultadoImportacionDto } from './dto/resultado-importacion.dto';
import { IMPORTACION_ERROR_CODES, MOTIVOS_FILA, type MotivoFila } from './importacion.errors';
import { type FilaPadron, parsearFila, validarCabecera } from './padron-csv';

export interface ArchivoPadron {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

// design.md, proposal.md (Decisión de scope #4): tope de 2000 filas por archivo, margen sobre el
// rango 500-1000 estudiantes esperado por el PRD, para acotar el bloqueo del event loop del
// enfoque síncrono (D7, R1).
const LIMITE_FILAS = 2000;

/**
 * importacion-excel, PR2 (design.md D2/D3/D7, "Data Flow", tareas 2.4-2.5, spec
 * `importacion-excel`). Orquesta el flujo síncrono: parsea el archivo (`exceljs`), valida cabecera
 * y tope de filas *antes* de tocar la base (D7, R1), y por cada fila de datos encadena
 * `UsersService.crearIdempotente()` + `MatriculasService.crearIdempotente()` (spec "Idempotencia
 * por fila reutilizando los servicios existentes"). Un error de fila no aborta las demás (spec
 * "Procesamiento fila a fila sin abortar el archivo ante filas inválidas").
 *
 * "Tx compartida + excepción puntual" (corrección PR2, spec "Idempotencia por fila reutilizando
 * los servicios existentes"): `MatriculasService.resolverReferenciasAula()` resuelve la clave
 * compuesta `(grado_nombre, seccion_nombre, turno, anio_escolar_codigo)` ANTES de abrir ninguna
 * transacción. Si esa referencia no resuelve, el `Usuario` de la fila se crea igual, pero FUERA de
 * cualquier transacción (excepción puntual del escenario "Clave compuesta de Aula que no resuelve
 * a ningún Aula existente se reporta" — la Matricula ni siquiera se intenta, así que no hay tx que
 * compartir). En TODOS los demás casos (rol de Usuario inválido, coherencia jerárquica, dni/correo
 * inválido o duplicado, etc.), `UsersService.crearIdempotente()` y
 * `MatriculasService.crearIdempotente()` reciben el MISMO `tx` de una única `prisma.$transaction`
 * por fila: un fallo de cualquiera de las dos revierte ambas (MUST "misma transacción por fila").
 */
@Injectable()
export class ImportacionService {
  constructor(
    private readonly usersService: UsersService,
    private readonly matriculasService: MatriculasService,
    private readonly prisma: PrismaService,
  ) {}

  async importar(archivo: ArchivoPadron, actorId: string): Promise<ResultadoImportacionDto> {
    const filas = await this.parsearArchivo(archivo);

    if (filas.length === 0 || !validarCabecera(filas[0])) {
      throw new BadRequestException({ codigo: IMPORTACION_ERROR_CODES.CABECERA_INVALIDA });
    }

    const filasDatos = filas.slice(1);
    if (filasDatos.length > LIMITE_FILAS) {
      throw new BadRequestException({
        codigo: IMPORTACION_ERROR_CODES.LIMITE_FILAS_EXCEDIDO,
        limite: LIMITE_FILAS,
      });
    }

    const errores: ErrorFilaDto[] = [];
    let filasCreadas = 0;
    let filasExistentes = 0;

    for (let indice = 0; indice < filasDatos.length; indice++) {
      const numeroFila = indice + 1; // 1-based sobre filas de datos, sin contar la cabecera
      const { vacia, datos } = parsearFila(filasDatos[indice]);

      if (vacia || !datos) {
        errores.push({ fila: numeroFila, campo: '', motivo: MOTIVOS_FILA.FILA_VACIA, valor_recibido: '' });
        continue;
      }

      const datosUsuario: DatosUsuario = {
        nombres: datos.nombres,
        dni: datos.dni,
        codigo: datos.codigo,
        correo: datos.correo,
        rol: 'estudiante',
      };

      try {
        const referencia = await this.matriculasService.resolverReferenciasAula({
          grado_nombre: datos.grado_nombre,
          seccion_nombre: datos.seccion_nombre,
          turno: datos.turno as Turno,
          anio_escolar_codigo: datos.anio_escolar_codigo,
        });

        if (!referencia.ok) {
          // Excepción puntual de atomicidad (spec "Clave compuesta de Aula que no resuelve a
          // ningún Aula existente se reporta"): el Usuario, si es válido, sí se crea aunque la
          // Matricula no — SIN transacción compartida, porque la Matricula ni siquiera se intenta.
          await this.usersService.crearIdempotente(datosUsuario, actorId);
          throw new ConflictException({
            codigo: ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE,
            entidad: referencia.entidad,
            campo: referencia.campo,
            valor: referencia.valor,
          });
        }

        // MUST "misma transacción por fila" (spec "Idempotencia por fila reutilizando los
        // servicios existentes"): Usuario y Matricula atómicos dentro de UNA prisma.$transaction
        // compartida — cualquier fallo dentro (rol inválido, coherencia jerárquica, dni/correo
        // inválido o duplicado, etc.) revierte ambos.
        const { usuarioCreado, matriculaCreada } = await this.prisma.$transaction(async (tx) => {
          const { usuario, creado: usuarioCreado } = await this.usersService.crearIdempotente(
            datosUsuario,
            actorId,
            tx,
          );

          const { creado: matriculaCreada } = await this.matriculasService.crearIdempotente(
            {
              usuario_id: usuario.id,
              grado_nombre: datos.grado_nombre,
              seccion_nombre: datos.seccion_nombre,
              turno: datos.turno as Turno,
              anio_escolar_codigo: datos.anio_escolar_codigo,
            },
            actorId,
            tx,
          );

          return { usuarioCreado, matriculaCreada };
        });

        if (usuarioCreado || matriculaCreada) {
          filasCreadas++;
        } else {
          filasExistentes++;
        }
      } catch (error) {
        errores.push(this.mapearErrorFila(numeroFila, error, datos));
      }
    }

    return {
      importacion_id: randomUUID(),
      filas_totales: filasDatos.length,
      filas_creadas: filasCreadas,
      filas_existentes: filasExistentes,
      filas_invalidas: errores.length,
      errores,
    };
  }

  private mapearErrorFila(fila: number, error: unknown, datos: FilaPadron): ErrorFilaDto {
    const respuesta = this.extraerRespuesta(error);
    const codigo = typeof respuesta?.codigo === 'string' ? respuesta.codigo : undefined;
    const campo = typeof respuesta?.campo === 'string' ? respuesta.campo : '';

    return {
      fila,
      campo,
      motivo: this.motivoDesdeCodigo(codigo),
      valor_recibido: this.valorRecibido(campo, respuesta, datos),
    };
  }

  private motivoDesdeCodigo(codigo: string | undefined): MotivoFila {
    switch (codigo) {
      case USERS_ERROR_CODES.CAMPO_DUPLICADO:
        return MOTIVOS_FILA.CAMPO_DUPLICADO;
      case USERS_ERROR_CODES.CAMPO_INVALIDO:
        return MOTIVOS_FILA.FORMATO;
      case ACADEMICO_ERROR_CODES.REFERENCIA_INEXISTENTE:
      case ACADEMICO_ERROR_CODES.COHERENCIA_JERARQUICA:
      case ACADEMICO_ERROR_CODES.USUARIO_NO_ES_ESTUDIANTE:
        return MOTIVOS_FILA.REFERENCIA_INEXISTENTE;
      default:
        return MOTIVOS_FILA.FORMATO;
    }
  }

  private extraerRespuesta(error: unknown): Record<string, unknown> | undefined {
    if (
      error &&
      typeof error === 'object' &&
      'getResponse' in error &&
      typeof (error as { getResponse: unknown }).getResponse === 'function'
    ) {
      const respuesta = (error as { getResponse: () => unknown }).getResponse();
      return typeof respuesta === 'object' && respuesta !== null ? (respuesta as Record<string, unknown>) : undefined;
    }
    return undefined;
  }

  private valorRecibido(
    campo: string,
    respuesta: Record<string, unknown> | undefined,
    datos: FilaPadron,
  ): string {
    if (respuesta && typeof respuesta.valor === 'string') {
      return respuesta.valor;
    }
    if (campo && campo in datos) {
      return (datos as unknown as Record<string, string>)[campo];
    }
    return '';
  }

  /**
   * D3: `exceljs` lee `.xlsx` y `.csv` con la misma API de `Worksheet`. `includeEmpty: true` es
   * necesario para que una fila completamente vacía llegue al llamador en vez de ser omitida por
   * `exceljs` (spec "Fila vacía se reporta sin abortar el archivo").
   */
  private async parsearArchivo(archivo: ArchivoPadron): Promise<string[][]> {
    const esCsv = archivo.originalname.toLowerCase().endsWith('.csv') || archivo.mimetype === 'text/csv';
    const workbook = new ExcelJS.Workbook();

    const worksheet = esCsv
      ? await workbook.csv.read(Readable.from(archivo.buffer))
      : await (async () => {
          // `exceljs` declara `xlsx.load(buffer: Buffer)` contra una instancia de `@types/node`
          // duplicada en el árbol de `pnpm` (estructuralmente distinta del `Buffer` global de este
          // paquete) — `eslint-disable`-free `any` local, sin cambiar el tipo público de
          // `ArchivoPadron.buffer`.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await workbook.xlsx.load(archivo.buffer as any);
          return workbook.worksheets[0];
        })();

    if (!worksheet) {
      return [];
    }

    const filas: string[][] = [];
    worksheet.eachRow({ includeEmpty: true }, (row) => {
      const valores = (row.values as unknown[]).slice(1); // exceljs indexa desde 1; el índice 0 no se usa
      filas.push(valores.map((valor) => (valor === undefined || valor === null ? '' : String(valor))));
    });
    return filas;
  }
}
