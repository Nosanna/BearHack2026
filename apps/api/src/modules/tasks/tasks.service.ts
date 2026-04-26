import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { toMaintenanceTaskDto } from '../../common/mappers/maintenance-task.mapper';
import type {
  CompleteTaskResponse,
  MaintenanceTaskDto,
  SnoozeTaskResponse,
} from '@fixit/shared';

const DEFAULT_SNOOZE_DAYS = 7;

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Mark a task COMPLETED. If it has a cadenceDays (i.e. it's a recurring
   * preventative-maintenance task), automatically schedule the next instance
   * at `now + cadenceDays`. This is what makes the system actually proactive
   * — the user closes today's task and the next one is already on the books.
   */
  async complete(
    userId: string,
    taskId: string,
  ): Promise<CompleteTaskResponse> {
    const task = await this.prisma.maintenanceTask.findFirst({
      where: { id: taskId, ownerId: userId },
      include: { appliance: { select: { nickname: true, type: true } } },
    });
    if (!task) throw new NotFoundException('Task not found.');
    if (task.status === TaskStatus.COMPLETED) {
      throw new BadRequestException('Task is already completed.');
    }

    const now = new Date();

    const [completed, nextRow] = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.maintenanceTask.update({
        where: { id: task.id },
        data: { status: TaskStatus.COMPLETED, completedAt: now },
        include: { appliance: { select: { nickname: true, type: true } } },
      });

      if (task.cadenceDays && task.cadenceDays > 0) {
        const nextDue = new Date(
          now.getTime() + task.cadenceDays * 24 * 60 * 60 * 1000,
        );
        const created = await tx.maintenanceTask.create({
          data: {
            ownerId: task.ownerId,
            applianceId: task.applianceId,
            title: task.title,
            description: task.description,
            dueDate: nextDue,
            status: TaskStatus.PENDING,
            estimatedMinutes: task.estimatedMinutes,
            cadenceDays: task.cadenceDays,
            safetyWarnings: task.safetyWarnings,
            whyItMatters: task.whyItMatters,
            source: task.source,
          },
          include: { appliance: { select: { nickname: true, type: true } } },
        });
        return [updated, created] as const;
      }

      return [updated, null] as const;
    });

    this.logger.log(
      `Task ${task.id} completed by user ${userId}` +
        (nextRow ? `; next instance ${nextRow.id} due ${nextRow.dueDate.toISOString()}` : ''),
    );

    const taskDto: MaintenanceTaskDto = toMaintenanceTaskDto(
      completed,
      completed.appliance,
    );
    const nextTask: MaintenanceTaskDto | null = nextRow
      ? toMaintenanceTaskDto(nextRow, nextRow.appliance)
      : null;

    return { task: taskDto, nextTask };
  }

  /**
   * Push the due date forward by N days (default 7) and re-arm the task to
   * PENDING (so it gets re-evaluated by the daily scan instead of staying
   * OVERDUE forever).
   */
  async snooze(
    userId: string,
    taskId: string,
    days: number | undefined,
  ): Promise<SnoozeTaskResponse> {
    const snoozeDays = clampSnoozeDays(days);

    const task = await this.prisma.maintenanceTask.findFirst({
      where: { id: taskId, ownerId: userId },
      select: { id: true, dueDate: true, status: true },
    });
    if (!task) throw new NotFoundException('Task not found.');
    if (task.status === TaskStatus.COMPLETED) {
      throw new BadRequestException('Cannot snooze a completed task.');
    }

    // Snooze relative to whichever is later: the existing due date or now.
    // Otherwise snoozing an already-overdue task barely moves the date.
    const base = task.dueDate.getTime() > Date.now() ? task.dueDate : new Date();
    const newDue = new Date(base.getTime() + snoozeDays * 24 * 60 * 60 * 1000);

    const updated = await this.prisma.maintenanceTask.update({
      where: { id: task.id },
      data: { dueDate: newDue, status: TaskStatus.PENDING },
      include: { appliance: { select: { nickname: true, type: true } } },
    });

    this.logger.log(
      `Task ${task.id} snoozed ${snoozeDays}d by user ${userId} → due ${newDue.toISOString()}`,
    );

    return { task: toMaintenanceTaskDto(updated, updated.appliance) };
  }
}

function clampSnoozeDays(days: number | undefined): number {
  if (!days || !Number.isFinite(days)) return DEFAULT_SNOOZE_DAYS;
  return Math.max(1, Math.min(365, Math.round(days)));
}
