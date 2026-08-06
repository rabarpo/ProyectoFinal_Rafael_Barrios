import { Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Queue } from 'bullmq';
import { SYSTEM_PING_JOB_NAME, SYSTEM_QUEUE } from './system-ping-queue.provider';

@ApiTags('system')
@Controller('system')
export class SystemPingController {
  constructor(@Inject(SYSTEM_QUEUE) private readonly queue: Queue) {}

  @Post('ping')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Encola un trabajo "system.ping" procesado por el worker',
    description:
      'Ida y vuelta observable del walking skeleton [R5]. No toca PostgreSQL; el heartbeat ' +
      'se lee luego desde GET /health.',
  })
  @ApiResponse({ status: 202, description: 'Trabajo encolado en la cola "system"' })
  async ping(): Promise<void> {
    await this.queue.add(SYSTEM_PING_JOB_NAME, {});
  }
}
