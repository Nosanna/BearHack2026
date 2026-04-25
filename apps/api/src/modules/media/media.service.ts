import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { promises as fs, createReadStream, type ReadStream } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import type { SignedUploadResponse } from '@fixit/shared';

interface LocalToken {
  key: string;
  contentType: string;
  expiresAt: number;
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3: S3Client | null;
  private readonly bucket: string;
  private readonly endpoint: string;
  private readonly region: string;
  private readonly forcePathStyle: boolean;
  private readonly ttlSeconds: number;
  private readonly localMode: boolean;
  private readonly localDir: string;
  private readonly localTokens = new Map<string, LocalToken>();

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') || '';
    this.endpoint =
      config.get<string>('S3_ENDPOINT') || 'https://ewr1.vultrobjects.com';
    this.region = config.get<string>('S3_REGION') || 'ewr1';
    this.forcePathStyle =
      (config.get<string>('S3_FORCE_PATH_STYLE') ?? 'true').toLowerCase() === 'true';
    this.ttlSeconds = Number(config.get<string>('S3_SIGNED_URL_TTL_SECONDS') ?? 900);
    this.localDir =
      config.get<string>('LOCAL_MEDIA_DIR') ||
      resolve(process.cwd(), '.local-uploads');

    const accessKeyId = config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('S3_SECRET_ACCESS_KEY');
    this.localMode = !accessKeyId || !secretAccessKey || !this.bucket;

    if (this.localMode) {
      this.logger.warn(
        `S3 not configured — using LOCAL DISK media at ${this.localDir}. ` +
          `Set S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY to switch to object storage.`,
      );
      this.s3 = null;
    } else {
      this.s3 = new S3Client({
        region: this.region,
        endpoint: this.endpoint,
        forcePathStyle: this.forcePathStyle,
        credentials: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! },
      });
    }
  }

  async createSignedUpload(
    userId: string,
    args: { contentType: string; kind: 'appliance' | 'repair-step' },
    baseUrl: string,
  ): Promise<SignedUploadResponse> {
    const ext = mimeToExt(args.contentType);
    const key = `${args.kind}/${userId}/${Date.now()}-${randomUUID()}${ext}`;

    if (this.localMode) {
      const token = randomUUID();
      const expiresAt = Date.now() + this.ttlSeconds * 1000;
      this.localTokens.set(token, {
        key,
        contentType: args.contentType,
        expiresAt,
      });
      this.gcLocalTokens();
      const cleanBase = baseUrl.replace(/\/$/, '');
      return {
        uploadUrl: `${cleanBase}/media/local-upload/${token}`,
        publicUrl: `${cleanBase}/media/local/${key}`,
        key,
        headers: { 'Content-Type': args.contentType },
        expiresAt: new Date(expiresAt).toISOString(),
      };
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: args.contentType,
      ACL: 'public-read',
    });
    const uploadUrl = await getSignedUrl(this.s3!, command, {
      expiresIn: this.ttlSeconds,
    });

    return {
      uploadUrl,
      publicUrl: this.publicUrlFor(key),
      key,
      headers: {
        'Content-Type': args.contentType,
        'x-amz-acl': 'public-read',
      },
      expiresAt: new Date(Date.now() + this.ttlSeconds * 1000).toISOString(),
    };
  }

  async consumeLocalUpload(
    token: string,
    body: Buffer | undefined,
    contentType: string | undefined,
  ): Promise<void> {
    if (!this.localMode) {
      throw new BadRequestException('Local upload is disabled (S3 is configured).');
    }
    const meta = this.localTokens.get(token);
    if (!meta || meta.expiresAt < Date.now()) {
      this.localTokens.delete(token);
      throw new NotFoundException('Upload token is invalid or expired.');
    }
    if (!body || body.length === 0) {
      throw new BadRequestException('Empty upload body.');
    }
    const expectedBase = meta.contentType.split(';')[0]!.trim();
    const actualBase = (contentType ?? '').split(';')[0]!.trim();
    if (actualBase && expectedBase && !actualBase.startsWith(expectedBase)) {
      this.logger.warn(
        `Local upload Content-Type mismatch: expected ${expectedBase}, got ${actualBase}`,
      );
    }

    const fullPath = this.resolveLocalPath(meta.key);
    await fs.mkdir(dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, body);
    this.localTokens.delete(token);
    this.logger.log(
      `Local upload saved to ${meta.key} (${body.length} bytes)`,
    );
  }

  async getLocalFile(
    key: string,
  ): Promise<{ stream: ReadStream; contentType: string; size: number }> {
    if (!this.localMode) {
      throw new BadRequestException('Local media is disabled (S3 is configured).');
    }
    const fullPath = this.resolveLocalPath(key);
    let stat;
    try {
      stat = await fs.stat(fullPath);
    } catch {
      throw new NotFoundException('File not found.');
    }
    return {
      stream: createReadStream(fullPath),
      contentType: this.contentTypeFromKey(key),
      size: stat.size,
    };
  }

  publicUrlFor(key: string): string {
    if (this.forcePathStyle) {
      return `${this.endpoint.replace(/\/$/, '')}/${this.bucket}/${key}`;
    }
    const url = new URL(this.endpoint);
    return `${url.protocol}//${this.bucket}.${url.host}/${key}`;
  }

  // ---- helpers ----

  private resolveLocalPath(key: string): string {
    const sanitized = key.replace(/^[/\\]+/, '').replace(/\.\.[/\\]/g, '');
    const full = resolve(this.localDir, sanitized);
    const root = resolve(this.localDir);
    if (full !== root && !full.startsWith(root + sep)) {
      throw new BadRequestException('Invalid file path.');
    }
    return full;
  }

  private contentTypeFromKey(key: string): string {
    const lower = key.toLowerCase();
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'application/octet-stream';
  }

  private gcLocalTokens() {
    const now = Date.now();
    for (const [t, meta] of this.localTokens) {
      if (meta.expiresAt < now) this.localTokens.delete(t);
    }
  }
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'image/heic':
      return '.heic';
    default:
      return '';
  }
}
