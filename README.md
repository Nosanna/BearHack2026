# Fixit Fred

AI-powered home appliance repair and maintenance assistant.

- Snap a photo of an appliance — we identify it and add it to your home.
- Describe a symptom — Gemini generates a safe step-by-step repair plan as a state machine.
- Each step is either an instruction, a question, or a "verify by photo" gate the vision model checks before letting you proceed.
- Recurring maintenance tasks are auto-generated per appliance type and surfaced on a schedule.

## Stack

| Layer | Tech |
| --- | --- |
| API | NestJS 10, Prisma 5, Postgres 16, Redis 7, BullMQ |
| AI | Google Gemini (planner + vision) via `@google/genai` |
| Storage | Vultr Object Storage (S3-compatible), pre-signed PUT URLs |
| Auth | Google ID token exchange → app-issued JWT (access + refresh, rotation) |
| Mobile | Expo SDK 51, React Navigation, TanStack Query, expo-camera |
| Shared types | `packages/shared` (state machine schema, DTOs, enums) |

## Repo layout

```
.
├── apps/
│   ├── api/          NestJS backend (Prisma, queues, AI, repair engine)
│   └── mobile/       Expo React Native app
├── packages/
│   └── shared/       Cross-cutting types (state machine, DTOs)
├── docker-compose.yml  Postgres + Redis for local dev
└── pnpm-workspace.yaml
```

## Prerequisites

- Node.js 20+ (`.nvmrc` provided)
- pnpm 9+
- Docker (for local Postgres + Redis)
- Expo Go app on your phone, or an Android/iOS emulator

## First-time setup

```bash
# 1. Install dependencies (one workspace install for everything)
pnpm install

# 2. Bring up Postgres + Redis
pnpm dev:infra

# 3. Configure env
cp .env.example apps/api/.env
# (fill in GEMINI_API_KEY, GOOGLE_CLIENT_ID_*, S3_*; the app runs in stub mode without them)

# 4. Apply schema and seed demo data
pnpm prisma:generate
pnpm prisma:migrate -- --name init
pnpm --filter @fixit/api prisma:seed
```

## Running the MVP

In two terminals:

```bash
# Terminal 1 — API + queue workers
pnpm dev:api
# → http://localhost:4000  (Swagger UI: /docs)
```

```bash
# Terminal 2 — Mobile (Expo)
pnpm dev:mobile
# Press i (iOS sim), a (Android emulator), or scan the QR with Expo Go.
```

If you're running the mobile app on a physical phone, set `EXPO_PUBLIC_API_URL`
to your machine's LAN IP (e.g. `http://192.168.1.42:4000`) before
`pnpm dev:mobile`, otherwise the app can't reach the API.

## What works without external keys

- **No `GEMINI_API_KEY`**: planner returns a stubbed 3-state plan; vision returns "OTHER, confidence 0" for appliance recognition and "passed=true (stubbed)" for photo verification. The whole repair flow still works end-to-end.
- **No `S3_*` credentials**: the `/media/signed-upload` endpoint returns a URL, but PUTs will be rejected by Vultr. Use the seeded demo appliance to exercise the repair flow without uploads.
- **No `GOOGLE_CLIENT_ID_*`**: `/auth/login` rejects all requests. For early development you can add a tiny test-only login or hit the API with a JWT minted via `node -e "..."` — left as a follow-up.

## Endpoints (spec 03_openapi_spec.md)

All require `Authorization: Bearer <accessToken>` except `/auth/login` and `/auth/refresh`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/login` | Exchange a Google ID token for app JWTs. |
| POST | `/auth/refresh` | Rotate refresh token (returns new access + refresh). |
| POST | `/auth/logout` | Revoke a refresh token (or all, if body is empty). |
| GET | `/dashboard/home` | Hydrated home: user, rooms, upcoming tasks, active repair. |
| GET | `/rooms` · POST `/rooms` | List/create rooms. |
| GET | `/appliances` | List user's appliances. |
| POST | `/appliances/register-from-image` | Vision → persist appliance. |
| GET | `/appliances/:id/detail` | Full appliance, images, tasks, recent repairs. |
| GET | `/schedule/upcoming` | Tasks due in the next 30 days. |
| POST | `/media/signed-upload` | Presigned S3 PUT for photo uploads. |
| POST | `/repair/start` | Generate plan + start session. |
| POST | `/repair/:id/respond` | Submit a textual answer; advances the state machine. |
| POST | `/repair/:id/photo` | Submit a photo URL; vision verifies and advances. |

## State machine (spec 04)

```ts
type RepairState =
  | { type: 'instruction'; text: string; next: string; safetyWarnings?: string[] }
  | { type: 'question'; text: string; next?: string; branches?: { match: string; next: string }[] }
  | { type: 'verify_photo'; text?: string; expected_visual: string[]; pass: string; fail: string }
  | { type: 'complete'; text: string }
  | { type: 'escalate'; text: string; reason: string };
```

Persistence: `RepairPlan.stateMachine` (JSON) + `RepairSession.currentStateId` (pointer) + `RepairEvent` (audit log of every transition, answer, and photo verdict).

## Background jobs (spec 07)

| Queue | Schedule | What it does |
| --- | --- | --- |
| `daily-maintenance-scan` | `0 3 * * *` UTC | Marks `OVERDUE` and enqueues "due in 24h" notifications. |
| `send-notifications` | on-demand | Persists `Notification` rows. |
| `generate-maintenance-plan` | on-demand (after register / repair start) | Inserts type-specific recurring tasks. |
| `cleanup-abandoned-repair-sessions` | every 30m | Marks sessions inactive >48h as `ABANDONED`. |

## Security checklist (spec 10)

- [x] JWT access + refresh tokens; refresh rotation with replay-detection (revokes all sessions on reuse).
- [x] Rate limiting via `@nestjs/throttler` (defaults: 120 req / 60s / IP).
- [x] Secrets read from env only.
- [x] Ownership checks on every cross-resource access (rooms, appliances, repair sessions).
- [x] Signed upload URLs (S3 PUT, expires in 15m) — the API never streams uploads.
- [x] `RepairEvent` audit log — every state transition / answer / photo verdict is persisted.

## Deferred (not in MVP)

These are sketched in the specs but not part of this branch:

- Vultr deploy / Dockerfile / Nginx / Let's Encrypt (`08_vultr_deploy.md`).
- GitHub Actions CI (`09_ci_cd.md`).
- Push notifications (only in-app `Notification` rows are written today).

## Troubleshooting

- **Prisma client out of date**: `pnpm prisma:generate`.
- **Reset the dev DB**: `docker compose down -v && pnpm dev:infra && pnpm prisma:migrate`.
- **Mobile can't reach the API on a phone**: set `EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000` before starting Expo.
- **Gemini "model not found"**: switch `GEMINI_PLANNER_MODEL` / `GEMINI_VISION_MODEL` to `gemini-1.5-flash` if your key doesn't have access to 2.0.
