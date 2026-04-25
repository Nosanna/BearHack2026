import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { MediaService } from './media.service';
import { SignedUploadDto } from './dto/signed-upload.dto';

@ApiTags('media')
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @ApiBearerAuth()
  @Post('signed-upload')
  @ApiOperation({
    summary:
      'Get a presigned PUT URL. Falls back to a local-disk stub when S3 is not configured.',
  })
  signedUpload(
    @CurrentUser() user: AuthUser,
    @Body() body: SignedUploadDto,
    @Req() req: Request,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return this.media.createSignedUpload(
      user.id,
      { contentType: body.contentType, kind: body.kind },
      baseUrl,
    );
  }

  /**
   * Local-disk upload sink used when S3 is not configured. The token is generated
   * by `signedUpload` and is single-use + time-limited. Body must be the raw
   * binary file bytes (registered as express.raw() in main.ts).
   */
  @Public()
  @Put('local-upload/:token')
  @HttpCode(204)
  @ApiOperation({ summary: 'DEV stub — accept raw file bytes for a previously-issued token.' })
  async localUpload(
    @Param('token') token: string,
    @Req() req: Request,
  ) {
    const ct =
      typeof req.headers['content-type'] === 'string'
        ? req.headers['content-type']
        : undefined;
    const body = (req as Request & { body?: Buffer | unknown }).body;
    const buf = Buffer.isBuffer(body) ? body : undefined;
    await this.media.consumeLocalUpload(token, buf, ct);
  }

  /**
   * Serves files saved by /local-upload. Public so the AI service (and the mobile
   * app, if it wants to render them) can fetch them without auth headers.
   */
  @Public()
  @Get('local/:kind/:userId/:filename')
  async localGet(
    @Param('kind') kind: string,
    @Param('userId') userId: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const key = `${kind}/${userId}/${filename}`;
    const { stream, contentType, size } = await this.media.getLocalFile(key);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', size);
    res.setHeader('Cache-Control', 'public, max-age=300');
    stream.pipe(res);
  }
}
