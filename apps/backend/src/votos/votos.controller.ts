import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import type { SesionUsuario } from '../auth/sesion-usuario';
import { ComprobanteService } from './comprobante.service';
import { ComprobanteDto } from './dto/comprobante.dto';
import { EmitirVotoDto } from './dto/emitir-voto.dto';
import { MiDerechoVotoDto } from './dto/mi-derecho-voto.dto';
import { PapeletaDto } from './dto/papeleta.dto';
import { MisDerechosService } from './mis-derechos.service';
import { PapeletaArchivosService } from './papeleta-archivos.service';
import { PapeletaService } from './papeleta.service';
import { VOTOS_ERROR_CODES } from './votos.errors';
import { VotosService } from './votos.service';

interface RequestConUsuario {
  usuario?: SesionUsuario;
}

interface RespuestaConEstado {
  status(codigo: number): void;
}

interface RespuestaConCabeceras {
  set(cabeceras: Record<string, string>): void;
}

// rediseno-boleta-votacion, PR2 (design.md D3, "Mejora deliberada"). El nombre viaja en
// `Content-Disposition` interpolado entre comillas: se sanea ANTES de interpolar (a diferencia de
// `ListasController.obtenerPlanTrabajo()`, que lo interpola crudo desde `originalname` de multer)
// porque acá la audiencia es cualquier votante — no se retro-corrige `ListasController` en este
// change (queda como hallazgo para backlog).
function sanearNombreArchivo(nombre: string): string {
  return nombre.replace(/[^\w.\- ]/g, '_');
}

// design.md threat matrix "SQL crudo parametrizado (D4)": `derecho_voto_id` viaja en el body (no
// hay `ParseUUIDPipe` de parámetro de ruta para `POST /votos`), así que el formato se valida acá,
// en el controlador, ANTES de invocar `VotosService.emitir()` — y por lo tanto antes de que se
// abra cualquier transacción (tarea 11.12). Deliberadamente NO vive dentro de `emitir()` (PR2):
// esa transacción y su suite de 19 unit tests ya está completa e indivisa (tarea 9.1) y sus casos
// usan ids no-UUID (`'dv-1'`) por diseño — moverla ahí reabriría PR2 sin necesidad.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * vote-casting, PR3 (design.md D1/D6/D10/D13, "Contratos HTTP", tareas 10.2). `POST /votos` usa
 * `@Res({passthrough:true})` (mismo patrón que `auth.controller.ts`/`candidatos.controller.ts`)
 * para distinguir `201` (esta petición creó la fila) de `200` (reintento con la misma clave o
 * colisión `23505` — ambos ya resueltos por `VotosService.emitir()`, D5/D7). El cuerpo es idéntico
 * en ambos casos, sin bandera `ya_registrado` (D6).
 */
@ApiTags('votos')
@ApiCookieAuth()
@Controller('votos')
@UseGuards(AuthGuard)
export class VotosController {
  constructor(
    private readonly papeletaService: PapeletaService,
    private readonly votosService: VotosService,
    private readonly comprobanteService: ComprobanteService,
    private readonly misDerechosService: MisDerechosService,
    private readonly papeletaArchivosService: PapeletaArchivosService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Emite el voto del derecho propio, con idempotencia y colisión UNIQUE (D5/D6/D7)' })
  @ApiBody({ type: EmitirVotoDto })
  @ApiResponse({ status: 201, description: 'Voto creado', type: ComprobanteDto })
  @ApiResponse({ status: 200, description: 'Comprobante existente (reintento o colisión, D6)', type: ComprobanteDto })
  @ApiResponse({ status: 400, description: 'Campo inválido (elección, o derecho_voto_id no-UUID)' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Derecho ajeno o inexistente' })
  @ApiResponse({ status: 409, description: 'SIN_DERECHO / VOTACION_CERRADA / ELECCION_INVALIDA' })
  async emitir(
    @Body() dto: EmitirVotoDto,
    @Req() req: RequestConUsuario,
    @Res({ passthrough: true }) res: RespuestaConEstado,
  ): Promise<ComprobanteDto> {
    if (typeof dto.derecho_voto_id !== 'string' || !UUID_REGEX.test(dto.derecho_voto_id)) {
      throw new BadRequestException({ codigo: VOTOS_ERROR_CODES.CAMPO_INVALIDO, campo: 'derecho_voto_id', motivo: 'formato' });
    }

    const resultado = await this.votosService.emitir(dto, req.usuario!);
    res.status(resultado.creado ? 201 : 200);
    return this.votosService.construirComprobante(resultado);
  }

  // descubrimiento-derechos-voto, PR1 (design.md D5/D6, tarea 2.2). Deliberadamente sin
  // `@Query()`/`@Param()`: el usuario sale SOLO de `req.usuario` (sesión), así que `?usuario_id=`
  // en la query es estructuralmente inerte — no hay forma de leerlo desde este handler (Threat
  // Matrix "IDOR / enumeración"). Sin `@Roles`: cualquier rol responde `200 []` genérico (D5).
  @Get('mis-derechos')
  @ApiOperation({ summary: 'Derechos de voto vigentes del usuario autenticado, en procesos abiertos (D1/D5)' })
  @ApiResponse({ status: 200, description: 'Listado (vacío incluido)', type: [MiDerechoVotoDto] })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  async misDerechos(@Req() req: RequestConUsuario): Promise<MiDerechoVotoDto[]> {
    return this.misDerechosService.listar(req.usuario!);
  }

  @Get('papeleta/:derechoVotoId')
  @ApiOperation({ summary: 'Lectura de la papeleta para el derecho propio (D13, no es la validación)' })
  @ApiParam({ name: 'derechoVotoId', type: String })
  @ApiResponse({ status: 200, description: 'Papeleta', type: PapeletaDto })
  @ApiResponse({ status: 400, description: 'derechoVotoId no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Derecho ajeno o inexistente' })
  async papeleta(
    @Param('derechoVotoId', ParseUUIDPipe) derechoVotoId: string,
    @Req() req: RequestConUsuario,
  ): Promise<PapeletaDto> {
    return this.papeletaService.obtener(derechoVotoId, req.usuario!);
  }

  // outbox-correo-comprobante-autenticado (#15, PR3; design.md D11, tarea 10.5). `votoId`, NO
  // `codigo_comprobante`: el código está pensado para dictarse por teléfono/imprimirse (Crockford,
  // `#14` D12) y en una URL se filtraría al historial del navegador, `Referer` y logs de acceso de
  // Caddy. La autorización vive en `ComprobanteService` (pertenencia, no secreto de la URL).
  @Get('comprobante/:votoId')
  @ApiOperation({ summary: 'Comprobante completo (con eleccion_resumen) de un voto propio, tras autenticación (D11)' })
  @ApiParam({ name: 'votoId', type: String })
  @ApiResponse({ status: 200, description: 'Comprobante', type: ComprobanteDto })
  @ApiResponse({ status: 400, description: 'votoId no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Voto ajeno o inexistente' })
  async comprobante(
    @Param('votoId', ParseUUIDPipe) votoId: string,
    @Req() req: RequestConUsuario,
  ): Promise<ComprobanteDto> {
    return this.comprobanteService.obtener(votoId, req.usuario!);
  }

  // rediseno-boleta-votacion, PR2 (design.md D3, tareas 7.1-7.4). Autorización por pertenencia
  // delegada íntegramente en `PapeletaArchivosService` (reusa `PapeletaService.obtenerOpciones()`
  // como fuente única de verdad) — mismo `403` sin cuerpo discriminante para derecho ajeno, derecho
  // inexistente, id de otro proceso, id de baja o tipo `consulta` (D9/D13 de #14). `ParseUUIDPipe`
  // en ambos params corre antes del handler, sin abrir un oráculo de enumeración (threat matrix
  // "Enrutamiento (servidor)").
  @Get('papeleta/:derechoVotoId/opciones/:id/foto')
  @ApiProduces('image/png', 'image/jpeg')
  @ApiOperation({ summary: 'Descarga la foto del candidato cabeza de lista/candidato de una opción propia (D3)' })
  @ApiParam({ name: 'derechoVotoId', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'Binario de la foto con el Content-Type persistido' })
  @ApiResponse({ status: 400, description: 'derechoVotoId o id no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Opción ajena o inexistente (mismo cuerpo para ambos casos)' })
  @ApiResponse({ status: 404, description: 'Opción propia sin foto almacenada' })
  async obtenerFotoOpcion(
    @Param('derechoVotoId', ParseUUIDPipe) derechoVotoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
    @Res({ passthrough: true }) res: RespuestaConCabeceras,
  ): Promise<StreamableFile> {
    const foto = await this.papeletaArchivosService.obtenerFoto(derechoVotoId, id, req.usuario!);

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    });

    return new StreamableFile(foto.buffer, { type: foto.mime });
  }

  @Get('papeleta/:derechoVotoId/opciones/:id/plan-trabajo')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Descarga el plan de trabajo de una opción (Lista) propia (D3)' })
  @ApiParam({ name: 'derechoVotoId', type: String })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200, description: 'PDF del plan de trabajo' })
  @ApiResponse({ status: 400, description: 'derechoVotoId o id no-UUID' })
  @ApiResponse({ status: 401, description: 'Sin cookie de sesión válida' })
  @ApiResponse({ status: 403, description: 'Opción ajena o inexistente (mismo cuerpo para ambos casos)' })
  @ApiResponse({ status: 404, description: 'Opción propia sin plan de trabajo almacenado' })
  async obtenerPlanTrabajoOpcion(
    @Param('derechoVotoId', ParseUUIDPipe) derechoVotoId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: RequestConUsuario,
    @Res({ passthrough: true }) res: RespuestaConCabeceras,
  ): Promise<StreamableFile> {
    const planTrabajo = await this.papeletaArchivosService.obtenerPlanTrabajo(derechoVotoId, id, req.usuario!);

    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
      'Content-Disposition': `attachment; filename="${sanearNombreArchivo(planTrabajo.nombre)}"`,
    });

    return new StreamableFile(planTrabajo.buffer, { type: planTrabajo.mime });
  }
}
