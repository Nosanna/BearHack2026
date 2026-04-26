import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();

    // #region agent log
    fetch('http://127.0.0.1:7398/ingest/858e3ef0-15fa-4006-be55-bfedf1b0470c', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '239de5' },
      body: JSON.stringify({
        sessionId: '239de5',
        runId: 'pre-fix',
        hypothesisId: 'H1',
        location: 'apps/api/src/prisma/prisma.service.ts:onModuleInit',
        message: 'Prisma connected; reporting migration status',
        data: { databaseUrl: sanitizeDbUrl(process.env.DATABASE_URL ?? '') },
        timestamp: Date.now(),
      }),
    }).catch(() => {});

    try {
      const rows = await this.$queryRawUnsafe<
        Array<{ migration_name: string; finished_at: Date | null }>
      >(
        'select migration_name, finished_at from "_prisma_migrations" order by finished_at desc nulls last limit 5',
      );
      fetch('http://127.0.0.1:7398/ingest/858e3ef0-15fa-4006-be55-bfedf1b0470c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '239de5' },
        body: JSON.stringify({
          sessionId: '239de5',
          runId: 'pre-fix',
          hypothesisId: 'H2',
          location: 'apps/api/src/prisma/prisma.service.ts:onModuleInit',
          message: 'Recent prisma migrations (top 5)',
          data: { migrations: rows.map((r) => ({ name: r.migration_name, finishedAt: r.finished_at?.toISOString() ?? null })) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch (e) {
      fetch('http://127.0.0.1:7398/ingest/858e3ef0-15fa-4006-be55-bfedf1b0470c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '239de5' },
        body: JSON.stringify({
          sessionId: '239de5',
          runId: 'pre-fix',
          hypothesisId: 'H3',
          location: 'apps/api/src/prisma/prisma.service.ts:onModuleInit',
          message: 'Failed reading _prisma_migrations',
          data: { message: (e as Error)?.message ?? String(e) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    }
    // #endregion agent log
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

function sanitizeDbUrl(url: string) {
  try {
    const u = new URL(url);
    // never log credentials
    u.username = '';
    u.password = '';
    return `${u.protocol}//${u.host}${u.pathname}${u.search}`;
  } catch {
    return '';
  }
}
