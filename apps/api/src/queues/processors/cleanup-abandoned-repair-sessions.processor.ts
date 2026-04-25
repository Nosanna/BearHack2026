import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { RepairStatus, RepairEventType } from '@prisma/client';
import { QUEUE_NAMES } from '../queues.constants';

const ABANDON_AFTER_HOURS = 48;

@Processor(QUEUE_NAMES.CLEANUP_ABANDONED_REPAIR_SESSIONS)
export class CleanupAbandonedRepairSessionsProcessor extends WorkerHost {
  private readonly logger = new Logger(
    CleanupAbandonedRepairSessionsProcessor.name,
  );

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async process(_job: Job): Promise<{ closed: number }> {
    const cutoff = new Date(Date.now() - ABANDON_AFTER_HOURS * 60 * 60 * 1000);
    const stale = await this.prisma.repairSession.findMany({
      where: { status: RepairStatus.ACTIVE, lastActivityAt: { lt: cutoff } },
      select: { id: true },
    });

    if (stale.length === 0) return { closed: 0 };

    await this.prisma.$transaction([
      this.prisma.repairSession.updateMany({
        where: { id: { in: stale.map((s) => s.id) } },
        data: { status: RepairStatus.ABANDONED, endedAt: new Date() },
      }),
      this.prisma.repairEvent.createMany({
        data: stale.map((s) => ({
          sessionId: s.id,
          type: RepairEventType.ESCALATED,
        })),
      }),
    ]);

    this.logger.log(`Closed ${stale.length} abandoned repair sessions.`);
    return { closed: stale.length };
  }
}
