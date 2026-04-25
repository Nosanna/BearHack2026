import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RepairService } from './repair.service';
import {
  RepairPhotoDto,
  RespondDto,
  StartRepairDto,
} from './dto/start-repair.dto';

@ApiTags('repair')
@ApiBearerAuth()
@Controller('repair')
export class RepairController {
  constructor(private readonly repair: RepairService) {}

  @Post('start')
  start(@CurrentUser() user: AuthUser, @Body() body: StartRepairDto) {
    return this.repair.start(user.id, body);
  }

  @Post(':id/respond')
  respond(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RespondDto,
  ) {
    return this.repair.respond(user.id, id, body.answer);
  }

  @Post(':id/photo')
  photo(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: RepairPhotoDto,
  ) {
    return this.repair.submitPhoto(user.id, id, body.imageUrl);
  }
}
