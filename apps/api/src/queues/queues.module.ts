import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_NAMES } from './queues.constants';
import { DailyMaintenanceScanProcessor } from './processors/daily-maintenance-scan.processor';
import { SendNotificationsProcessor } from './processors/send-notifications.processor';
import { GenerateMaintenancePlanProcessor } from './processors/generate-maintenance-plan.processor';
import { CleanupAbandonedRepairSessionsProcessor } from './processors/cleanup-abandoned-repair-sessions.processor';
import { QueuesScheduler } from './queues.scheduler';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(config.get<string>('REDIS_PORT') ?? 6379),
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.DAILY_MAINTENANCE_SCAN },
      { name: QUEUE_NAMES.SEND_NOTIFICATIONS },
      { name: QUEUE_NAMES.GENERATE_MAINTENANCE_PLAN },
      { name: QUEUE_NAMES.CLEANUP_ABANDONED_REPAIR_SESSIONS },
    ),
  ],
  providers: [
    DailyMaintenanceScanProcessor,
    SendNotificationsProcessor,
    GenerateMaintenancePlanProcessor,
    CleanupAbandonedRepairSessionsProcessor,
    QueuesScheduler,
  ],
  exports: [BullModule],
})
export class QueuesModule {}
