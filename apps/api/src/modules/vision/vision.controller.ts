import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { IsString, IsUrl } from 'class-validator';
import { VisionService } from './vision.service';
import type { DetectPartsResponse } from '@fixit/shared';

class DetectPartsDto {
  @IsString()
  @IsUrl({ require_tld: false })
  imageUrl!: string;
}

@ApiTags('vision')
@ApiBearerAuth()
@Controller('vision')
export class VisionController {
  constructor(private readonly vision: VisionService) {}

  @Post('parts/detect')
  @ApiOperation({
    summary: 'Detect appliance parts in a photo (YOLO-backed).',
  })
  detectParts(@CurrentUser() user: AuthUser, @Body() body: DetectPartsDto): Promise<DetectPartsResponse> {
    return this.vision.detectParts(user.id, body.imageUrl);
  }
}

