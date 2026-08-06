import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Conexión perezosa: Prisma abre la conexión real en la primera consulta,
 * NUNCA en `onModuleInit`. Esto permite que `src/openapi.ts` (item 1.11)
 * instancie `AppModule` sin Postgres vivo (gotcha D1 de design.md).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
