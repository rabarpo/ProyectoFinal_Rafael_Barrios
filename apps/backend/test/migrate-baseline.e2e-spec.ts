import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * [R8b][R9] `prisma migrate deploy`, con `MIGRATION_DATABASE_URL` (rol `seei_migrator`), aplica
 * la migración baseline sin error contra una base nueva y no crea ninguna tabla de dominio.
 * Requiere `infra/docker/docker-compose.test.yml` levantado (ver `apps/backend/test:e2e`, que ya
 * corre `prisma migrate deploy` antes de esta suite — esta prueba confirma que la corrida fue
 * exitosa y que su resultado en el esquema es el esperado).
 */
describe('Migración baseline de Prisma — [R8b][R9]', () => {
  it('prisma migrate deploy corre exclusivamente con el rol migrador y no falla por permisos', () => {
    expect(() =>
      execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
        cwd: path.resolve(__dirname, '..'),
        stdio: 'pipe',
        shell: process.platform === 'win32',
      }),
    ).not.toThrow();
  });

  it('el esquema público sólo contiene la tabla de bookkeeping de Prisma, sin tablas de dominio', async () => {
    const prisma = new PrismaClient();
    try {
      const filas = await prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `;
      const nombres = filas.map((fila) => fila.table_name);

      expect(nombres).toEqual(['_prisma_migrations']);
    } finally {
      await prisma.$disconnect();
    }
  });
});
