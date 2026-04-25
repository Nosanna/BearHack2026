import { Module } from '@nestjs/common';
import { RepairService } from './repair.service';
import { RepairController } from './repair.controller';
import { VisionModule } from '../vision/vision.module';
import { AppliancesModule } from '../appliances/appliances.module';

// QueuesModule is @Global and re-exports BullModule, so the
// GENERATE_MAINTENANCE_PLAN queue is available via @InjectQueue here
// without re-registering.
@Module({
  imports: [VisionModule, AppliancesModule],
  providers: [RepairService],
  controllers: [RepairController],
})
export class RepairModule {}
