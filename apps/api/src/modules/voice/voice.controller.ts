import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { VoiceService } from './voice.service';

@ApiTags('voice')
@ApiBearerAuth()
@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  @Post('ask')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async ask(@UploadedFile() file?: any, @Body() body?: { history?: string }) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing audio file (multipart field "file").');
    }
    const history = parseHistory(body?.history);
    return this.voice.askWithAudio({
      bytes: file.buffer,
      contentType: file.mimetype || 'application/octet-stream',
      filename: file.originalname || 'audio',
      history,
    });
  }

  @Post('ask-text')
  async askText(
    @Body()
    body: {
      text?: string;
      history?: Array<{ role: 'user' | 'assistant'; text: string }>;
    },
  ) {
    const text = (body?.text ?? '').trim();
    if (!text) throw new BadRequestException('Missing "text".');
    return this.voice.askWithText(text, { history: body?.history });
  }
}

function parseHistory(raw?: string): Array<{ role: 'user' | 'assistant'; text: string }> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as any;
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string')
      .map((m) => ({ role: m.role, text: String(m.text).slice(0, 2000) }));
  } catch {
    return undefined;
  }
}

