import { BadRequestException, Injectable } from '@nestjs/common';
import type { Configuracion, Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionLecturaService } from './configuracion-lectura.service';
import {
  CONFIGURACION_ERROR_CODES,
  normalizarYValidarDominiosGoogle,
  validarColorHex,
  validarZonaHoraria,
} from './configuracion.errors';
import type { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';
import type { ConfiguracionRespuestaDto } from './dto/configuracion-respuesta.dto';
import type { LogoRespuestaDto } from './dto/logo-respuesta.dto';

// design.md "Data Flow": campos simples que se comparan/asignan tal cual (sin normalización
// propia); `dominios_google` se maneja aparte porque necesita normalización + un evento de
// auditoría distinto (D9).
// configuracion-general, PR4 (design.md D3, tarea 4.7): smtp_host/smtp_puerto/smtp_remitente se
// tratan como campos simples más — la contraseña SMTP nunca aparece acá (D4/D8), sigue viniendo
// de env var y `ConfiguracionEmailSender` la combina recién en `send()`.
const CAMPOS_SIMPLES = [
  'nombre',
  'director',
  'color_primario',
  'color_secundario',
  'zona_horaria',
  'smtp_host',
  'smtp_puerto',
  'smtp_remitente',
] as const;
type CampoSimple = (typeof CAMPOS_SIMPLES)[number];

function arraysIguales(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((valor, indice) => valor === b[indice]);
}

/**
 * configuracion-general, PR2 (design.md "Interfaces / Contracts", tarea 2.6); PR3 (tarea 3.5):
 * `logo_presente`/`logo_mime` ahora leen la fila real — la migración propia de PR3 (tarea 3.0) ya
 * agregó `logo`/`logo_mime`/`logo_actualizado_en` al schema. Nunca incluye los bytes del logo
 * (esos solo viajan por `GET /configuracion/logo`).
 */
function mapearConfiguracionRespuesta(fila: Configuracion): ConfiguracionRespuestaDto {
  return {
    id: fila.id,
    nombre: fila.nombre,
    director: fila.director,
    color_primario: fila.color_primario,
    color_secundario: fila.color_secundario,
    zona_horaria: fila.zona_horaria,
    dominios_google: fila.dominios_google,
    logo_presente: fila.logo != null,
    logo_mime: fila.logo_mime,
  };
}

/**
 * configuracion-general, PR2 (design.md "Data Flow"/D9, tarea 2.7). Escritura auditada del
 * singleton `Configuracion` (`clave='institucional'`). `obtener()` delega en
 * `ConfiguracionLecturaService` (D6, sin caché); `actualizar()` corre en `prisma.$transaction()`:
 * `findUniqueOrThrow` → validar (2.1-2.4) y calcular campos modificados → `update` → uno o dos
 * `auditoria.log(tx, ...)` (D9: `CONFIGURACION_ACTUALIZADA` para campos simples,
 * `CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO` con payload `antes`/`después` completo cuando cambia
 * `dominios_google`). Si `auditoria.log` falla, el error se propaga fuera del callback de
 * `$transaction` y Prisma revierte toda la transacción — ningún campo de `Configuracion` queda
 * modificado (spec "Fallo de auditoría revierte la actualización").
 */
@Injectable()
export class ConfiguracionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lectura: ConfiguracionLecturaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** GET /configuracion — spec "Lectura de la configuración institucional". */
  async obtener(): Promise<ConfiguracionRespuestaDto> {
    const fila = await this.lectura.obtener();
    return mapearConfiguracionRespuesta(
      fila ?? (await this.prisma.configuracion.findUniqueOrThrow({ where: { clave: 'institucional' } })),
    );
  }

  /**
   * PUT /configuracion — spec "Actualización auditada de la configuración institucional". Merge
   * parcial: un campo ausente en `dto` no se toca; sin cambios efectivos es un no-op (mismo
   * criterio que `AniosEscolaresService.actualizar()`, sin chequeo de unicidad aquí porque
   * `Configuracion` es un singleton).
   */
  async actualizar(dto: ActualizarConfiguracionDto, actorId: string): Promise<ConfiguracionRespuestaDto> {
    if (dto.color_primario !== undefined) {
      validarColorHex('color_primario', dto.color_primario);
    }
    if (dto.color_secundario !== undefined) {
      validarColorHex('color_secundario', dto.color_secundario);
    }
    if (dto.zona_horaria !== undefined) {
      validarZonaHoraria(dto.zona_horaria);
    }
    const dominiosNormalizados =
      dto.dominios_google !== undefined
        ? normalizarYValidarDominiosGoogle(dto.dominios_google)
        : undefined;

    const fila = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.configuracion.findUniqueOrThrow({ where: { clave: 'institucional' } });

      const data: Prisma.ConfiguracionUpdateInput = {};
      const camposSimplesModificados: CampoSimple[] = [];
      for (const campo of CAMPOS_SIMPLES) {
        const valor = dto[campo];
        if (valor !== undefined && valor !== actual[campo]) {
          data[campo] = valor;
          camposSimplesModificados.push(campo);
        }
      }

      let dominiosGoogleAntes: string[] | undefined;
      if (dominiosNormalizados !== undefined && !arraysIguales(dominiosNormalizados, actual.dominios_google)) {
        dominiosGoogleAntes = actual.dominios_google;
        data.dominios_google = dominiosNormalizados;
      }

      if (camposSimplesModificados.length === 0 && dominiosGoogleAntes === undefined) {
        return actual;
      }

      const actualizado = await tx.configuracion.update({ where: { id: actual.id }, data });

      if (camposSimplesModificados.length > 0) {
        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.CONFIGURACION_ACTUALIZADA,
          actorId,
          'Configuracion',
          actualizado.id,
          { campos: camposSimplesModificados } as Prisma.InputJsonValue,
        );
      }

      if (dominiosGoogleAntes !== undefined) {
        await this.auditoria.log(
          tx,
          AUDIT_EVENT_TYPES.CONFIGURACION_DOMINIOS_GOOGLE_ACTUALIZADO,
          actorId,
          'Configuracion',
          actualizado.id,
          { antes: dominiosGoogleAntes, despues: dominiosNormalizados } as Prisma.InputJsonValue,
        );
      }

      return actualizado;
    });

    return mapearConfiguracionRespuesta(fila);
  }

  /**
   * POST /configuracion/logo — spec "Subida de logo institucional". El `fileFilter`/`limits` del
   * `FileInterceptor` (tarea 3.3) ya descartaron formato/tamaño antes de llegar acá; esta capa
   * rechaza el único caso que ellos no pueden ver: un archivo de 0 bytes (threat matrix, tarea
   * 3.6) — antes de tocar la DB. Auditado en la misma `$transaction` que el `update` (D9), mismo
   * criterio que `actualizar()`.
   */
  async actualizarLogo(
    archivo: { buffer: Buffer; mimetype: string },
    actorId: string,
  ): Promise<LogoRespuestaDto> {
    if (archivo.buffer.length === 0) {
      throw new BadRequestException({ codigo: CONFIGURACION_ERROR_CODES.LOGO_VACIO });
    }

    const actualizado = await this.prisma.$transaction(async (tx) => {
      const actual = await tx.configuracion.findUniqueOrThrow({ where: { clave: 'institucional' } });

      const fila = await tx.configuracion.update({
        where: { id: actual.id },
        data: { logo: archivo.buffer, logo_mime: archivo.mimetype, logo_actualizado_en: new Date() },
      });

      await this.auditoria.log(
        tx,
        AUDIT_EVENT_TYPES.CONFIGURACION_LOGO_ACTUALIZADO,
        actorId,
        'Configuracion',
        fila.id,
        { campos: ['logo'] } as Prisma.InputJsonValue,
      );

      return fila;
    });

    return {
      logo_mime: actualizado.logo_mime as string,
      logo_actualizado_en: (actualizado.logo_actualizado_en as Date).toISOString(),
    };
  }

  /**
   * GET /configuracion/logo — spec "Subida de logo institucional" (servido). `null` cuando no hay
   * logo persistido; el controller traduce eso a `404` (mismo criterio que
   * `ImportacionService.obtenerCsvErrores()`/`ImportacionController.descargarErroresCsv()`).
   */
  async obtenerLogo(): Promise<{ buffer: Buffer; mime: string } | null> {
    const fila = await this.lectura.obtener();
    if (!fila?.logo || !fila.logo_mime) {
      return null;
    }
    return { buffer: fila.logo, mime: fila.logo_mime };
  }
}
