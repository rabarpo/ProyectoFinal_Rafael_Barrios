import type { Config } from 'jest';

const config: Config = {
  rootDir: '.',
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testRegex: '(src|scripts)/.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
};

export default config;
