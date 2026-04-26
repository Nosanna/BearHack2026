/**
 * Smoke test for the hard-coded Demo Home.
 *
 *   pnpm --filter @fixit/api exec tsx scripts/smoke-demo.ts
 *
 * Verifies:
 *   1. POST /demo/reset clears + seeds the user
 *   2. GET /dashboard/home returns the expected shape (>=3 rooms, tasks
 *      with whyItMatters + safetyWarnings populated, at least one OVERDUE)
 *   3. POST /demo/seed is idempotent (already_seeded after reset)
 *   4. Swiping right (POST /tasks/:id/complete) on an overdue task creates
 *      the next instance (proves the proactive recurrence loop)
 */
import 'dotenv/config';

const API = process.env.API_PUBLIC_URL ?? 'http://localhost:4000';

interface DashboardHome {
  user: { id: string; email: string };
  rooms: Array<{ id: string; name: string; applianceCount: number }>;
  upcomingTasks: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string;
    cadenceDays: number | null;
    whyItMatters: string | null;
    safetyWarnings: string[];
    source: string;
  }>;
}

async function main() {
  // 1. Dev-login
  const login = await fetch(`${API}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!login.ok) throw new Error(`dev-login: ${login.status} ${await login.text()}`);
  const { accessToken, user } = (await login.json()) as {
    accessToken: string;
    user: { email: string };
  };
  const auth = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
  console.log(`✓ dev-login as ${user.email}`);

  // 2. Reset demo (force a clean slate so the assertions below are deterministic)
  const reset = await fetch(`${API}/demo/reset`, { method: 'POST', headers: auth, body: '{}' });
  if (!reset.ok) throw new Error(`reset: ${reset.status} ${await reset.text()}`);
  const resetSummary = (await reset.json()) as {
    status: string;
    rooms: number;
    appliances: number;
    tasks: number;
  };
  console.log(
    `✓ reset → ${resetSummary.rooms} rooms, ${resetSummary.appliances} appliances, ${resetSummary.tasks} tasks`,
  );
  if (resetSummary.rooms < 3) throw new Error('expected ≥3 rooms');
  if (resetSummary.appliances < 5) throw new Error('expected ≥5 appliances');
  if (resetSummary.tasks < 6) throw new Error('expected ≥6 tasks');

  // 3. Dashboard reflects the seeded data with rich fields populated
  const dashRes = await fetch(`${API}/dashboard/home`, { headers: auth });
  if (!dashRes.ok) throw new Error(`dashboard: ${dashRes.status} ${await dashRes.text()}`);
  const dash = (await dashRes.json()) as DashboardHome;

  console.log(`  dashboard rooms: ${dash.rooms.map((r) => r.name).join(', ')}`);
  console.log(`  dashboard tasks: ${dash.upcomingTasks.length} returned (top ${Math.min(8, dash.upcomingTasks.length)} shown)`);

  if (dash.rooms.length !== resetSummary.rooms) {
    throw new Error(`dashboard rooms (${dash.rooms.length}) != seeded (${resetSummary.rooms})`);
  }

  // 3a. Status mix: at least one OVERDUE so the demo shows red dots immediately
  const overdue = dash.upcomingTasks.filter((t) => t.status === 'OVERDUE');
  if (overdue.length === 0) throw new Error('expected at least one OVERDUE task on the dashboard');
  console.log(`  overdue: ${overdue.length} (${overdue.map((t) => t.title).join('; ')})`);

  // 3b. whyItMatters + source populated on every task (proves new fields wired through)
  const missingWhy = dash.upcomingTasks.filter((t) => !t.whyItMatters);
  if (missingWhy.length > 0) throw new Error(`tasks missing whyItMatters: ${missingWhy.length}`);
  const wrongSource = dash.upcomingTasks.filter((t) => t.source !== 'ai');
  if (wrongSource.length > 0) throw new Error(`tasks with non-ai source: ${wrongSource.length}`);
  console.log(`✓ every dashboard task has whyItMatters + source='ai'`);

  // 3c. Safety warnings appear on at least one task (the dryer-vent one)
  const withSafety = dash.upcomingTasks.filter((t) => t.safetyWarnings.length > 0);
  if (withSafety.length === 0) throw new Error('expected at least one task with safetyWarnings');
  console.log(`✓ ${withSafety.length} task(s) carry safetyWarnings (e.g. "${withSafety[0]!.title}")`);

  // 4. Idempotent seed → status === 'already_seeded'
  const seedAgain = await fetch(`${API}/demo/seed`, { method: 'POST', headers: auth, body: '{}' });
  if (!seedAgain.ok) throw new Error(`seed: ${seedAgain.status} ${await seedAgain.text()}`);
  const seedSummary = (await seedAgain.json()) as { status: string };
  if (seedSummary.status !== 'already_seeded') {
    throw new Error(`expected status=already_seeded, got "${seedSummary.status}"`);
  }
  console.log(`✓ /demo/seed is idempotent (status=already_seeded)`);

  // 5. Recurrence: complete an overdue recurring task and confirm the next
  //    instance is auto-scheduled at now + cadenceDays.
  const recurring = overdue.find((t) => t.cadenceDays && t.cadenceDays > 0);
  if (!recurring) throw new Error('demo seed missing a recurring overdue task');
  const completeRes = await fetch(`${API}/tasks/${recurring.id}/complete`, {
    method: 'POST',
    headers: auth,
    body: '{}',
  });
  if (!completeRes.ok) throw new Error(`complete: ${completeRes.status} ${await completeRes.text()}`);
  const completed = (await completeRes.json()) as {
    task: { status: string };
    nextTask: { id: string; dueDate: string; title: string } | null;
  };
  if (completed.task.status !== 'COMPLETED') throw new Error('expected COMPLETED');
  if (!completed.nextTask) throw new Error('expected nextTask for recurring task');
  const expected = Date.now() + recurring.cadenceDays! * 24 * 60 * 60 * 1000;
  const skew = Math.abs(new Date(completed.nextTask.dueDate).getTime() - expected);
  if (skew > 60_000) throw new Error(`next dueDate skew too large: ${skew}ms`);
  console.log(
    `✓ proactive loop: completed "${recurring.title}" → next due in ${recurring.cadenceDays}d (skew ${skew}ms)`,
  );

  // 6. Re-reset so the on-stage demo starts clean for the user.
  const finalReset = await fetch(`${API}/demo/reset`, { method: 'POST', headers: auth, body: '{}' });
  if (!finalReset.ok) throw new Error(`final reset: ${finalReset.status}`);
  console.log(`✓ final reset — demo ready for live walkthrough`);

  console.log('\nDemo smoke test passed ✅');
}

main().catch((e) => {
  console.error('SMOKE FAILED:', e);
  process.exit(1);
});
