import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toMaintenanceTaskDto } from '../../common/mappers/maintenance-task.mapper';
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

    const taskDtos: MaintenanceTaskDto[] = tasks.map((t) =>
      toMaintenanceTaskDto(t, t.appliance),
    );

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
