import { Module } from '@nestjs/common';
import { AppliancesService } from './appliances.service';
import { AppliancesController } from './appliances.controller';
import { RoomsModule } from '../rooms/rooms.module';

@Module({
  imports: [RoomsModule],
  providers: [AppliancesService],
  controllers: [AppliancesController],
  exports: [AppliancesService],
})
export class AppliancesModule {}
