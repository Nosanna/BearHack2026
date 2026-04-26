import { Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { DemoService } from './demo.service';

@ApiTags('demo')
@ApiBearerAuth()
@Controller('demo')
export class DemoController {
  constructor(private readonly demo: DemoService) {}

  @Post('seed')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Idempotently seed the current user with the Demo Home dataset. No-op if any rooms already exist.',
  })
  seed(@CurrentUser() user: AuthUser) {
    return this.demo.ensureSeeded(user.id);
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Wipe ALL of the current user\'s home data and re-seed the Demo Home. Use for live-demo replays.',
  })
  reset(@CurrentUser() user: AuthUser) {
    return this.demo.reset(user.id);
  }
}
