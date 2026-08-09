import { Test, TestingModule } from '@nestjs/testing';
import { ImportacionController } from './importacion.controller';
import { ImportacionModule } from './importacion.module';
import { ImportacionService } from './importacion.service';

/**
 * importacion-excel, PR2 (design.md "Testing Strategy", tarea 2.7). Runtime harness aislado del
 * módulo (`Test.createTestingModule` real, SIN registrar `ImportacionModule` en `app.module.ts`
 * todavía — eso es PR3): confirma que el grafo de DI completo (`AuthModule`, `AuditoriaModule`,
 * `UsersModule`, `AcademicoModule` → `ImportacionModule`) resuelve sin abrir Postgres/Redis reales
 * (ningún provider conecta al instanciarse, mismo gotcha D1 de `system-scaffolding` que ya cubre
 * `src/openapi.ts`).
 */
describe('ImportacionModule (wiring real, sin app.module.ts)', () => {
  it('compila y resuelve ImportacionController/ImportacionService desde el módulo real', async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [ImportacionModule],
    }).compile();

    expect(moduleRef.get(ImportacionController)).toBeInstanceOf(ImportacionController);
    expect(moduleRef.get(ImportacionService)).toBeInstanceOf(ImportacionService);

    await moduleRef.close();
  });
});
