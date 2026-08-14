import { Injectable } from '@nestjs/common';

// vote-casting, PR1 (design.md D2-D5/D7/D8/D10/D12/D16, tarea 1.1). Stub vacío deliberado: el
// método `emitir()` que implementa la garantía transaccional completa (validación + `UNIQUE` +
// idempotencia, indivisibles por la restricción de no-descomposición del BACKLOG) llega en PR2
// (tasks.md Phase 6-9), sobre esta misma clase — nunca se re-registra el módulo. Se declara ya en
// `VotosModule` para que el grafo de DI quede estable entre PR1 y PR2.
@Injectable()
export class VotosService {}
