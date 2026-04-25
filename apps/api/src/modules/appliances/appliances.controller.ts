import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { AppliancesService } from './appliances.service';
import { RegisterFromImageDto } from './dto/register-from-image.dto';

@ApiTags('appliances')
@ApiBearerAuth()
@Controller('appliances')
export class AppliancesController {
  constructor(private readonly appliances: AppliancesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('roomId') roomId?: string) {
    return this.appliances.listForUser(user.id, roomId);
  }

  @Post('register-from-image')
  @ApiOperation({
    summary:
      'Identify the appliance in the uploaded photo and persist it under the given room.',
  })
  registerFromImage(
    @CurrentUser() user: AuthUser,
    @Body() body: RegisterFromImageDto,
  ) {
    return this.appliances.registerFromImage(user.id, body);
  }

  @Get(':id/detail')
  detail(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appliances.getDetail(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary:
      'Delete an appliance and all of its images, tasks, repair plans, and sessions.',
  })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.appliances.remove(user.id, id);
  }
}
