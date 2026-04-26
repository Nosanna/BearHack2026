import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RoomsService } from '../rooms/rooms.service';
import { QUEUE_NAMES } from '../../queues/queues.constants';
import { toMaintenanceTaskDto } from '../../common/mappers/maintenance-task.mapper';
import { MediaService } from '../media/media.service';
import type {
  ApplianceDetailDto,
  ApplianceDto,
  ApplianceType,
  AnalyzeApplianceFromImageResponse,
  CreateApplianceResponse,
  MaintenanceTaskDto,
  RegisterFromImageResponse,
} from '@fixit/shared';
import type { Appliance } from '@prisma/client';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class AppliancesService {
  private readonly logger = new Logger(AppliancesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly rooms: RoomsService,
    private readonly media: MediaService,
    @InjectQueue(QUEUE_NAMES.GENERATE_MAINTENANCE_PLAN)
    private readonly maintenanceQueue: Queue,
  ) {}

  async listForUser(userId: string, roomId?: string): Promise<ApplianceDto[]> {
    const [items, taskCounts] = await Promise.all([
      this.prisma.appliance.findMany({
      where: { ownerId: userId, ...(roomId ? { roomId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        images: { where: { isPrimary: true }, take: 1, orderBy: { createdAt: 'desc' } },
      },
      }),
      this.prisma.maintenanceTask.groupBy({
        by: ['applianceId'],
        where: {
          ownerId: userId,
          status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
          ...(roomId ? { appliance: { roomId } } : {}),
        },
        _count: { _all: true },
      }),
    ]);

    const applianceToCount = new Map(taskCounts.map((r) => [r.applianceId, r._count._all]));
    return items.map((a) => ({
      ...this.toDto(a, a.images[0]?.url ?? null),
      openMaintenanceCount: applianceToCount.get(a.id) ?? 0,
    }));
  }

  async remove(userId: string, applianceId: string): Promise<void> {
    const found = await this.prisma.appliance.findFirst({
      where: { id: applianceId, ownerId: userId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Appliance not found.');
    // Cascade in Prisma schema removes images, tasks, repair plans, sessions, events.
    await this.prisma.appliance.delete({ where: { id: applianceId } });
  }

  async getDetail(userId: string, applianceId: string): Promise<ApplianceDetailDto> {
    const appliance = await this.prisma.appliance.findFirst({
      where: { id: applianceId, ownerId: userId },
      include: {
        images: { orderBy: { createdAt: 'desc' } },
        maintenanceTasks: {
          where: { status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] } },
          orderBy: { dueDate: 'asc' },
          take: 10,
        },
        repairSessions: {
          orderBy: { startedAt: 'desc' },
          take: 5,
          select: { id: true, status: true, startedAt: true },
        },
      },
    });
    if (!appliance) throw new NotFoundException('Appliance not found.');

    const primary = appliance.images.find((i) => i.isPrimary) ?? appliance.images[0];
    const tasks: MaintenanceTaskDto[] = appliance.maintenanceTasks.map((t) =>
      toMaintenanceTaskDto(t, {
        nickname: appliance.nickname,
        type: appliance.type,
      }),
    );

    return {
      ...this.toDto(appliance, primary?.url ?? null),
      images: appliance.images.map((img) => ({
        id: img.id,
        url: img.url,
        createdAt: img.createdAt.toISOString(),
      })),
      upcomingTasks: tasks,
      recentRepairs: appliance.repairSessions.map((s) => ({
        id: s.id,
        status: s.status,
        startedAt: s.startedAt.toISOString(),
      })),
    };
  }

  async registerFromImage(
    userId: string,
    args: { roomId: string; imageUrl: string; nickname?: string },
  ): Promise<RegisterFromImageResponse> {
    await this.rooms.assertOwnership(userId, args.roomId);

    const object = await this.ai.topObjectFromGoogleVision(args.imageUrl);
    const detection = await this.ai.detectApplianceFromImage(object, args.imageUrl);

    const appliance = await this.prisma.appliance.create({
      data: {
        ownerId: userId,
        roomId: args.roomId,
        type: detection.type,
        brand: detection.brand,
        model: detection.model,
        nickname: args.nickname ?? null,
        images: {
          create: [
            {
              key: extractS3Key(args.imageUrl),
              url: args.imageUrl,
              isPrimary: true,
            },
          ],
        },
      },
      include: { images: true },
    });

    // Kick off the proactive maintenance plan in the background — we don't
    // want to block the registration response on a Gemini call.
    try {
      await this.maintenanceQueue.add(
        'generate-maintenance-plan',
        { userId, applianceId: appliance.id },
        {
          jobId: `plan:${appliance.id}`,
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 2,
        },
      );
    } catch (e) {
      this.logger.warn(
        `Failed to enqueue maintenance plan for appliance ${appliance.id}: ${(e as Error).message}`,
      );
    }

    return {
      appliance: this.toDto(appliance, args.imageUrl),
      detected: detection,
    };
  }

  async analyzeFromImage(
    userId: string,
    args: { imageUrl: string },
  ): Promise<AnalyzeApplianceFromImageResponse> {
    // No persistence — just return detection + top-3 type options.
    void userId;
    const object = await this.ai.topObjectFromGoogleVision(args.imageUrl);
    const detection = await this.ai.detectApplianceFromImage(object, args.imageUrl);
    return {
      typeOptions:
        detection.typeOptions?.slice(0, 3) ?? [{ type: detection.type, confidence: detection.confidence }],
      suggested: {
        type: detection.type,
        brand: detection.brand,
        model: detection.model,
        confidence: detection.confidence,
        categoryGuess: detection.categoryGuess ?? null,
        broadCategory: detection.broadCategory ?? null,
      },
    };
  }

  async createAppliance(
    userId: string,
    args: {
      roomId: string;
      imageUrl: string;
      type: ApplianceType;
      brand: string | null;
      model: string | null;
      nickname?: string;
      suggestedTasks?: Array<{
        title: string;
        description: string;
        cadenceDays: 1 | 7 | 30;
        estimatedMinutes: number;
        safetyWarnings: string[];
        whyItMatters: string;
      }>;
    },
  ): Promise<CreateApplianceResponse> {
    await this.rooms.assertOwnership(userId, args.roomId);

    const appliance = await this.prisma.appliance.create({
      data: {
        ownerId: userId,
        roomId: args.roomId,
        type: args.type,
        brand: args.brand,
        model: args.model,
        nickname: args.nickname ?? null,
        images: {
          create: [
            {
              key: extractS3Key(args.imageUrl),
              url: args.imageUrl,
              isPrimary: true,
            },
          ],
        },
      },
      include: { images: true },
    });

    if (args.suggestedTasks?.length) {
      const now = Date.now();
      const rows = args.suggestedTasks
        .filter((t) => t && t.title && t.description)
        .map((t) => ({
          ownerId: userId,
          applianceId: appliance.id,
          title: t.title.slice(0, 120),
          description: t.description,
          dueDate: new Date(now + t.cadenceDays * 24 * 60 * 60 * 1000),
          status: TaskStatus.PENDING,
          estimatedMinutes: t.estimatedMinutes,
          cadenceDays: t.cadenceDays,
          safetyWarnings: t.safetyWarnings,
          whyItMatters: t.whyItMatters,
          source: 'ai' as const,
        }));
      if (rows.length) {
        await this.prisma.maintenanceTask.createMany({ data: rows });
      }
    }

    try {
      await this.maintenanceQueue.add(
        'generate-maintenance-plan',
        { userId, applianceId: appliance.id },
        {
          jobId: `plan:${appliance.id}`,
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 2,
        },
      );
    } catch (e) {
      this.logger.warn(
        `Failed to enqueue maintenance plan for appliance ${appliance.id}: ${(e as Error).message}`,
      );
    }

    return { appliance: this.toDto(appliance, args.imageUrl) };
  }

  async getSuggestedMaintenanceTasks(
    userId: string,
    args: {
      applianceType: ApplianceType;
      brand: string;
      modelId?: string;
      imageUrl?: string;
    },
  ): Promise<{ tasks: any[] }> {
    const hasModel = !!args.modelId && args.modelId.trim().length > 0;
    if (!hasModel && !args.imageUrl) {
      throw new BadRequestException('imageUrl is required when modelId is not provided.');
    }

    // Retry a couple times if Gemini returns invalid JSON/contracts.
    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const tasks = await this.ai.getSuggestedMaintenanceTasks({
          applianceType: args.applianceType,
          brand: args.brand,
          modelId: hasModel ? args.modelId : undefined,
          imageUrl: hasModel ? undefined : args.imageUrl,
        });
        return { tasks };
      } catch (e) {
        lastError = (e as Error)?.message ?? String(e);
      }
    }
    throw new BadRequestException(lastError ?? 'Failed to fetch suggested maintenance tasks.');
  }

  async assertOwnership(userId: string, applianceId: string): Promise<void> {
    const found = await this.prisma.appliance.findFirst({
      where: { id: applianceId, ownerId: userId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Appliance not found.');
  }

  private toDto(a: Appliance, primaryImageUrl: string | null): ApplianceDto {
    return {
      id: a.id,
      roomId: a.roomId,
      type: a.type,
      brand: a.brand,
      model: a.model,
      nickname: a.nickname,
      installedAt: a.installedAt ? a.installedAt.toISOString() : null,
      primaryImageUrl,
      createdAt: a.createdAt.toISOString(),
    };
  }
}

function extractS3Key(url: string): string {
  try {
    const u = new URL(url);
    // Path-style: /<bucket>/<key...>; virtual-hosted style: /<key...>
    const parts = u.pathname.replace(/^\//, '').split('/');
    if (parts.length > 1) return parts.slice(1).join('/');
    return parts.join('/');
  } catch {
    return url;
  }
}
