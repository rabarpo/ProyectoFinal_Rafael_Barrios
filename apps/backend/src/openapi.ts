import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Extractor de contrato OpenAPI ejecutado con `tsx`, sin `app.listen()` (design.md, decisión D1).
 *
 * `NestFactory.create()` sí ejecuta los hooks `onModuleInit` del árbol de módulos, por eso
 * `PrismaService` (sin `$connect()` en `onModuleInit`) y el cliente `ioredis`
 * (`lazyConnect: true`) están configurados para no abrir conexión real aquí: esta extracción
 * debe poder correr en CI sin Postgres ni Redis vivos.
 */
async function extraerOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('SEEI API')
    .setDescription('Walking skeleton del sistema SEEI (#1)')
    .setVersion('0.0.0')
    .addTag('health')
    .addTag('system')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  mkdirSync('dist-openapi', { recursive: true });
  writeFileSync('dist-openapi/openapi.json', JSON.stringify(document, null, 2));

  await app.close();
}

extraerOpenApi()
  .then(() => {
    // Salida explícita: el cliente `ioredis` (`lazyConnect: true`) y el productor BullMQ
    // dejan handles de socket abiertos que `app.close()` no cierra (nunca se les llamó
    // `.connect()` en este script), así que el proceso no terminaría solo.
    process.exit(0);
  })
  .catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  });
