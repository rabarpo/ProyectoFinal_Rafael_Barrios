export interface paths {
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Reporta el estado real de Postgres, Redis y el último heartbeat del worker */
        get: operations["HealthController_obtenerHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/system/ping": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Encola un trabajo "system.ping" procesado por el worker
         * @description Ida y vuelta observable del walking skeleton [R5]. No toca PostgreSQL; el heartbeat se lee luego desde GET /health.
         */
        post: operations["SystemPingController_ping"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login con código de usuario y contraseña; emite cookie de sesión httpOnly */
        post: operations["AuthController_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/google": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login con Google OAuth restringido a dominios institucionales */
        post: operations["AuthController_loginGoogle"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/recovery": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Solicita un enlace de recuperación/establecimiento de contraseña */
        post: operations["AuthController_solicitarRecovery"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/recovery/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirma la recuperación con el token recibido y establece la contraseña nueva */
        post: operations["AuthController_confirmarRecovery"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Cierra la sesión activa (idempotente) y expira la cookie */
        post: operations["AuthController_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/whoami": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Devuelve la sesión autenticada actual (ejemplo de ruta protegida) */
        get: operations["AuthController_whoami"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/usuarios/bloqueados": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista las cuentas actualmente bloqueadas (panel del comité) */
        get: operations["AuthController_listarBloqueados"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/auth/usuarios/{id}/desbloquear": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Desbloquea manualmente una cuenta (panel del comité) */
        post: operations["AuthController_desbloquear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/usuarios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista usuarios, con filtro opcional por rol y estado */
        get: operations["UsersController_listar"];
        put?: never;
        /** Crea un Usuario para cualquiera de los cinco roles */
        post: operations["UsersController_crear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/usuarios/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consulta un Usuario por id */
        get: operations["UsersController_obtenerPorId"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Actualiza datos básicos de un Usuario (nunca el estado) */
        patch: operations["UsersController_actualizar"];
        trace?: never;
    };
    "/usuarios/{id}/estado": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Cambia el estado activo/inactivo de un Usuario (nunca hacia/desde bloqueado) */
        patch: operations["UsersController_cambiarEstado"];
        trace?: never;
    };
    "/usuarios/{usuarioId}/apoderados": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista los apoderados de un Usuario con rol estudiante */
        get: operations["ApoderadosController_listar"];
        put?: never;
        /** Crea un Apoderado vinculado a un Usuario con rol estudiante */
        post: operations["ApoderadosController_crear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/usuarios/{usuarioId}/apoderados/{apoderadoId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Elimina físicamente un Apoderado */
        delete: operations["ApoderadosController_eliminar"];
        options?: never;
        head?: never;
        /** Actualiza datos básicos de un Apoderado */
        patch: operations["ApoderadosController_actualizar"];
        trace?: never;
    };
    "/anios-escolares": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista años escolares, con filtro opcional por activo */
        get: operations["AniosEscolaresController_listar"];
        put?: never;
        /** Crea un AnioEscolar con activo=false */
        post: operations["AniosEscolaresController_crear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/anios-escolares/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consulta un AnioEscolar por id */
        get: operations["AniosEscolaresController_obtenerPorId"];
        put?: never;
        post?: never;
        /** Elimina físicamente un AnioEscolar sin dependientes */
        delete: operations["AniosEscolaresController_eliminar"];
        options?: never;
        head?: never;
        /** Actualiza el nombre de un AnioEscolar (nunca activo) */
        patch: operations["AniosEscolaresController_actualizar"];
        trace?: never;
    };
    "/anios-escolares/{id}/activar": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Activa un AnioEscolar, desactivando el previamente activo (idempotente) */
        patch: operations["AniosEscolaresController_activar"];
        trace?: never;
    };
    "/niveles": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista niveles */
        get: operations["NivelesController_listar"];
        put?: never;
        /** Crea un Nivel */
        post: operations["NivelesController_crear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/niveles/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consulta un Nivel por id */
        get: operations["NivelesController_obtenerPorId"];
        put?: never;
        post?: never;
        /** Elimina físicamente un Nivel sin Grado dependiente */
        delete: operations["NivelesController_eliminar"];
        options?: never;
        head?: never;
        /** Actualiza el nombre de un Nivel */
        patch: operations["NivelesController_actualizar"];
        trace?: never;
    };
    "/grados": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista grados, con filtro opcional por nivel_id */
        get: operations["GradosController_listar"];
        put?: never;
        /** Crea un Grado acotado a un Nivel existente */
        post: operations["GradosController_crear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/grados/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consulta un Grado por id */
        get: operations["GradosController_obtenerPorId"];
        put?: never;
        post?: never;
        /** Elimina físicamente un Grado sin Seccion/Aula dependiente */
        delete: operations["GradosController_eliminar"];
        options?: never;
        head?: never;
        /** Actualiza el nombre de un Grado (nunca su Nivel) */
        patch: operations["GradosController_actualizar"];
        trace?: never;
    };
    "/secciones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista secciones, con filtro opcional por grado_id y anio_escolar_id */
        get: operations["SeccionesController_listar"];
        put?: never;
        /** Crea una Seccion acotada a un Grado y un AnioEscolar existentes */
        post: operations["SeccionesController_crear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/secciones/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consulta una Seccion por id */
        get: operations["SeccionesController_obtenerPorId"];
        put?: never;
        post?: never;
        /** Elimina físicamente una Seccion sin Aula dependiente */
        delete: operations["SeccionesController_eliminar"];
        options?: never;
        head?: never;
        /** Actualiza el nombre de una Seccion (nunca su Grado/AnioEscolar) */
        patch: operations["SeccionesController_actualizar"];
        trace?: never;
    };
    "/aulas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista aulas, con filtro opcional por grado_id, seccion_id, anio_escolar_id y turno */
        get: operations["AulasController_listar"];
        put?: never;
        /** Crea un Aula acotada a un Grado, una Seccion y un AnioEscolar existentes y coherentes */
        post: operations["AulasController_crear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/aulas/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consulta un Aula por id */
        get: operations["AulasController_obtenerPorId"];
        put?: never;
        post?: never;
        /** Elimina físicamente un Aula sin Matricula/ProcesoAula dependiente */
        delete: operations["AulasController_eliminar"];
        options?: never;
        head?: never;
        /** Actualiza el turno de un Aula (nunca su Grado/Seccion/AnioEscolar) */
        patch: operations["AulasController_actualizar"];
        trace?: never;
    };
    "/matriculas": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista matrículas, con filtro opcional por usuario_id, aula_id y anio_escolar_id */
        get: operations["MatriculasController_listar"];
        put?: never;
        /** Matricula un Usuario con rol estudiante en un Aula y AnioEscolar existentes y coherentes */
        post: operations["MatriculasController_crear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/matriculas/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consulta una Matricula por id */
        get: operations["MatriculasController_obtenerPorId"];
        put?: never;
        post?: never;
        /** Elimina físicamente una Matricula (retiro/traslado) */
        delete: operations["MatriculasController_eliminar"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/importaciones/padron": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Importa el padrón de Usuario+Matricula desde un archivo .xlsx/.csv */
        post: operations["ImportacionController_importarPadron"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/importaciones/{id}/errores.csv": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Descarga el CSV de errores de una importación (fila, campo, motivo, valor_recibido) */
        get: operations["ImportacionController_descargarErroresCsv"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/configuracion": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Consulta la configuración institucional */
        get: operations["ConfiguracionController_obtener"];
        /** Actualiza la configuración institucional (merge parcial, auditado) */
        put: operations["ConfiguracionController_actualizar"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/configuracion/comite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista los usuarios con rol comite */
        get: operations["ConfiguracionController_listarComite"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/configuracion/logo": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Descarga el logo institucional */
        get: operations["ConfiguracionController_obtenerLogo"];
        put?: never;
        /** Sube el logo institucional (PNG/JPG/SVG, máximo 2 MB) */
        post: operations["ConfiguracionController_subirLogo"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/procesos/padron": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Calcula el padrón en vivo para una segmentación, sin persistir nada */
        post: operations["ProcesosController_padron"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/procesos": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Lista procesos electorales, filtrable por estado y tipo */
        get: operations["ProcesosController_listar"];
        put?: never;
        /** Crea un ProcesoElectoral en borrador, con lote de ProcesoAula (D3/D6) */
        post: operations["ProcesosController_crear"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/procesos/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Detalle de un proceso electoral, incluido su ProcesoAula[] */
        get: operations["ProcesosController_detalle"];
        put?: never;
        post?: never;
        /** Elimina físicamente un proceso en borrador (cascada a ProcesoAula) */
        delete: operations["ProcesosController_eliminar"];
        options?: never;
        head?: never;
        /** Edita un proceso en borrador, sin límite de reintentos (D3) */
        patch: operations["ProcesosController_editar"];
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        LoginDto: {
            /**
             * @description Código institucional único del usuario
             * @example seed-comite
             */
            codigo: string;
            /** @description Contraseña en texto plano (nunca persistida ni auditada) */
            password: string;
        };
        MensajeDto: {
            /**
             * @description Mensaje descriptivo del resultado de la operación
             * @example Login exitoso
             */
            mensaje: string;
        };
        GoogleLoginDto: {
            /** @description ID token de Google emitido tras el login OAuth en el cliente */
            idToken: string;
            /** @description Contraseña actual, requerida solo para confirmar la vinculación de una cuenta existente con password_hash */
            password?: string;
        };
        SesionUsuarioDto: {
            /** @description ID del usuario autenticado */
            userId: string;
            /**
             * @description Rol del usuario autenticado
             * @enum {string}
             */
            rol: "administrador" | "director" | "comite" | "docente" | "estudiante";
            /** @description Timestamp Unix (segundos) de creación de la sesión */
            creadoEn: number;
        };
        UsuarioBloqueadoDto: {
            /** @description ID del usuario bloqueado */
            id: string;
            /** @description Nombres completos del usuario */
            nombres: string;
            /** @description DNI del usuario */
            dni: string;
            /** @description Código institucional único del usuario */
            codigo: string;
            /** @description Fin del bloqueo (ISO 8601); null si el bloqueo es indefinido */
            bloqueado_hasta: string | null;
        };
        UsuarioRespuestaDto: {
            /** @description ID del usuario */
            id: string;
            /** @description Nombres completos */
            nombres: string;
            /** @description DNI */
            dni: string;
            /** @description Código institucional único */
            codigo: string;
            /** @description Correo electrónico */
            correo: string;
            /**
             * @description Rol del usuario
             * @enum {string}
             */
            rol: "estudiante" | "docente" | "comite" | "administrador" | "director";
            /**
             * @description Estado del usuario
             * @enum {string}
             */
            estado: "activo" | "inactivo" | "bloqueado";
            /** @description Fecha de creación (ISO 8601) */
            creado_en: string;
        };
        ApoderadoRespuestaDto: {
            /** @description ID del apoderado */
            id: string;
            /** @description Nombres completos del apoderado */
            nombres: string;
            /** @description DNI del apoderado */
            dni: string;
            /** @description Correo de contacto del apoderado */
            correo: string | null;
        };
        AnioEscolarRespuestaDto: {
            /** @description ID del año escolar */
            id: string;
            /** @description Nombre único del año escolar */
            nombre: string;
            /** @description Indica si es el año escolar activo */
            activo: boolean;
        };
        NivelRespuestaDto: {
            /** @description ID del nivel */
            id: string;
            /** @description Nombre único del nivel */
            nombre: string;
        };
        GradoRespuestaDto: {
            /** @description ID del grado */
            id: string;
            /** @description Nombre del grado, único dentro de su Nivel */
            nombre: string;
            /** @description ID del Nivel al que pertenece el grado */
            nivel_id: string;
        };
        SeccionRespuestaDto: {
            /** @description ID de la sección */
            id: string;
            /** @description Nombre de la sección, único dentro de (grado_id, anio_escolar_id) */
            nombre: string;
            /** @description ID del Grado al que pertenece la sección */
            grado_id: string;
            /** @description ID del AnioEscolar al que pertenece la sección */
            anio_escolar_id: string;
        };
        AulaRespuestaDto: {
            /** @description ID del aula */
            id: string;
            /**
             * @description Turno del aula
             * @enum {string}
             */
            turno: "manana" | "tarde";
            /** @description ID del Grado al que pertenece el aula */
            grado_id: string;
            /** @description ID de la Seccion a la que pertenece el aula */
            seccion_id: string;
            /** @description ID del AnioEscolar al que pertenece el aula */
            anio_escolar_id: string;
        };
        MatriculaRespuestaDto: {
            /** @description ID de la matrícula */
            id: string;
            /** @description ID del Usuario (estudiante) matriculado */
            usuario_id: string;
            /** @description ID del Aula en la que está matriculado */
            aula_id: string;
            /** @description ID del AnioEscolar de la matrícula */
            anio_escolar_id: string;
        };
        ErrorFilaDto: {
            /** @description Número de fila de datos (1-based, sin contar la cabecera) */
            fila: number;
            /** @description Campo afectado dentro de la fila */
            campo: string;
            /**
             * @description Motivo del error
             * @enum {string}
             */
            motivo: "fila_vacia" | "formato" | "campo_duplicado" | "referencia_inexistente";
            /** @description Valor recibido que causó el error */
            valor_recibido: string;
        };
        ResultadoImportacionDto: {
            /** @description ID de la importación */
            importacion_id: string;
            /** @description Total de filas de datos procesadas (sin contar la cabecera) */
            filas_totales: number;
            /** @description Filas cuyo Usuario y/o Matricula se crearon en esta importación */
            filas_creadas: number;
            /** @description Filas cuyo Usuario y Matricula ya existían (idempotencia) */
            filas_existentes: number;
            /** @description Filas inválidas (ver detalle en errores) */
            filas_invalidas: number;
            /** @description Detalle de errores por fila */
            errores: components["schemas"]["ErrorFilaDto"][];
        };
        ConfiguracionRespuestaDto: {
            /** @description ID de la fila de configuración */
            id: string;
            /** @description Nombre de la institución */
            nombre?: string | null;
            /** @description Nombre del director o directora */
            director?: string | null;
            /** @description Color primario en formato hex */
            color_primario?: string | null;
            /** @description Color secundario en formato hex */
            color_secundario?: string | null;
            /** @description Zona horaria IANA */
            zona_horaria?: string | null;
            /** @description Dominios Google Workspace permitidos */
            dominios_google: string[];
            /** @description Si hay un logo institucional persistido */
            logo_presente: boolean;
            /** @description MIME type del logo persistido, si existe */
            logo_mime?: string | null;
        };
        LogoRespuestaDto: {
            /** @description MIME type persistido del logo (image/png, image/jpeg o image/svg+xml) */
            logo_mime: string;
            /** @description Fecha/hora en que se persistió el logo (ISO 8601) */
            logo_actualizado_en: string;
        };
        SegmentacionDto: {
            /**
             * @description Público objetivo del proceso
             * @enum {string}
             */
            publico_objetivo: "estudiantes" | "padres" | "comunidad";
            /**
             * @description Alcance de la segmentación
             * @enum {string}
             */
            alcance: "institucion" | "nivel" | "grados" | "aulas";
            /** @description ID de Nivel, requerido cuando alcance = nivel */
            nivel_id?: string;
            /** @description IDs de Grado, requeridos cuando alcance = grados */
            grado_ids?: string[];
            /** @description IDs de Aula, requeridos cuando alcance = aulas */
            aula_ids?: string[];
        };
        PadronAulaDto: {
            /** @description ID del Aula */
            aula_id: string;
            /** @description Cuenta de estudiantes con matrícula activa en el aula */
            estudiantes: number;
            /** @description Cuenta de estudiantes con Apoderado registrado en el aula (ADR-0011) */
            padres: number;
            /** @description Derechos de voto derivados del aula según publico_objetivo */
            derechos: number;
        };
        PadronRespuestaDto: {
            /** @description Total de derechos de voto (con doble derecho de comunidad ya sumado) */
            derechos_totales: number;
            /** @description Total de estudiantes elegibles */
            estudiantes: number;
            /** @description Total de cuentas de estudiante con Apoderado registrado */
            padres: number;
            /** @description Cuentas de Usuario distintas involucradas en el conteo */
            cuentas_distintas: number;
            /** @description Desglose por aula elegible */
            aulas: components["schemas"]["PadronAulaDto"][];
            /** @description Aulas del alcance resuelto excluidas por no tener matrícula activa */
            aulas_excluidas: string[];
            /**
             * @description Presente cuando cuentas_distintas < estudiantes (matrícula duplicada del mismo año escolar)
             * @enum {string}
             */
            aviso?: "MATRICULA_DUPLICADA";
        };
        CrearProcesoDto: {
            /**
             * @description Público objetivo del proceso
             * @enum {string}
             */
            publico_objetivo: "estudiantes" | "padres" | "comunidad";
            /**
             * @description Alcance de la segmentación
             * @enum {string}
             */
            alcance: "institucion" | "nivel" | "grados" | "aulas";
            /** @description ID de Nivel, requerido cuando alcance = nivel */
            nivel_id?: string;
            /** @description IDs de Grado, requeridos cuando alcance = grados */
            grado_ids?: string[];
            /** @description IDs de Aula, requeridos cuando alcance = aulas */
            aula_ids?: string[];
            /** @description Nombre del proceso electoral */
            nombre: string;
            /** @description Descripción del proceso */
            descripcion?: string;
            /**
             * @description Tipo de proceso electoral
             * @enum {string}
             */
            tipo: "municipio" | "representante_aula" | "padres" | "consulta";
            /** @description Fecha/hora prevista de apertura (ISO-8601) */
            fecha_apertura_prevista: string;
            /** @description Fecha/hora prevista de cierre (ISO-8601), MUST ser posterior a la apertura */
            fecha_cierre_prevista: string;
            /** @description Pre-marcado por el asistente (D7); si se omite, persiste el default del schema (false) */
            ocultar_resultados?: boolean;
        };
        ProcesoRespuestaDto: {
            /** @description ID del proceso electoral */
            id: string;
            /** @description Nombre del proceso */
            nombre: string;
            /** @description Descripción del proceso */
            descripcion?: string;
            /**
             * @description Tipo de proceso electoral
             * @enum {string}
             */
            tipo: "municipio" | "representante_aula" | "padres" | "consulta";
            /**
             * @description Estado del proceso
             * @enum {string}
             */
            estado: "borrador" | "abierto" | "cerrado" | "acta_emitida";
            /** @description Fecha/hora prevista de apertura (ISO-8601) */
            fecha_apertura_prevista: string;
            /** @description Fecha/hora prevista de cierre (ISO-8601) */
            fecha_cierre_prevista: string;
            /** @description Pre-marcado por el asistente (D7); default del schema false */
            ocultar_resultados: boolean;
            /**
             * @description Público objetivo del proceso
             * @enum {string}
             */
            publico_objetivo: "estudiantes" | "padres" | "comunidad";
            /**
             * @description Alcance de la segmentación
             * @enum {string}
             */
            alcance: "institucion" | "nivel" | "grados" | "aulas";
            /** @description Snapshot del Nivel elegido cuando alcance = nivel */
            nivel_id_snapshot?: string;
            /** @description Snapshot de los Grado elegidos cuando alcance = grados */
            grado_ids_snapshot: string[];
            /** @description IDs de Aula con ProcesoAula creado */
            aulas: string[];
            /** @description IDs de Aula del alcance resuelto excluidas por no tener matrícula activa */
            aulas_excluidas: string[];
        };
        ProcesoDetalleRespuestaDto: {
            /** @description ID del proceso electoral */
            id: string;
            /** @description Nombre del proceso */
            nombre: string;
            /** @description Descripción del proceso */
            descripcion?: string;
            /**
             * @description Tipo de proceso electoral
             * @enum {string}
             */
            tipo: "municipio" | "representante_aula" | "padres" | "consulta";
            /**
             * @description Estado del proceso
             * @enum {string}
             */
            estado: "borrador" | "abierto" | "cerrado" | "acta_emitida";
            /** @description Fecha/hora prevista de apertura (ISO-8601) */
            fecha_apertura_prevista: string;
            /** @description Fecha/hora prevista de cierre (ISO-8601) */
            fecha_cierre_prevista: string;
            /** @description Pre-marcado por el asistente (D7); default del schema false */
            ocultar_resultados: boolean;
            /**
             * @description Público objetivo del proceso
             * @enum {string}
             */
            publico_objetivo: "estudiantes" | "padres" | "comunidad";
            /**
             * @description Alcance de la segmentación
             * @enum {string}
             */
            alcance: "institucion" | "nivel" | "grados" | "aulas";
            /** @description Snapshot del Nivel elegido cuando alcance = nivel */
            nivel_id_snapshot?: string;
            /** @description Snapshot de los Grado elegidos cuando alcance = grados */
            grado_ids_snapshot: string[];
            /** @description IDs de Aula con ProcesoAula creado */
            aulas: string[];
            /** @description IDs de Aula del alcance resuelto excluidas por no tener matrícula activa */
            aulas_excluidas: string[];
        };
        ActualizarProcesoDto: {
            /**
             * @description Público objetivo del proceso
             * @enum {string}
             */
            publico_objetivo: "estudiantes" | "padres" | "comunidad";
            /**
             * @description Alcance de la segmentación
             * @enum {string}
             */
            alcance: "institucion" | "nivel" | "grados" | "aulas";
            /** @description ID de Nivel, requerido cuando alcance = nivel */
            nivel_id?: string;
            /** @description IDs de Grado, requeridos cuando alcance = grados */
            grado_ids?: string[];
            /** @description IDs de Aula, requeridos cuando alcance = aulas */
            aula_ids?: string[];
            /** @description Nombre del proceso electoral */
            nombre?: string;
            /** @description Descripción del proceso */
            descripcion?: string;
            /** @description Fecha/hora prevista de apertura (ISO-8601) */
            fecha_apertura_prevista?: string;
            /** @description Fecha/hora prevista de cierre (ISO-8601) */
            fecha_cierre_prevista?: string;
            /** @description Pre-marcado del asistente (D7) */
            ocultar_resultados?: boolean;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    HealthController_obtenerHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Estado agregado del walking skeleton (puede ser "degradado") */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SystemPingController_ping: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Trabajo encolado en la cola "system" */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_login: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginDto"];
            };
        };
        responses: {
            /** @description Login exitoso, cookie seei_session emitida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MensajeDto"];
                };
            };
            /** @description Credenciales inválidas */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_loginGoogle: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GoogleLoginDto"];
            };
        };
        responses: {
            /** @description Login exitoso, cookie seei_session emitida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MensajeDto"];
                };
            };
            /** @description Credenciales inválidas */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Vinculación requerida: reenviar con la contraseña actual confirmada */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_solicitarRecovery: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Solicitud recibida (respuesta uniforme, no revela si el correo existe) */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_confirmarRecovery: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Contraseña actualizada, sesiones revocadas */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Enlace inválido o expirado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Logout procesado */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_whoami: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Sesión válida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SesionUsuarioDto"];
                };
            };
            /** @description Sin cookie de sesión o sesión inexistente/expirada */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_listarBloqueados: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado de cuentas bloqueadas */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsuarioBloqueadoDto"][];
                };
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de comite */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AuthController_desbloquear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Desbloqueo procesado (idempotente) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de comite */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Usuario no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    UsersController_listar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado de usuarios */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsuarioRespuestaDto"][];
                };
            };
            /** @description Filtro rol/estado desconocido */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    UsersController_crear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Usuario creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsuarioRespuestaDto"];
                };
            };
            /** @description Campo inválido (dni/correo) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description DNI/código/correo duplicado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    UsersController_obtenerPorId: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Usuario encontrado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsuarioRespuestaDto"];
                };
            };
            /** @description id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Usuario no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    UsersController_actualizar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Usuario actualizado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsuarioRespuestaDto"];
                };
            };
            /** @description Campo inválido (dni/correo) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Usuario no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description DNI/código/correo duplicado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    UsersController_cambiarEstado: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Estado actualizado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Estado destino no permitido */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Usuario no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Transición desde bloqueado no permitida */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ApoderadosController_listar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado de apoderados */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApoderadoRespuestaDto"][];
                };
            };
            /** @description Usuario no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description El Usuario referenciado no es estudiante */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ApoderadosController_crear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Apoderado creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApoderadoRespuestaDto"];
                };
            };
            /** @description Usuario no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description El Usuario referenciado no es estudiante */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ApoderadosController_eliminar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Apoderado eliminado */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Usuario o Apoderado no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description El Usuario referenciado no es estudiante */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ApoderadosController_actualizar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Apoderado actualizado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ApoderadoRespuestaDto"];
                };
            };
            /** @description Usuario o Apoderado no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description El Usuario referenciado no es estudiante */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AniosEscolaresController_listar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado de años escolares */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnioEscolarRespuestaDto"][];
                };
            };
            /** @description Filtro activo desconocido */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AniosEscolaresController_crear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description AnioEscolar creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnioEscolarRespuestaDto"];
                };
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Nombre duplicado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AniosEscolaresController_obtenerPorId: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description AnioEscolar encontrado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnioEscolarRespuestaDto"];
                };
            };
            /** @description id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description AnioEscolar no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AniosEscolaresController_eliminar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description AnioEscolar eliminado */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description AnioEscolar no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Existen Seccion/Aula/Matricula/Configuracion dependientes */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AniosEscolaresController_actualizar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description AnioEscolar actualizado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AnioEscolarRespuestaDto"];
                };
            };
            /** @description AnioEscolar no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Nombre duplicado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AniosEscolaresController_activar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description AnioEscolar activado (o ya estaba activo, cambio=false) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description AnioEscolar no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Activación concurrente sobre el índice único parcial */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NivelesController_listar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado de niveles */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NivelRespuestaDto"][];
                };
            };
        };
    };
    NivelesController_crear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Nivel creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NivelRespuestaDto"];
                };
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Nombre duplicado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NivelesController_obtenerPorId: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Nivel encontrado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NivelRespuestaDto"];
                };
            };
            /** @description id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Nivel no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NivelesController_eliminar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Nivel eliminado */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Nivel no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Existe Grado dependiente */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    NivelesController_actualizar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Nivel actualizado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["NivelRespuestaDto"];
                };
            };
            /** @description Nivel no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Nombre duplicado */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    GradosController_listar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado de grados */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GradoRespuestaDto"][];
                };
            };
            /** @description nivel_id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    GradosController_crear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Grado creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GradoRespuestaDto"];
                };
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Nivel inexistente o nombre duplicado dentro del Nivel */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    GradosController_obtenerPorId: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Grado encontrado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GradoRespuestaDto"];
                };
            };
            /** @description id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Grado no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    GradosController_eliminar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Grado eliminado */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Grado no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Existe Seccion o Aula dependiente */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    GradosController_actualizar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Grado actualizado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GradoRespuestaDto"];
                };
            };
            /** @description Grado no encontrado */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Nombre duplicado dentro del Nivel */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SeccionesController_listar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado de secciones */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeccionRespuestaDto"][];
                };
            };
            /** @description grado_id/anio_escolar_id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SeccionesController_crear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seccion creada */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeccionRespuestaDto"];
                };
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Grado/AnioEscolar inexistente o nombre duplicado dentro de la combinación */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SeccionesController_obtenerPorId: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seccion encontrada */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeccionRespuestaDto"];
                };
            };
            /** @description id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Seccion no encontrada */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SeccionesController_eliminar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seccion eliminada */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Seccion no encontrada */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Existe Aula dependiente */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    SeccionesController_actualizar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Seccion actualizada */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SeccionRespuestaDto"];
                };
            };
            /** @description Seccion no encontrada */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Nombre duplicado dentro de la combinación */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AulasController_listar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado de aulas */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AulaRespuestaDto"][];
                };
            };
            /** @description Filtro malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AulasController_crear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Aula creada */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AulaRespuestaDto"];
                };
            };
            /** @description turno fuera de {manana, tarde} */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Grado/Seccion/AnioEscolar inexistente, combinación duplicada o incoherencia jerárquica */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AulasController_obtenerPorId: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Aula encontrada */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AulaRespuestaDto"];
                };
            };
            /** @description id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Aula no encontrada */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AulasController_eliminar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Aula eliminada */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Aula no encontrada */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Existe Matricula o ProcesoAula dependiente */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    AulasController_actualizar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Aula actualizada */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["AulaRespuestaDto"];
                };
            };
            /** @description turno fuera de {manana, tarde} */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Aula no encontrada */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    MatriculasController_listar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado de matrículas */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MatriculaRespuestaDto"][];
                };
            };
            /** @description Filtro malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    MatriculasController_crear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Matricula creada */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MatriculaRespuestaDto"];
                };
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Usuario/Aula/AnioEscolar inexistente, rol distinto de estudiante, combinación duplicada o incoherencia jerárquica */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    MatriculasController_obtenerPorId: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Matricula encontrada */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MatriculaRespuestaDto"];
                };
            };
            /** @description id malformado */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Matricula no encontrada */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    MatriculasController_eliminar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Matricula eliminada */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Matricula no encontrada */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ImportacionController_importarPadron: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Resultado de la importación */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ResultadoImportacionDto"];
                };
            };
            /** @description Cabecera inválida, archivo excede 2000 filas, extensión no permitida o archivo ausente */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ImportacionController_descargarErroresCsv: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                /** @description importacion_id devuelto por POST /importaciones/padron */
                id: unknown;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Archivo CSV de errores (BOM UTF-8, RFC 4180) */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Importación inexistente o reporte expirado (TTL 24h) */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ConfiguracionController_obtener: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Configuración institucional */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfiguracionRespuestaDto"];
                };
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ConfiguracionController_actualizar: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Configuración actualizada */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ConfiguracionRespuestaDto"];
                };
            };
            /** @description Campo inválido (color, zona horaria o dominio) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ConfiguracionController_listarComite: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Integrantes del comité */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsuarioRespuestaDto"][];
                };
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ConfiguracionController_obtenerLogo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Binario del logo con el Content-Type persistido */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description No hay logo institucional persistido */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ConfiguracionController_subirLogo: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Logo persistido */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["LogoRespuestaDto"];
                };
            };
            /** @description Formato no permitido, archivo vacío, excede 2 MB o ausente */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProcesosController_padron: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SegmentacionDto"];
            };
        };
        responses: {
            /** @description Padrón calculado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PadronRespuestaDto"];
                };
            };
            /** @description Campo inválido */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director/comite */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Referencia inexistente, segmentación inválida o sin año escolar activo */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProcesosController_listar: {
        parameters: {
            query?: {
                tipo?: "municipio" | "representante_aula" | "padres" | "consulta";
                estado?: "borrador" | "abierto" | "cerrado" | "acta_emitida";
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Listado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProcesoRespuestaDto"][];
                };
            };
            /** @description Campo inválido (filtro fuera del enum) */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director/comite */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProcesosController_crear: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CrearProcesoDto"];
            };
        };
        responses: {
            /** @description Proceso creado */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProcesoRespuestaDto"];
                };
            };
            /** @description Campo inválido */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director/comite */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Referencia inexistente, segmentación inválida, sin elegibles o sin año escolar activo */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProcesosController_detalle: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Detalle */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProcesoDetalleRespuestaDto"];
                };
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director/comite */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Proceso inexistente */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProcesosController_eliminar: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Proceso eliminado */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director/comite */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Proceso inexistente */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Proceso no editable (estado != borrador) */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    ProcesosController_editar: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ActualizarProcesoDto"];
            };
        };
        responses: {
            /** @description Proceso actualizado */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProcesoRespuestaDto"];
                };
            };
            /** @description Campo inválido */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Sin cookie de sesión válida */
            401: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Rol distinto de administrador/director/comite */
            403: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Proceso inexistente */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Referencia inexistente, segmentación inválida, sin elegibles, proceso no editable o sin año escolar activo */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
}
