-- CreateTable
CREATE TABLE "EventoAuditoria" (
    "id" UUID NOT NULL,
    "actor_usuario_id" UUID,
    "event_type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" INET,
    "user_agent" TEXT,
    "payload" JSONB NOT NULL,

    CONSTRAINT "EventoAuditoria_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EventoAuditoria" ADD CONSTRAINT "EventoAuditoria_actor_usuario_id_fkey" FOREIGN KEY ("actor_usuario_id") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateCheck (SQL raw a mano — design.md D1/D7; Prisma no expresa CHECK en el DSL)
-- Convención de nombres de event_type, no lista cerrada (D7): un ítem posterior agrega su propio
-- literal a AuditEventType sin tocar ningún archivo de este change, siempre que cumpla la
-- convención.
ALTER TABLE "EventoAuditoria"
  ADD CONSTRAINT "eventoauditoria_event_type_convencion_chk"
  CHECK ("event_type" ~ '^[A-Z_]+$');

-- RevokePrivileges (SQL raw a mano — design.md D1/D2; append-only-audit-engine, ADR-0003)
-- `ALTER DEFAULT PRIVILEGES FOR ROLE seei_migrator` (ADR-0015) otorga SELECT/INSERT/UPDATE/DELETE
-- a seei_app en el momento del CREATE TABLE: revocar aquí, después del CREATE TABLE, es el único
-- orden correcto. TRUNCATE nunca se otorgó por privilegios por defecto — se revoca igual, de
-- forma defensiva y documental.
REVOKE UPDATE, DELETE, TRUNCATE ON "EventoAuditoria" FROM seei_app;

-- CreateFunction (SQL raw a mano — design.md D2) Función compartida por los tres triggers de
-- sentencia anti-mutación. SQLSTATE propio AU001 (PostgreSQL no usa la clase AU) para que los
-- tests distingan esta capa de la de permisos (42501) sin leer el mensaje.
CREATE OR REPLACE FUNCTION auditoria_rechazar_mutacion() RETURNS TRIGGER
LANGUAGE plpgsql AS $auditoria$
BEGIN
  RAISE EXCEPTION 'EventoAuditoria es append-only (ADR-0003): % rechazado', TG_OP
    USING ERRCODE = 'AU001';
END;
$auditoria$;

-- CreateTrigger (SQL raw a mano — design.md D2) Triggers de SENTENCIA (FOR EACH STATEMENT), no
-- de fila: rechazan incluso un UPDATE que no toca ninguna fila y cubren TRUNCATE, que solo admite
-- triggers de sentencia. El REVOKE de arriba no protege al propietario (seei_migrator); estos
-- triggers sí lo alcanzan (design.md D5) — no son ENABLE ALWAYS de forma deliberada, para que la
-- anonimización administrativa de ADR-0010 §5 siga siendo posible vía
-- session_replication_role = 'replica'.
CREATE TRIGGER "eventoauditoria_no_update_trg"   BEFORE UPDATE   ON "EventoAuditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_rechazar_mutacion();
CREATE TRIGGER "eventoauditoria_no_delete_trg"   BEFORE DELETE   ON "EventoAuditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_rechazar_mutacion();
CREATE TRIGGER "eventoauditoria_no_truncate_trg" BEFORE TRUNCATE ON "EventoAuditoria"
  FOR EACH STATEMENT EXECUTE FUNCTION auditoria_rechazar_mutacion();

-- CreateFunction (SQL raw a mano — design.md D3, ADR-0016) Verificación RECURSIVA de claves
-- prohibidas: `?` en la raíz más `jsonb_path_exists($.**.<clave>)` para anidamiento arbitrario y
-- elementos dentro de arreglos — una verificación de solo primer nivel se evade con
-- `{"detalle":{"candidato_id":...}}` (hallazgo C1, ADR-0010). SQLSTATE propio AU002.
CREATE OR REPLACE FUNCTION auditoria_rechazar_claves_eleccion() RETURNS TRIGGER
LANGUAGE plpgsql AS $auditoria$
DECLARE clave text;
BEGIN
  FOREACH clave IN ARRAY ARRAY['candidato_id','lista_id','opcion_id','blanco','eleccion'] LOOP
    IF NEW.payload ? clave
       OR jsonb_path_exists(NEW.payload, ('$.**.' || clave)::jsonpath) THEN
      RAISE EXCEPTION 'ADR-0010: el payload de % no puede contener la clave %', NEW.event_type, clave
        USING ERRCODE = 'AU002';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$auditoria$;

-- CreateTrigger (SQL raw a mano — design.md D3, ADR-0016) Trigger de FILA (FOR EACH ROW), activo
-- solo cuando event_type IN ('VOTO','RECHAZO') — la cláusula WHEN es la obligación versionada de
-- ADR-0016 para cualquier tipo de evento futuro que toque un Voto.
CREATE TRIGGER "eventoauditoria_claves_eleccion_trg" BEFORE INSERT ON "EventoAuditoria"
  FOR EACH ROW WHEN (NEW.event_type IN ('VOTO','RECHAZO'))
  EXECUTE FUNCTION auditoria_rechazar_claves_eleccion();
