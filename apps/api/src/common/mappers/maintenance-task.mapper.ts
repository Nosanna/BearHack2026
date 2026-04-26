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
  const rawCategory = (task as any).category ?? null;
  const rawFocusPart = (task as any).focusPart ?? null;

  // Super-simple backfill for existing demo rows that predate explicit metadata.
  // Only applies to DRYER lint-filter tasks.
  const titleKey = (task.title ?? '').toLowerCase().trim();
  const isDryerLintFilter =
    appliance.type === 'DRYER' &&
    (titleKey === 'clean dryer lint filter' ||
      titleKey === 'clean the dryer lint filter' ||
      titleKey === 'clean lint filter');

  const category = rawCategory ?? (isDryerLintFilter ? 'DRYER_LINT_FILTER' : null);
  const focusPart = rawFocusPart ?? (isDryerLintFilter ? 'lint_filter' : null);

  return {
    id: task.id,
    applianceId: task.applianceId,
    applianceNickname: appliance.nickname,
    applianceType: appliance.type,
    title: task.title,
    description: task.description,
    category,
    focusPart,
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
