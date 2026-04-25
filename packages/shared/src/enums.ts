export const ApplianceType = {
  REFRIGERATOR: 'REFRIGERATOR',
  DISHWASHER: 'DISHWASHER',
  WASHING_MACHINE: 'WASHING_MACHINE',
  DRYER: 'DRYER',
  OVEN: 'OVEN',
  STOVE: 'STOVE',
  MICROWAVE: 'MICROWAVE',
  AIR_CONDITIONER: 'AIR_CONDITIONER',
  WATER_HEATER: 'WATER_HEATER',
  FURNACE: 'FURNACE',
  GARBAGE_DISPOSAL: 'GARBAGE_DISPOSAL',
  RANGE_HOOD: 'RANGE_HOOD',
  OTHER: 'OTHER',
} as const;
export type ApplianceType = (typeof ApplianceType)[keyof typeof ApplianceType];

export const TaskStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  SKIPPED: 'SKIPPED',
  OVERDUE: 'OVERDUE',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const RepairStatus = {
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  ABANDONED: 'ABANDONED',
  ESCALATED: 'ESCALATED',
} as const;
export type RepairStatus = (typeof RepairStatus)[keyof typeof RepairStatus];

export const RepairEventType = {
  STATE_ENTERED: 'STATE_ENTERED',
  USER_RESPONSE: 'USER_RESPONSE',
  PHOTO_SUBMITTED: 'PHOTO_SUBMITTED',
  PHOTO_VERIFIED: 'PHOTO_VERIFIED',
  PHOTO_REJECTED: 'PHOTO_REJECTED',
  ESCALATED: 'ESCALATED',
  COMPLETED: 'COMPLETED',
} as const;
export type RepairEventType =
  (typeof RepairEventType)[keyof typeof RepairEventType];
