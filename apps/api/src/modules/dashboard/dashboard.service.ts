import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { DashboardHomeResponse, MaintenanceTaskDto, RoomDto, UserDto } from '@fixit/shared';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async home(userId: string): Promise<DashboardHomeResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });
    if (!user) throw new NotFoundException('User not found.');

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 30);

    const [rooms, tasks, activeRepair] = await Promise.all([
      this.prisma.room.findMany({
        where: { ownerId: userId },
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { appliances: true } } },
      }),
      this.prisma.maintenanceTask.findMany({
        where: {
          ownerId: userId,
          status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
          // Match /schedule/upcoming: only show tasks due within the next 30 days
          // (plus already-overdue tasks, which also satisfy lte horizon).
          dueDate: { lte: horizon },
        },
        orderBy: { dueDate: 'asc' },
        take: 8,
        include: {
          appliance: { select: { nickname: true, type: true } },
        },
      }),
      this.prisma.repairSession.findFirst({
        where: { ownerId: userId, status: 'ACTIVE' },
        orderBy: { startedAt: 'desc' },
        select: { id: true },
      }),
    ]);

    const roomDtos: RoomDto[] = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      applianceCount: r._count.appliances,
      createdAt: r.createdAt.toISOString(),
    }));

    const taskDtos: MaintenanceTaskDto[] = tasks.map((t) => ({
      id: t.id,
      applianceId: t.applianceId,
      applianceNickname: t.appliance.nickname,
      applianceType: t.appliance.type,
      title: t.title,
      description: t.description,
      dueDate: t.dueDate.toISOString(),
      status: t.status,
      estimatedMinutes: t.estimatedMinutes,
    }));

    const userDto: UserDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };

    return {
      user: userDto,
      rooms: roomDtos,
      upcomingTasks: taskDtos,
      activeRepairSessionId: activeRepair?.id ?? null,
    };
  }
}
