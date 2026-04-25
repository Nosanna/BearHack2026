export const QUEUE_NAMES = {
  DAILY_MAINTENANCE_SCAN: 'daily-maintenance-scan',
  SEND_NOTIFICATIONS: 'send-notifications',
  GENERATE_MAINTENANCE_PLAN: 'generate-maintenance-plan',
  CLEANUP_ABANDONED_REPAIR_SESSIONS: 'cleanup-abandoned-repair-sessions',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
