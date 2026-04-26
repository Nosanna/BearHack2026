import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';
import { TasksService } from './tasks.service';
import { SnoozeTaskDto } from './dto/snooze-task.dto';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post(':id/complete')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Mark a maintenance task as completed. For recurring tasks (cadenceDays != null), the next instance is auto-scheduled at now + cadenceDays.',
  })
  complete(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.complete(user.id, id);
  }

  @Post(':id/snooze')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Push the task forward by N days (default 7). Status is reset to PENDING.',
  })
  snooze(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SnoozeTaskDto,
  ) {
    return this.tasks.snooze(user.id, id, body.days);
  }
}
