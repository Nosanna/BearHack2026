import { Injectable, Logger } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DEMO_HOME, type DemoTask } from './demo.data';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SeedSummary {
  status: 'seeded' | 'already_seeded' | 'reset';
  rooms: number;
  appliances: number;
  tasks: number;
}

@Injectable()
export class DemoService {
  private readonly logger = new Logger(DemoService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seed the user's account with the curated "Demo Home" if they haven't
   * been seeded yet (idempotent — safe to call on every login).
   */
  async ensureSeeded(userId: string): Promise<SeedSummary> {
    const existingRoom = await this.prisma.room.findFirst({
      where: { ownerId: userId },
      select: { id: true },
    });
    if (existingRoom) {
      return { status: 'already_seeded', rooms: 0, appliances: 0, tasks: 0 };
    }
    return this.seed(userId, 'seeded');
  }

  /**
   * Wipe ALL of the user's home data (rooms cascade to appliances, tasks,
   * sessions, plans, events; notifications cleared separately) and re-seed
   * from scratch. Used by the on-stage "Reset demo" button.
   */
  async reset(userId: string): Promise<SeedSummary> {
    await this.prisma.$transaction([
      // Cascade-deletes appliances → tasks → sessions → plans → events.
      this.prisma.room.deleteMany({ where: { ownerId: userId } }),
      // Notifications are tied to user, not room, so wipe explicitly.
      this.prisma.notification.deleteMany({ where: { userId } }),
    ]);
    this.logger.log(`Demo data wiped for user ${userId}`);
    return this.seed(userId, 'reset');
  }

  private async seed(
    userId: string,
    statusLabel: 'seeded' | 'reset',
  ): Promise<SeedSummary> {
    const now = Date.now();
    let roomCount = 0;
    let applianceCount = 0;
    let taskCount = 0;

    for (const roomDef of DEMO_HOME) {
      const room = await this.prisma.room.create({
        data: { ownerId: userId, name: roomDef.name },
      });
      roomCount++;

      for (const appDef of roomDef.appliances) {
        const appliance = await this.prisma.appliance.create({
          data: {
            ownerId: userId,
            roomId: room.id,
            type: appDef.type,
            brand: appDef.brand,
            model: appDef.model,
            nickname: appDef.nickname,
            installedAt: new Date(now - appDef.installedDaysAgo * DAY_MS),
          },
        });
        applianceCount++;

        for (const task of appDef.tasks) {
          await this.prisma.maintenanceTask.create({
            data: {
              ownerId: userId,
              applianceId: appliance.id,
              title: task.title,
              description: task.description,
              dueDate: new Date(now + task.dueOffsetDays * DAY_MS),
              status: deriveStatus(task),
              estimatedMinutes: task.estimatedMinutes,
              cadenceDays: task.cadenceDays,
              safetyWarnings: task.safetyWarnings,
              whyItMatters: task.whyItMatters,
              source: 'ai',
            },
          });
          taskCount++;
        }
      }
    }

    this.logger.log(
      `Demo "${statusLabel}" for user ${userId}: ${roomCount} rooms, ${applianceCount} appliances, ${taskCount} tasks`,
    );
    return {
      status: statusLabel,
      rooms: roomCount,
      appliances: applianceCount,
      tasks: taskCount,
    };
  }
}

function deriveStatus(task: DemoTask): TaskStatus {
  // Tasks already past their due date come in pre-marked OVERDUE so the
  // dashboard renders them red on first paint, without waiting for the
  // 03:00-UTC daily scan.
  return task.dueOffsetDays < 0 ? TaskStatus.OVERDUE : TaskStatus.PENDING;
}
