import { PrismaClient } from '@prisma/client';

/**
 * [R8a] El rol de runtime (`seei_app`, expuesto vía `DATABASE_URL`) NO debe poder ejecutar DDL.
 * Requiere `infra/docker/docker-compose.test.yml` levantado con `01-roles.sql` ya aplicado
 * (ver `apps/backend/test:e2e`, que hace `up -d --wait` antes de correr esta suite).
 */
describe('Roles de Postgres — [R8a] el backend no puede correr migraciones', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Postgres rechaza CREATE TABLE con la conexión de runtime (seei_app) por falta de privilegios', async () => {
    await expect(
      prisma.$executeRawUnsafe(
        'CREATE TABLE tabla_ddl_rechazada_por_privilegios (id integer)',
      ),
    ).rejects.toThrow(/permission denied|permiso denegado/i);
  });
});
