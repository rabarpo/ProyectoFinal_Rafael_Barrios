// google-oauth-y-recuperacion, PR1 (design.md D8): interfaz mínima sin persistencia ni cola,
// usada exclusivamente por el flujo de recuperación (#5). El sistema MUST NOT escribir en
// `JobCorreo`/`Notificacion` ni leer configuración SMTP desde `Configuracion` (spec "`EmailSender`
// mínimo sin outbox") — ambas cosas quedan fuera de este módulo por diseño; el outbox real es el
// backlog #15.
export const EMAIL_SENDER = 'EMAIL_SENDER';

export interface EmailSender {
  send(destinatario: string, asunto: string, cuerpo: string): Promise<void>;
}
