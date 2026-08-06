import 'reflect-metadata';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { SystemPingController } from './system-ping.controller';
import { SYSTEM_PING_JOB_NAME, SYSTEM_QUEUE } from './system-ping-queue.provider';

describe('SystemPingController', () => {
  let controller: SystemPingController;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    queue = { add: jest.fn().mockResolvedValue(undefined) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SystemPingController],
      providers: [{ provide: SYSTEM_QUEUE, useValue: queue }],
    }).compile();

    controller = moduleRef.get<SystemPingController>(SystemPingController);
  });

  it('responde 202 y encola un trabajo "system.ping" en la cola system', async () => {
    await controller.ping();

    const codigoHttp = Reflect.getMetadata(HTTP_CODE_METADATA, SystemPingController.prototype.ping);
    expect(codigoHttp).toBe(202);
    expect(queue.add).toHaveBeenCalledWith(SYSTEM_PING_JOB_NAME, expect.any(Object));
  });
});
