import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_NAMES } from '../queues.constants';
import { NotificationKind } from '@prisma/client';

interface SendNotificationJob {
  userId: string;
  kind: keyof typeof NotificationKind;
  title: string;
  body: string;
  refId?: string;
}

/**
 * In-app notification only (push/email TBD). The mobile app polls /dashboard/home
 * which surfaces unread notifications.
 */
@Processor(QUEUE_NAMES.SEND_NOTIFICATIONS)
export class SendNotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(SendNotificationsProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async process(job: Job<SendNotificationJob>): Promise<void> {
    const { userId, kind, title, body, refId } = job.data;
    await this.prisma.notification.create({
      data: {
        userId,
        kind: NotificationKind[kind],
        title,
        body,
        refId: refId ?? null,
      },
    });
    this.logger.log(`Notified user ${userId}: ${kind} — ${title}`);
  }
}
