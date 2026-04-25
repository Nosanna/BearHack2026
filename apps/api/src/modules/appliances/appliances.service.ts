import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { RoomsService } from '../rooms/rooms.service';
import type {
  ApplianceDetailDto,
  ApplianceDto,
  MaintenanceTaskDto,
  RegisterFromImageResponse,
} from '@fixit/shared';
import type { Appliance } from '@prisma/client';

@Injectable()
export class AppliancesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    private readonly rooms: RoomsService,
  ) {}

  async listForUser(userId: string, roomId?: string): Promise<ApplianceDto[]> {
    const items = await this.prisma.appliance.findMany({
      where: { ownerId: userId, ...(roomId ? { roomId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: {
        images: { where: { isPrimary: true }, take: 1, orderBy: { createdAt: 'desc' } },
      },
    });
    return items.map((a) =>
      this.toDto(a, a.images[0]?.url ?? null),
    );
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
    const tasks: MaintenanceTaskDto[] = appliance.maintenanceTasks.map((t) => ({
      id: t.id,
      applianceId: t.applianceId,
      applianceNickname: appliance.nickname,
      applianceType: appliance.type,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate.toISOString(),
      status: t.status,
      estimatedMinutes: t.estimatedMinutes,
    }));

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

    const detection = await this.ai.detectApplianceFromImage(args.imageUrl);

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

    return {
      appliance: this.toDto(appliance, args.imageUrl),
      detected: detection,
    };
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
