import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';
import { QUEUE_NAMES } from '../queues.constants';

interface GeneratePlanJob {
  userId: string;
  applianceId: string;
}

const DEFAULT_TASKS_BY_TYPE: Record<string, Array<{ title: string; cadenceDays: number; description?: string; estimatedMinutes?: number }>> = {
  REFRIGERATOR: [
    { title: 'Vacuum the condenser coils', cadenceDays: 180, estimatedMinutes: 20 },
    { title: 'Replace water filter', cadenceDays: 180, estimatedMinutes: 10 },
  ],
  DISHWASHER: [
    { title: 'Clean the filter', cadenceDays: 30, estimatedMinutes: 10 },
    { title: 'Run a vinegar cycle', cadenceDays: 90, estimatedMinutes: 60 },
  ],
  WASHING_MACHINE: [
    { title: 'Clean the lint screen / filter', cadenceDays: 60, estimatedMinutes: 10 },
    { title: 'Run a clean-cycle (or hot water + vinegar)', cadenceDays: 90, estimatedMinutes: 90 },
  ],
  DRYER: [{ title: 'Clean the dryer vent', cadenceDays: 180, estimatedMinutes: 30 }],
  OVEN: [{ title: 'Run self-clean (or wipe down)', cadenceDays: 90, estimatedMinutes: 60 }],
  AIR_CONDITIONER: [
    { title: 'Replace HVAC filter', cadenceDays: 60, estimatedMinutes: 5 },
  ],
  WATER_HEATER: [{ title: 'Flush sediment from tank', cadenceDays: 365, estimatedMinutes: 90 }],
};

@Processor(QUEUE_NAMES.GENERATE_MAINTENANCE_PLAN)
export class GenerateMaintenancePlanProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateMaintenancePlanProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  override async process(job: Job<GeneratePlanJob>): Promise<{ created: number }> {
    const { userId, applianceId } = job.data;

    const appliance = await this.prisma.appliance.findFirst({
      where: { id: applianceId, ownerId: userId },
      select: { id: true, type: true },
    });
    if (!appliance) return { created: 0 };

    const template = DEFAULT_TASKS_BY_TYPE[appliance.type] ?? [];
    if (template.length === 0) return { created: 0 };

    const existing = await this.prisma.maintenanceTask.findMany({
      where: { ownerId: userId, applianceId },
      select: { title: true },
    });
    const existingTitles = new Set(existing.map((t) => t.title.toLowerCase()));

    let created = 0;
    for (const t of template) {
      if (existingTitles.has(t.title.toLowerCase())) continue;
      const dueDate = new Date(Date.now() + t.cadenceDays * 24 * 60 * 60 * 1000);
      await this.prisma.maintenanceTask.create({
        data: {
          ownerId: userId,
          applianceId,
          title: t.title,
          description: t.description ?? null,
          dueDate,
          status: TaskStatus.PENDING,
          estimatedMinutes: t.estimatedMinutes ?? null,
          cadenceDays: t.cadenceDays,
        },
      });
      created++;
    }

    this.logger.log(`Generated ${created} maintenance tasks for appliance ${applianceId}.`);
    return { created };
  }
}
