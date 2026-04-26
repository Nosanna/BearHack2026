import { ApplianceType } from '@prisma/client';

/**
 * Hardcoded "Demo Home" dataset. Every task carries a brand/model-specific
 * title, a `whyItMatters` line, and (when relevant) safetyWarnings — exactly
 * the shape Gemini produces in the AI flow, so the demo faithfully showcases
 * what the proactive system looks like in production.
 *
 * dueOffsetDays is relative to "now" at seed time:
 *   negative → already overdue (red dot)
 *   0/1      → due today / tomorrow (urgent)
 *   positive → upcoming
 */

export interface DemoTask {
  title: string;
  description: string;
  cadenceDays: number;
  estimatedMinutes: number;
  /** Days from now that the task is due. Negative = overdue. */
  dueOffsetDays: number;
  safetyWarnings: string[];
  whyItMatters: string;
}

export interface DemoAppliance {
  type: ApplianceType;
  brand: string;
  model: string;
  nickname: string;
  /**
   * How long ago (in days) the appliance was "installed" — feeds into the
   * "your dryer is N years old" framing without changing real time.
   */
  installedDaysAgo: number;
  tasks: DemoTask[];
}

export interface DemoRoom {
  name: string;
  appliances: DemoAppliance[];
}

export const DEMO_HOME: DemoRoom[] = [
  {
    name: 'Kitchen',
    appliances: [
      {
        type: ApplianceType.REFRIGERATOR,
        brand: 'LG',
        model: 'LFXS28968S',
        nickname: 'French Door Fridge',
        installedDaysAgo: 4 * 365,
        tasks: [
          {
            title: 'Vacuum the condenser coils',
            description:
              'Pull the fridge out, unplug it, and use a coil brush + vacuum to clear dust from the coils on the back or underneath.',
            cadenceDays: 180,
            estimatedMinutes: 20,
            dueOffsetDays: 14,
            safetyWarnings: [
              'Unplug the fridge before reaching behind or underneath.',
            ],
            whyItMatters:
              'Dusty coils make the compressor run hotter and longer, raising power bills and shortening its life.',
          },
          {
            title: 'Replace the LT800P water filter',
            description:
              'Locate the filter in the upper-right of the fresh-food compartment, twist a quarter-turn left, and swap in a fresh LT800P cartridge.',
            cadenceDays: 180,
            estimatedMinutes: 5,
            dueOffsetDays: 30,
            safetyWarnings: [],
            whyItMatters:
              'Old filters stop removing chlorine and contaminants and can slow water flow at the dispenser.',
          },
          {
            title: 'Wipe down the door gaskets',
            description:
              'Clean the rubber door seals with warm soapy water; check for tears or stiffness while you do.',
            cadenceDays: 60,
            estimatedMinutes: 10,
            dueOffsetDays: -2,
            safetyWarnings: [],
            whyItMatters:
              'Mildew on gaskets weakens the seal, so the compressor cycles more often and frost builds up inside.',
          },
        ],
      },
      {
        type: ApplianceType.DISHWASHER,
        brand: 'Whirlpool',
        model: 'WDT750SAKZ',
        nickname: 'Dishwasher',
        installedDaysAgo: 2 * 365,
        tasks: [
          {
            title: 'Clean the filter assembly',
            description:
              'Pull the bottom rack, twist off the cylindrical filter, rinse food debris under hot water, and re-seat it firmly.',
            cadenceDays: 30,
            estimatedMinutes: 10,
            dueOffsetDays: 1,
            safetyWarnings: [],
            whyItMatters:
              'A clogged filter causes drainage smells and dishes that come out gritty.',
          },
          {
            title: 'Run a vinegar cycle',
            description:
              'Place a cup of white vinegar upright on the top rack and run a hot wash with no detergent.',
            cadenceDays: 90,
            estimatedMinutes: 60,
            dueOffsetDays: 21,
            safetyWarnings: [],
            whyItMatters:
              'Cuts mineral buildup that blocks spray-arm nozzles and the inlet valve.',
          },
        ],
      },
    ],
  },
  {
    name: 'Laundry Room',
    appliances: [
      {
        type: ApplianceType.WASHING_MACHINE,
        brand: 'Samsung',
        model: 'WF45R6300AV',
        nickname: 'Front-Load Washer',
        installedDaysAgo: 3 * 365,
        tasks: [
          {
            title: 'Run the Self Clean+ cycle',
            description:
              'Press the Self Clean+ button on an empty machine and let it complete (~1h). Wipe the gasket dry afterwards.',
            cadenceDays: 90,
            estimatedMinutes: 70,
            dueOffsetDays: 7,
            safetyWarnings: [],
            whyItMatters:
              'Removes detergent residue and biofilm that cause musty laundry and "wet dog" smells.',
          },
        ],
      },
      {
        type: ApplianceType.DRYER,
        brand: 'LG',
        model: 'DLEX7900VE',
        nickname: 'Electric Dryer',
        installedDaysAgo: 3 * 365,
        tasks: [
          {
            title: 'Clean the dryer vent duct',
            description:
              'Disconnect the duct from the back of the dryer, run a vent brush from both ends, and vacuum out the lint along the run including the exterior hood.',
            cadenceDays: 180,
            estimatedMinutes: 30,
            dueOffsetDays: -7,
            safetyWarnings: [
              'Unplug the dryer before disconnecting any ducting.',
              'Lint accumulation is a leading cause of house fires — do not skip this.',
            ],
            whyItMatters:
              'Lint buildup reduces airflow, makes the dryer run hot, and creates a fire risk.',
          },
        ],
      },
    ],
  },
  {
    name: 'Living Room',
    appliances: [
      {
        type: ApplianceType.AIR_CONDITIONER,
        brand: 'Carrier',
        model: '24ACC624A003',
        nickname: 'Central AC',
        installedDaysAgo: 5 * 365,
        tasks: [
          {
            title: 'Replace the 16x25x1 HVAC filter',
            description:
              'Pop open the return-air grille, slide out the dirty filter, and slot in a fresh 16x25x1 MERV-11.',
            cadenceDays: 60,
            estimatedMinutes: 5,
            dueOffsetDays: 5,
            safetyWarnings: [],
            whyItMatters:
              'A dirty filter forces the blower to overwork and ices up the evaporator coil on hot days.',
          },
        ],
      },
    ],
  },
];
