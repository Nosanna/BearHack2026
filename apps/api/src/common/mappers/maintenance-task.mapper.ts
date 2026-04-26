import type { ApplianceType, MaintenanceTask } from '@prisma/client';
import type { MaintenanceTaskDto } from '@fixit/shared';

/**
 * Map a Prisma MaintenanceTask + its appliance context into the wire DTO.
 * Centralized so every endpoint surfaces the same fields (cadence, why,
 * safety warnings, source).
 */
export function toMaintenanceTaskDto(
  task: MaintenanceTask,
  appliance: { nickname: string | null; type: ApplianceType },
): MaintenanceTaskDto {
  return {
    id: task.id,
    applianceId: task.applianceId,
    applianceNickname: appliance.nickname,
    applianceType: appliance.type,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate.toISOString(),
    status: task.status,
    estimatedMinutes: task.estimatedMinutes,
    cadenceDays: task.cadenceDays,
    whyItMatters: task.whyItMatters,
    safetyWarnings: task.safetyWarnings ?? [],
    source: normalizeSource(task.source),
  };
}

function normalizeSource(s: string): 'ai' | 'template' | 'manual' {
  return s === 'ai' || s === 'manual' ? s : 'template';
}
