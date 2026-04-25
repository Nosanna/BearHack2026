import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from './queues.constants';

/**
 * Wires up repeatable jobs at boot. BullMQ deduplicates by repeat-key,
 * so it's safe to call this every time the worker starts.
 */
@Injectable()
export class QueuesScheduler implements OnModuleInit {
  private readonly logger = new Logger(QueuesScheduler.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DAILY_MAINTENANCE_SCAN)
    private readonly dailyScan: Queue,
    @InjectQueue(QUEUE_NAMES.CLEANUP_ABANDONED_REPAIR_SESSIONS)
    private readonly cleanup: Queue,
  ) {}

  async onModuleInit() {
    // 03:00 UTC every day
    await this.dailyScan.add(
      'cron',
      {},
      {
        repeat: { pattern: '0 3 * * *' },
        jobId: 'daily-maintenance-scan-cron',
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );

    // every 30 minutes
    await this.cleanup.add(
      'cron',
      {},
      {
        repeat: { pattern: '*/30 * * * *' },
        jobId: 'cleanup-abandoned-cron',
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );

    this.logger.log('Repeatable queue jobs scheduled.');
  }
}
