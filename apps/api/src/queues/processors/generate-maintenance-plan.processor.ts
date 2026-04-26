import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TaskStatus } from '@prisma/client';
import {
  AiService,
  type MaintenanceTaskTemplate,
} from '../../modules/ai/ai.service';
import { QUEUE_NAMES } from '../queues.constants';

interface GeneratePlanJob {
  userId: string;
  applianceId: string;
}

/**
 * Static fallback used when Gemini is unavailable / out of quota / returns
 * unusable JSON. Intentionally generic so it never produces incorrect or
 * unsafe advice; the AI path supplies the brand/model-aware tasks.
 */
const STATIC_TEMPLATE: Record<string, MaintenanceTaskTemplate[]> = {
  REFRIGERATOR: [
    {
      title: 'Vacuum the condenser coils',
      description:
        'Unplug the fridge, pull it out, and vacuum the coils on the back or underneath to remove dust.',
      cadenceDays: 180,
      estimatedMinutes: 20,
      safetyWarnings: ['Unplug the fridge before reaching behind or underneath.'],
      whyItMatters:
        'Dusty coils make the compressor work harder, raising power bills and shortening its life.',
    },
    {
      title: 'Replace water filter',
      description:
        'Swap the in-door water filter cartridge per your model\'s instructions.',
      cadenceDays: 180,
      estimatedMinutes: 10,
      safetyWarnings: [],
      whyItMatters:
        'Old filters stop removing contaminants and can slow water flow through the dispenser.',
    },
  ],
  DISHWASHER: [
    {
      title: 'Clean the filter',
      description:
        'Pull out the bottom rack, twist off the filter assembly, rinse food debris under hot water, and reinstall.',
      cadenceDays: 30,
      estimatedMinutes: 10,
      safetyWarnings: [],
      whyItMatters: 'A clogged filter causes drainage smells and dishes that stay dirty.',
    },
    {
      title: 'Run a vinegar cycle',
      description:
        'Place a cup of white vinegar upright in the top rack and run a hot wash with no detergent.',
      cadenceDays: 90,
      estimatedMinutes: 60,
      safetyWarnings: [],
      whyItMatters: 'Cuts mineral build-up that blocks spray arms and water inlets.',
    },
  ],
  WASHING_MACHINE: [
    {
      title: 'Clean the lint screen / filter',
      description: 'Locate the front-load drain pump filter (or top-load lint trap) and clear out lint and debris.',
      cadenceDays: 60,
      estimatedMinutes: 10,
      safetyWarnings: ['Place a towel and shallow pan to catch residual water.'],
      whyItMatters: 'A blocked filter triggers drain errors and leaves clothes wet at the end of the cycle.',
    },
    {
      title: 'Run a clean-cycle (or hot water + vinegar)',
      description:
        'Use the manufacturer "Tub Clean" cycle, or run an empty hot wash with two cups of white vinegar.',
      cadenceDays: 90,
      estimatedMinutes: 90,
      safetyWarnings: [],
      whyItMatters: 'Removes detergent residue and biofilm that cause musty smells in laundry.',
    },
  ],
  DRYER: [
    {
      title: 'Clean the dryer vent',
      description:
        'Disconnect the duct from the back of the dryer and vacuum out the lint along the run, including the exterior hood.',
      cadenceDays: 180,
      estimatedMinutes: 30,
      safetyWarnings: [
        'Unplug the dryer before disconnecting any ducting.',
        'Lint accumulation is a leading cause of house fires — do not skip this.',
      ],
      whyItMatters: 'Lint build-up reduces airflow, making the dryer run hot and creating a fire risk.',
    },
  ],
  OVEN: [
    {
      title: 'Run self-clean (or wipe down)',
      description:
        'Either run the oven\'s self-clean cycle or wipe the interior with a baking-soda paste, then rinse.',
      cadenceDays: 90,
      estimatedMinutes: 60,
      safetyWarnings: ['Self-clean cycles get extremely hot — keep children and pets away.'],
      whyItMatters: 'Burnt-on grease smokes the next time you cook and can damage gaskets and elements.',
    },
  ],
  AIR_CONDITIONER: [
    {
      title: 'Replace HVAC filter',
      description:
        'Swap the air filter at the return grille for a fresh one of the same MERV rating.',
      cadenceDays: 60,
      estimatedMinutes: 5,
      safetyWarnings: [],
      whyItMatters: 'A dirty filter forces the blower to overwork and ices up the coil on hot days.',
    },
  ],
  WATER_HEATER: [
    {
      title: 'Flush sediment from tank',
      description:
        'Connect a hose to the drain valve, shut off the cold inlet, and drain a few gallons until the water runs clear.',
      cadenceDays: 365,
      estimatedMinutes: 90,
      safetyWarnings: [
        'Drained water is scalding hot — route the hose to a safe drain.',
        'Shut off gas (or breaker) before draining a fully empty tank.',
      ],
      whyItMatters: 'Sediment cuts efficiency, makes popping noises, and shortens the heater\'s life.',
    },
  ],
};

@Processor(QUEUE_NAMES.GENERATE_MAINTENANCE_PLAN)
export class GenerateMaintenancePlanProcessor extends WorkerHost {
  private readonly logger = new Logger(GenerateMaintenancePlanProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
    @InjectQueue(QUEUE_NAMES.SEND_NOTIFICATIONS) private readonly notify: Queue,
  ) {
    super();
  }

  override async process(
    job: Job<GeneratePlanJob>,
  ): Promise<{ created: number; source: 'ai' | 'template' | 'none' }> {
    const { userId, applianceId } = job.data;

    const appliance = await this.prisma.appliance.findFirst({
      where: { id: applianceId, ownerId: userId },
      select: {
        id: true,
        type: true,
        brand: true,
        model: true,
        installedAt: true,
      },
    });
    if (!appliance) return { created: 0, source: 'none' };

    let tasks: MaintenanceTaskTemplate[] = [];
    let source: 'ai' | 'template' = 'template';
    let modelName = 'static-template';

    try {
      const plan = await this.ai.generateMaintenancePlan({
        applianceType: appliance.type,
        brand: appliance.brand,
        model: appliance.model,
        installedAt: appliance.installedAt,
      });
      tasks = plan.tasks;
      source = 'ai';
      modelName = plan.modelName;
      this.logger.log(
        `[plan] AI plan for ${appliance.type} (${appliance.brand ?? '—'}) → ${tasks.length} tasks via ${modelName}`,
      );
    } catch (e) {
      this.logger.warn(
        `[plan] AI plan failed for appliance ${applianceId} (${appliance.type}); falling back to static template. ${(e as Error).message}`,
      );
      tasks = STATIC_TEMPLATE[appliance.type] ?? [];
    }

    if (tasks.length === 0) {
      this.logger.warn(
        `[plan] No tasks (AI or template) for appliance ${applianceId} (${appliance.type}); skipping.`,
      );
      return { created: 0, source: 'none' };
    }

    const existing = await this.prisma.maintenanceTask.findMany({
      where: { ownerId: userId, applianceId },
      select: { title: true },
    });
    const existingTitles = new Set(
      existing.map((t) => t.title.toLowerCase().trim()),
    );

    let created = 0;
    for (const t of tasks) {
      if (existingTitles.has(t.title.toLowerCase().trim())) continue;
      const dueDate = new Date(Date.now() + t.cadenceDays * 24 * 60 * 60 * 1000);
      await this.prisma.maintenanceTask.create({
        data: {
          ownerId: userId,
          applianceId,
          title: t.title,
          description: t.description || null,
          dueDate,
          status: TaskStatus.PENDING,
          estimatedMinutes: t.estimatedMinutes ?? null,
          cadenceDays: t.cadenceDays,
          safetyWarnings: t.safetyWarnings,
          whyItMatters: t.whyItMatters || null,
          source,
        },
      });
      created++;
    }

    if (created > 0) {
      await this.notify.add(
        'plan-generated',
        {
          userId,
          kind: 'PLAN_GENERATED',
          title: 'Maintenance plan ready',
          body: `We scheduled ${created} task${created === 1 ? '' : 's'} for your ${appliance.type
            .replace(/_/g, ' ')
            .toLowerCase()}.`,
          refId: applianceId,
        },
        { removeOnComplete: 100, removeOnFail: 50, attempts: 3 },
      );
    }

    this.logger.log(
      `[plan] Created ${created}/${tasks.length} tasks for appliance ${applianceId} (source=${source}).`,
    );
    return { created, source };
  }
}
