-- Aprovisionamiento de roles de Postgres (ver design.md, sección "Modelo de roles de PostgreSQL").
-- Ejecutado una única vez por el entrypoint oficial de la imagen (/docker-entrypoint-initdb.d)
-- contra POSTGRES_DB=seei, con el superusuario de bootstrap `postgres` (que ninguna aplicación usa).
--
-- Gotcha operativo: este directorio solo se ejecuta cuando el volumen de datos está vacío.
-- Modificar este archivo exige `docker compose down -v` para que vuelva a aplicarse.
--
-- `\getenv` (psql >= 14) importa las contraseñas desde las variables de entorno del contenedor
-- de Postgres hacia variables de psql, para no comitear secretos en este archivo versionado.
\getenv migrator_password SEEI_MIGRATOR_PASSWORD
\getenv app_password SEEI_APP_PASSWORD

CREATE ROLE seei_migrator LOGIN PASSWORD :'migrator_password';
CREATE ROLE seei_app      LOGIN PASSWORD :'app_password';

ALTER DATABASE seei OWNER TO seei_migrator;
ALTER SCHEMA public OWNER TO seei_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;

GRANT CONNECT ON DATABASE seei TO seei_app;
GRANT USAGE   ON SCHEMA public TO seei_app;

-- Clave: todo objeto que cree seei_migrator queda accesible para seei_app sin GRANT manual
ALTER DEFAULT PRIVILEGES FOR ROLE seei_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seei_app;
ALTER DEFAULT PRIVILEGES FOR ROLE seei_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO seei_app;
