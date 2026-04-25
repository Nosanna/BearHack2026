import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queues.constants';
import { TaskStatus } from '@prisma/client';

/**
 * Runs once per day (scheduled by QueuesScheduler) and:
 * 1) marks overdue tasks
 * 2) enqueues notifications for tasks due in <= 24h
 */
@Processor(QUEUE_NAMES.DAILY_MAINTENANCE_SCAN)
export class DailyMaintenanceScanProcessor extends WorkerHost {
  private readonly logger = new Logger(DailyMaintenanceScanProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.SEND_NOTIFICATIONS) private readonly notify: Queue,
  ) {
    super();
  }

  override async process(_job: Job): Promise<{ overdue: number; soon: number }> {
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const overdueResult = await this.prisma.maintenanceTask.updateMany({
      where: {
        dueDate: { lt: now },
        status: { in: [TaskStatus.PENDING, TaskStatus.IN_PROGRESS] },
      },
      data: { status: TaskStatus.OVERDUE },
    });

    const dueSoon = await this.prisma.maintenanceTask.findMany({
      where: {
        dueDate: { gte: now, lte: soon },
        status: TaskStatus.PENDING,
      },
      select: { id: true, ownerId: true, title: true },
    });

    for (const t of dueSoon) {
      await this.notify.add(
        'task-due',
        {
          userId: t.ownerId,
          kind: 'TASK_DUE',
          title: 'Maintenance task coming up',
          body: `“${t.title}” is due within 24 hours.`,
          refId: t.id,
        },
        { removeOnComplete: 100, removeOnFail: 50, attempts: 3 },
      );
    }

    this.logger.log(
      `Daily scan: marked ${overdueResult.count} overdue, queued ${dueSoon.length} due-soon notifications.`,
    );
    return { overdue: overdueResult.count, soon: dueSoon.length };
  }
}
