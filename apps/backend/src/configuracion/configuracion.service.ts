import { Injectable } from '@nestjs/common';
import type { Configuracion, Prisma } from '@prisma/client';
import { AUDIT_EVENT_TYPES } from '../auditoria/audit-event-types';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfiguracionLecturaService } from './configuracion-lectura.service';
import {
  normalizarYValidarDominiosGoogle,
  validarColorHex,
  validarZonaHoraria,
} from './configuracion.errors';
import type { ActualizarConfiguracionDto } from './dto/actualizar-configuracion.dto';
import type { ConfiguracionRespuestaDto } from './dto/configuracion-respuesta.dto';

// design.md "Data Flow": campos simples que se comparan/asignan tal cual (sin normalización
// propia); `dominios_google` se maneja aparte porque necesita normalización + un evento de
// auditoría distinto (D9).
const CAMPOS_SIMPLES = [
  'nombre',
  'director',
  'color_primario',
  'color_secundario',
  'zona_horaria',
] as const;
type CampoSimple = (typeof CAMPOS_SIMPLES)[number];

function arraysIguales(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((valor, indice) => valor === b[indice]);
}

/**
 * configuracion-general, PR2 (design.md "Interfaces / Contracts", tarea 2.6). `logo_presente`/
 * `logo_mime` fijos en `false`/`null` (ver DESVIACIÓN en `dto/configuracion-respuesta.dto.ts`): el
 * schema todavía no tiene `logo`/`logo_mime` — llegan con la migración propia de PR3 (tarea 3.0).
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
    logo_presente: false,
    logo_mime: null,
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
}
