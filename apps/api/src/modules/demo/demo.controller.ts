import { Controller, ForbiddenException, HttpCode, Post } from '@nestjs/common';
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
      "Wipe ALL of the current user's home data and re-seed the Demo Home. " +
      'Disabled in production to prevent accidental data loss.',
  })
  reset(@CurrentUser() user: AuthUser) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Demo reset is disabled in production.');
    }
    return this.demo.reset(user.id);
  }
}
