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

/**
 * Coarser-grained category used when the AI cannot fit something into one of
 * the specific {@link ApplianceType} values. Display-only — never persisted.
 *
 * Lets the UI surface "Looks like a small kitchen appliance" instead of just
 * "OTHER", so the user gets a meaningful hint when the AI is unsure.
 */
export const BroadCategory = {
  KITCHEN_SMALL: 'KITCHEN_SMALL',
  LAUNDRY_SMALL: 'LAUNDRY_SMALL',
  CLIMATE_PORTABLE: 'CLIMATE_PORTABLE',
  WATER: 'WATER',
  LIGHTING: 'LIGHTING',
  POWER_TOOL: 'POWER_TOOL',
  OUTDOOR: 'OUTDOOR',
  ELECTRONICS: 'ELECTRONICS',
  BATHROOM_FIXTURE: 'BATHROOM_FIXTURE',
  CLEANING: 'CLEANING',
  OTHER: 'OTHER',
} as const;
export type BroadCategory = (typeof BroadCategory)[keyof typeof BroadCategory];

export const BROAD_CATEGORY_LABELS: Record<BroadCategory, string> = {
  KITCHEN_SMALL: 'Small kitchen appliance',
  LAUNDRY_SMALL: 'Laundry / fabric care',
  CLIMATE_PORTABLE: 'Portable climate device',
  WATER: 'Water fixture or device',
  LIGHTING: 'Lighting',
  POWER_TOOL: 'Power tool',
  OUTDOOR: 'Outdoor / yard',
  ELECTRONICS: 'Electronics',
  BATHROOM_FIXTURE: 'Bathroom fixture',
  CLEANING: 'Cleaning / vacuum',
  OTHER: 'Uncategorized',
};

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
