import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { toMaintenanceTaskDto } from '../../common/mappers/maintenance-task.mapper';
import type { ScheduleUpcomingResponse, MaintenanceTaskDto } from '@fixit/shared';

@Injectable()
export class ScheduleService {
  constructor(private readonly prisma: PrismaService) {}

  async upcoming(userId: string, days = 30): Promise<ScheduleUpcomingResponse> {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + days);

    const tasks = await this.prisma.maintenanceTask.findMany({
      where: {
        ownerId: userId,
        status: { in: ['PENDING', 'IN_PROGRESS', 'OVERDUE'] },
        dueDate: { lte: horizon },
      },
      orderBy: { dueDate: 'asc' },
      include: {
        appliance: { select: { nickname: true, type: true } },
      },
    });

    const dtos: MaintenanceTaskDto[] = tasks.map((t) =>
      toMaintenanceTaskDto(t, t.appliance),
    );
    return { tasks: dtos };
  }
}
