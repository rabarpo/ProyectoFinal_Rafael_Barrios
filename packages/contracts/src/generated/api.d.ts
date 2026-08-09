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
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
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
        requestBody?: never;
        responses: {
            /** @description Login exitoso, cookie seei_session emitida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
        requestBody?: never;
        responses: {
            /** @description Login exitoso, cookie seei_session emitida */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
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
                content?: never;
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
}
