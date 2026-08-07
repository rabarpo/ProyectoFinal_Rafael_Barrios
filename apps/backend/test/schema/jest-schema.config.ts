import type { Config } from 'jest';

// Proyecto Jest dedicado al arnés de tests de rechazo de restricciones (base-schema-and-migrations,
// tarea 0.1). Se conecta con `pg` crudo (rol `seei_app`, vía DATABASE_URL) contra el mismo Postgres
// efímero de `docker-compose.test.yml` que ya usa `test:e2e` — sin segundo fixture (design.md, D3).
const config: Config = {
  rootDir: '../..',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testRegex: 'test/schema/.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
};

export default config;
