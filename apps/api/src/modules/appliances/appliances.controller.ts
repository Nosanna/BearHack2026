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
import { IsOptional, IsString, IsUrl, MaxLength, MinLength } from 'class-validator';
import { ApplianceType } from '@fixit/shared';

class AnalyzeFromImageDto {
  @IsString()
  @IsUrl({ require_tld: false })
  imageUrl!: string;
}

class CreateApplianceDto {
  @IsString()
  @MinLength(1)
  roomId!: string;

  @IsString()
  @IsUrl({ require_tld: false })
  imageUrl!: string;

  @IsString()
  type!: ApplianceType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  model?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  nickname?: string;
}

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

  @Post('analyze-from-image')
  @ApiOperation({
    summary: 'Analyze an appliance photo and return 3 type options + suggested brand/model (no persistence).',
  })
  analyzeFromImage(@CurrentUser() user: AuthUser, @Body() body: AnalyzeFromImageDto) {
    return this.appliances.analyzeFromImage(user.id, body);
  }

  @Post()
  @ApiOperation({
    summary: 'Create an appliance from user-selected type and editable model info.',
  })
  create(@CurrentUser() user: AuthUser, @Body() body: CreateApplianceDto) {
    return this.appliances.createAppliance(user.id, {
      roomId: body.roomId,
      imageUrl: body.imageUrl,
      type: body.type,
      brand: body.brand ?? null,
      model: body.model ?? null,
      nickname: body.nickname,
    });
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
