import {
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { DemoService } from '../demo/demo.service';
import type { LoginResponse, UserDto } from '@fixit/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;
  private readonly googleClientIds: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly demo: DemoService,
  ) {
    this.googleClientIds = [
      config.get<string>('GOOGLE_CLIENT_ID_IOS'),
      config.get<string>('GOOGLE_CLIENT_ID_ANDROID'),
      config.get<string>('GOOGLE_CLIENT_ID_WEB'),
    ].filter((v): v is string => !!v && v.length > 0);

    if (this.googleClientIds.length === 0) {
      this.logger.warn(
        'No GOOGLE_CLIENT_ID_* configured. /auth/login will reject all requests.',
      );
    }
    this.googleClient = new OAuth2Client();
  }

  async loginWithGoogle(
    idToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    if (this.googleClientIds.length === 0) {
      throw new UnauthorizedException('Google login is not configured.');
    }

    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientIds,
      });
      payload = ticket.getPayload();
    } catch (err) {
      this.logger.warn(`Google ID token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid Google ID token.');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Google ID token is missing required claims.');
    }
    if (payload.email_verified === false) {
      throw new UnauthorizedException('Google account email is not verified.');
    }

    const user = await this.prisma.user.upsert({
      where: { googleSub: payload.sub },
      create: {
        googleSub: payload.sub,
        email: payload.email,
        name: payload.name ?? null,
        avatarUrl: payload.picture ?? null,
      },
      update: {
        email: payload.email,
        name: payload.name ?? null,
        avatarUrl: payload.picture ?? null,
      },
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    const tokens = await this.issueTokens(user.id, user.email, meta);

    const dto: UserDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
    return { ...tokens, user: dto };
  }

  /**
   * Dev-only login bypass. Returns 403 unless NODE_ENV === 'development'.
   * Upserts a deterministic demo user and issues real access + refresh tokens.
   * NEVER expose this in production.
   */
  async devLogin(
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    const env = this.config.get<string>('NODE_ENV') ?? 'development';
    if (env !== 'development') {
      throw new ForbiddenException('Dev login is disabled in this environment.');
    }

    const user = await this.prisma.user.upsert({
      where: { email: 'demo@fixit.local' },
      create: {
        email: 'demo@fixit.local',
        name: 'Demo User',
      },
      update: {},
      select: { id: true, email: true, name: true, avatarUrl: true },
    });

    const tokens = await this.issueTokens(user.id, user.email, meta);
    const dto: UserDto = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
    this.logger.warn(`DEV LOGIN issued for ${user.email} (id=${user.id}).`);

    // Auto-seed the demo home for first-time dev-login users so the very
    // first screen they see has rooms, appliances, and a mix of urgent /
    // overdue / upcoming tasks. Idempotent — does nothing if already seeded.
    // Wrapped in try/catch so a seed failure can never break login.
    try {
      const summary = await this.demo.ensureSeeded(user.id);
      if (summary.status === 'seeded') {
        this.logger.log(
          `Demo home auto-seeded for ${user.email}: ${summary.rooms} rooms, ${summary.appliances} appliances, ${summary.tasks} tasks.`,
        );
      }
    } catch (e) {
      this.logger.warn(
        `Demo auto-seed failed for ${user.email} — continuing without demo data. ${(e as Error).message}`,
      );
    }

    return { ...tokens, user: dto };
  }

  async refresh(
    rawToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResponse> {
    const tokenHash = this.hashToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { id: true, email: true, name: true, avatarUrl: true } },
      },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      // Replay attack heuristic: if a previously revoked token is presented, revoke ALL of the user's tokens.
      if (stored?.revokedAt && stored.userId) {
        await this.prisma.refreshToken.updateMany({
          where: { userId: stored.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        this.logger.warn(`Refresh-token replay detected for user ${stored.userId}; revoked all sessions.`);
      }
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    const newTokens = await this.issueTokens(stored.user.id, stored.user.email, meta);

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: {
        revokedAt: new Date(),
        replacedById: this.hashToken(newTokens.refreshToken).slice(0, 16),
      },
    });

    const dto: UserDto = {
      id: stored.user.id,
      email: stored.user.email,
      name: stored.user.name,
      avatarUrl: stored.user.avatarUrl,
    };
    return { ...newTokens, user: dto };
  }

  async logout(userId: string, rawToken?: string): Promise<void> {
    if (rawToken) {
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash: this.hashToken(rawToken), userId },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  private async issueTokens(
    userId: string,
    email: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL') ?? '15m',
      },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = this.parseDays(this.config.get<string>('JWT_REFRESH_TTL') ?? '30d');
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
        userAgent: meta.userAgent ?? null,
        ip: meta.ip ?? null,
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }

  private parseDays(input: string): number {
    const m = /^(\d+)d$/i.exec(input.trim());
    if (m) return Number(m[1]);
    const num = Number(input);
    return Number.isFinite(num) ? num : 30;
  }
}
