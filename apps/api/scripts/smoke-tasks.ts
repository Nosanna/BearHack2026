/**
 * Smoke test for Tier 1 proactive-system endpoints.
 *
 * Runs end-to-end against a locally running API:
 *   - dev-login → JWT
 *   - directly seeds a recurring + a one-off MaintenanceTask via Prisma
 *   - hits POST /tasks/:id/complete   (recurring) → expects nextTask in response
 *   - hits POST /tasks/:id/complete   (one-off)   → expects nextTask: null
 *   - hits POST /tasks/:id/snooze     (third)     → expects dueDate +7d
 *
 * Usage:
 *   pnpm --filter @fixit/api exec tsx scripts/smoke-tasks.ts
 */
import 'dotenv/config';
import { PrismaClient, TaskStatus } from '@prisma/client';

const API = process.env.API_PUBLIC_URL ?? 'http://localhost:4000';

async function main() {
  const prisma = new PrismaClient();

  // 1. Dev login
  const login = await fetch(`${API}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!login.ok) {
    throw new Error(`dev-login failed: ${login.status} ${await login.text()}`);
  }
  const { accessToken, user } = (await login.json()) as {
    accessToken: string;
    user: { id: string; email: string };
  };
  console.log(`✓ dev-login as ${user.email} (${user.id})`);

  const auth = { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  // 2. Make sure we have a room + appliance to attach tasks to.
  let appliance = await prisma.appliance.findFirst({
    where: { ownerId: user.id },
    select: { id: true, type: true, nickname: true },
  });
  if (!appliance) {
    const room = await prisma.room.create({
      data: { ownerId: user.id, name: 'Smoke-Test Kitchen' },
    });
    appliance = await prisma.appliance.create({
      data: {
        ownerId: user.id,
        roomId: room.id,
        type: 'DISHWASHER',
        nickname: 'Smoke-Test Dishwasher',
      },
      select: { id: true, type: true, nickname: true },
    });
    console.log(`  seeded room + appliance ${appliance.id}`);
  } else {
    console.log(`✓ reusing appliance ${appliance.id} (${appliance.type})`);
  }

  const now = Date.now();
  const dueIn3Days = new Date(now + 3 * 24 * 60 * 60 * 1000);
  const dueIn5Days = new Date(now + 5 * 24 * 60 * 60 * 1000);
  const dueIn7Days = new Date(now + 7 * 24 * 60 * 60 * 1000);

  const recurring = await prisma.maintenanceTask.create({
    data: {
      ownerId: user.id,
      applianceId: appliance.id,
      title: `[smoke] recurring ${now}`,
      description: 'Created by smoke-tasks.ts',
      dueDate: dueIn3Days,
      status: TaskStatus.PENDING,
      cadenceDays: 30,
      estimatedMinutes: 10,
      safetyWarnings: ['Smoke-test warning'],
      whyItMatters: 'Smoke-test why',
      source: 'manual',
    },
  });

  const oneOff = await prisma.maintenanceTask.create({
    data: {
      ownerId: user.id,
      applianceId: appliance.id,
      title: `[smoke] one-off ${now}`,
      dueDate: dueIn5Days,
      status: TaskStatus.PENDING,
      source: 'manual',
    },
  });

  const snoozeMe = await prisma.maintenanceTask.create({
    data: {
      ownerId: user.id,
      applianceId: appliance.id,
      title: `[smoke] snooze ${now}`,
      dueDate: dueIn7Days,
      status: TaskStatus.PENDING,
      source: 'manual',
    },
  });

  console.log(`  seeded 3 tasks: recurring=${recurring.id} one-off=${oneOff.id} snooze=${snoozeMe.id}`);

  // 3. Complete the recurring task → expect a next instance.
  let res = await fetch(`${API}/tasks/${recurring.id}/complete`, {
    method: 'POST',
    headers: auth,
    body: '{}',
  });
  let body = await res.json();
  if (!res.ok) throw new Error(`complete recurring failed: ${res.status} ${JSON.stringify(body)}`);
  if (body.task.status !== 'COMPLETED') throw new Error('expected status=COMPLETED');
  if (!body.nextTask) throw new Error('expected nextTask for recurring task');
  if (body.nextTask.title !== recurring.title) throw new Error('next task title mismatch');
  if (body.nextTask.cadenceDays !== 30) throw new Error('next task cadence mismatch');
  const nextDue = new Date(body.nextTask.dueDate).getTime();
  const expected = now + 30 * 24 * 60 * 60 * 1000;
  const skewMs = Math.abs(nextDue - expected);
  if (skewMs > 60_000) throw new Error(`next dueDate skew too large: ${skewMs}ms`);
  console.log(`✓ recurring complete → next ${body.nextTask.id} due ${body.nextTask.dueDate} (skew ${skewMs}ms)`);

  // 4. Complete the one-off task → expect nextTask=null.
  res = await fetch(`${API}/tasks/${oneOff.id}/complete`, {
    method: 'POST',
    headers: auth,
    body: '{}',
  });
  body = await res.json();
  if (!res.ok) throw new Error(`complete one-off failed: ${res.status} ${JSON.stringify(body)}`);
  if (body.nextTask !== null) throw new Error(`expected nextTask=null for one-off, got ${JSON.stringify(body.nextTask)}`);
  console.log(`✓ one-off complete → nextTask=null`);

  // 5. Snooze the third task by 14 days; verify dueDate jumps ~14d.
  const before = snoozeMe.dueDate.getTime();
  res = await fetch(`${API}/tasks/${snoozeMe.id}/snooze`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ days: 14 }),
  });
  body = await res.json();
  if (!res.ok) throw new Error(`snooze failed: ${res.status} ${JSON.stringify(body)}`);
  const after = new Date(body.task.dueDate).getTime();
  const delta = after - before;
  const expectedDelta = 14 * 24 * 60 * 60 * 1000;
  if (Math.abs(delta - expectedDelta) > 60_000) {
    throw new Error(`snooze delta off: got ${delta}, expected ~${expectedDelta}`);
  }
  if (body.task.status !== 'PENDING') throw new Error(`expected status=PENDING after snooze, got ${body.task.status}`);
  console.log(`✓ snooze → dueDate +14d (delta ${Math.round(delta / 86400000)}d, status ${body.task.status})`);

  // 6. Sanity check: completing an already-completed task should 400.
  res = await fetch(`${API}/tasks/${recurring.id}/complete`, {
    method: 'POST',
    headers: auth,
    body: '{}',
  });
  if (res.status !== 400) {
    throw new Error(`expected 400 when re-completing, got ${res.status}`);
  }
  console.log(`✓ re-completing already-completed task → 400`);

  // 7. Cleanup: remove the smoke tasks (and the auto-created next one).
  const cleanup = await prisma.maintenanceTask.deleteMany({
    where: {
      ownerId: user.id,
      title: { startsWith: '[smoke]' },
    },
  });
  console.log(`✓ cleanup removed ${cleanup.count} smoke tasks`);

  await prisma.$disconnect();
  console.log('\nAll Tier 1 task-action smoke checks passed ✅');
}

main().catch(async (e) => {
  console.error('SMOKE FAILED:', e);
  process.exit(1);
});
