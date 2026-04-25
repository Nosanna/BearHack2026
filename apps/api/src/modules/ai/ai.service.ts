// Gemini multi-model fallback: see resolveModelChain + runWithFallback below.
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import {
  ApplianceType,
  type RepairPlanPayload,
  type RepairStateMachine,
} from '@fixit/shared';
import {
  PLANNER_SYSTEM_PROMPT,
  REGISTER_FROM_IMAGE_SYSTEM_PROMPT,
  VERIFY_PHOTO_SYSTEM_PROMPT,
} from './prompts';

export interface ApplianceDetection {
  type: ApplianceType;
  brand: string | null;
  model: string | null;
  confidence: number;
}

export interface PhotoVerification {
  passed: boolean;
  found: string[];
  missing: string[];
  feedback: string;
}

/** Default fallback chains for each task. Highest-quality first; each
 * subsequent model has a different/larger free-tier daily quota so we can
 * keep serving traffic if the primary is exhausted. */
const DEFAULT_PLANNER_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];
const DEFAULT_VISION_CHAIN = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: GoogleGenAI | null;
  private readonly plannerModels: string[];
  private readonly visionModels: string[];
  private readonly callTimeoutMs: number;

  constructor(private readonly config: ConfigService) {
    const apiKey = config.get<string>('GEMINI_API_KEY');
    this.plannerModels = resolveModelChain(
      config.get<string>('GEMINI_PLANNER_MODELS'),
      config.get<string>('GEMINI_PLANNER_MODEL'),
      DEFAULT_PLANNER_CHAIN,
    );
    this.visionModels = resolveModelChain(
      config.get<string>('GEMINI_VISION_MODELS'),
      config.get<string>('GEMINI_VISION_MODEL'),
      DEFAULT_VISION_CHAIN,
    );
    this.callTimeoutMs = Number(config.get<string>('GEMINI_TIMEOUT_MS') ?? '30000');

    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY not set — AI calls will return stub responses.');
      this.client = null;
    } else {
      this.client = new GoogleGenAI({ apiKey });
      this.logger.log(
        `Gemini chains — planner: [${this.plannerModels.join(' → ')}], vision: [${this.visionModels.join(' → ')}]`,
      );
    }
  }

  /**
   * Run a Gemini call with a hard timeout. Logs latency, model, and token
   * usage on success; logs the failure reason and elapsed time on failure.
   */
  private async runWithTelemetry<T>(
    label: string,
    model: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const start = Date.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.callTimeoutMs);
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          ctrl.signal.addEventListener('abort', () =>
            reject(
              new InternalServerErrorException(
                `${label} (${model}) timed out after ${this.callTimeoutMs}ms`,
              ),
            ),
          );
        }),
      ]);
      const ms = Date.now() - start;
      const usage = (result as unknown as {
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number; thoughtsTokenCount?: number };
      }).usageMetadata;
      this.logger.log(
        `[gemini] ${label} model=${model} ${ms}ms` +
          (usage
            ? ` tokens=${usage.totalTokenCount} (prompt=${usage.promptTokenCount} thoughts=${usage.thoughtsTokenCount ?? 0} output=${usage.candidatesTokenCount})`
            : ''),
      );
      return result;
    } catch (e) {
      const ms = Date.now() - start;
      this.logger.error(
        `[gemini] ${label} model=${model} FAILED after ${ms}ms: ${(e as Error).message}`,
      );
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Try each model in `chain` in order. If a model fails with a recoverable
   * error (quota exhausted, rate-limited, transient unavailability, timeout),
   * cascade to the next one. Returns the first successful result, plus the
   * model name that produced it. Throws the last error if every model fails.
   */
  private async runWithFallback<T>(
    label: string,
    chain: string[],
    buildCall: (model: string) => Promise<T>,
  ): Promise<{ result: T; model: string }> {
    let lastError: unknown;
    for (let i = 0; i < chain.length; i++) {
      const model = chain[i]!;
      const isLast = i === chain.length - 1;
      try {
        const result = await this.runWithTelemetry(label, model, () =>
          buildCall(model),
        );
        if (i > 0) {
          this.logger.warn(
            `[gemini] ${label} succeeded on fallback model "${model}" (position ${i + 1} in chain).`,
          );
        }
        return { result, model };
      } catch (e) {
        lastError = e;
        if (isLast || !isRecoverableModelError(e)) throw e;
        const nextModel = chain[i + 1]!;
        this.logger.warn(
          `[gemini] ${label} on "${model}" hit recoverable error — falling back to "${nextModel}". (${shortError(e)})`,
        );
      }
    }
    throw lastError;
  }

  // ---- Planner ----

  async generateRepairPlan(input: {
    applianceType: ApplianceType;
    symptom: string;
    manualExcerpts?: string;
  }): Promise<RepairPlanPayload & { modelName: string }> {
    if (!this.client) return { ...stubPlan(input.symptom), modelName: 'stub' };

    const userText = [
      `Appliance type: ${input.applianceType}`,
      `Symptom: ${input.symptom}`,
      input.manualExcerpts ? `Manual excerpts:\n${input.manualExcerpts}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');

    const { result: response, model } = await this.runWithFallback(
      'planner',
      this.plannerModels,
      (m) =>
        this.client!.models.generateContent({
          model: m,
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          config: {
            systemInstruction: PLANNER_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
    );

    const raw = extractText(response);
    const parsed = safeJsonParse<RepairPlanPayload>(raw);
    if (!parsed) {
      this.logger.error(`Planner returned non-JSON output: ${raw.slice(0, 500)}`);
      throw new InternalServerErrorException('Planner returned invalid JSON.');
    }
    if (!isValidStateMachine(parsed.state_machine)) {
      this.logger.error(
        `Planner returned an invalid state machine: ${JSON.stringify(parsed).slice(0, 500)}`,
      );
      throw new InternalServerErrorException('Planner returned an invalid state machine.');
    }
    return { ...parsed, modelName: model };
  }

  // ---- Vision: appliance recognition ----

  async detectApplianceFromImage(imageUrl: string): Promise<ApplianceDetection> {
    if (!this.client) {
      return { type: ApplianceType.OTHER, brand: null, model: null, confidence: 0.0 };
    }

    const inline = await fetchImageAsInlinePart(imageUrl);
    const { result: response } = await this.runWithFallback(
      'detect-appliance',
      this.visionModels,
      (m) =>
        this.client!.models.generateContent({
          model: m,
          contents: [
            {
              role: 'user',
              parts: [
                inline,
                { text: 'Identify the appliance in this photo per the JSON contract.' },
              ],
            },
          ],
          config: {
            systemInstruction: REGISTER_FROM_IMAGE_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
    );

    const raw = extractText(response);
    const parsed = safeJsonParse<ApplianceDetection>(raw);
    if (!parsed || !(parsed.type in ApplianceType)) {
      this.logger.warn(`Vision returned unparseable detection: ${raw.slice(0, 200)}`);
      return { type: ApplianceType.OTHER, brand: null, model: null, confidence: 0.0 };
    }
    return {
      type: parsed.type,
      brand: parsed.brand ?? null,
      model: parsed.model ?? null,
      confidence: clamp01(parsed.confidence ?? 0),
    };
  }

  // ---- Vision: repair-step photo verification ----

  async verifyPhoto(input: {
    imageUrl: string;
    expectedVisual: string[];
  }): Promise<PhotoVerification> {
    if (!this.client) {
      return {
        passed: true,
        found: input.expectedVisual,
        missing: [],
        feedback: '(Stubbed) Photo accepted — set GEMINI_API_KEY to enable real verification.',
      };
    }

    const inline = await fetchImageAsInlinePart(input.imageUrl);
    const { result: response } = await this.runWithFallback(
      'verify-photo',
      this.visionModels,
      (m) =>
        this.client!.models.generateContent({
          model: m,
          contents: [
            {
              role: 'user',
              parts: [
                inline,
                {
                  text: `expected_visual = ${JSON.stringify(input.expectedVisual)}`,
                },
              ],
            },
          ],
          config: {
            systemInstruction: VERIFY_PHOTO_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            temperature: 0.0,
          },
        }),
    );

    const raw = extractText(response);
    const parsed = safeJsonParse<PhotoVerification>(raw);
    if (!parsed || typeof parsed.passed !== 'boolean') {
      this.logger.warn(`Vision verify returned unparseable output: ${raw.slice(0, 200)}`);
      return {
        passed: false,
        found: [],
        missing: input.expectedVisual,
        feedback: 'Could not analyze the photo — please retake it with better lighting.',
      };
    }
    return {
      passed: parsed.passed,
      found: Array.isArray(parsed.found) ? parsed.found : [],
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      feedback: typeof parsed.feedback === 'string' ? parsed.feedback : '',
    };
  }
}

// ---- helpers ----

/**
 * Parse a model chain from env. Priority:
 *   1. explicit comma-separated `*_MODELS` (preferred)
 *   2. legacy single `*_MODEL` (becomes a single-entry chain — back-compat)
 *   3. built-in default chain
 * Whitespace and empty entries are stripped; duplicates removed.
 */
function resolveModelChain(
  csv: string | undefined,
  legacySingle: string | undefined,
  fallbackDefault: string[],
): string[] {
  const parse = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  let list: string[] = [];
  if (csv && csv.trim().length > 0) list = parse(csv);
  else if (legacySingle && legacySingle.trim().length > 0)
    list = [legacySingle.trim()];
  else list = [...fallbackDefault];
  return Array.from(new Set(list));
}

/**
 * True when the error from a model call is something that another model in
 * the chain might survive: quota exhaustion, rate limit, transient
 * unavailability, server overload, or our own client-side timeout.
 *
 * False for hard errors that won't improve by switching models (auth,
 * malformed-request, etc.) so we don't waste budget cascading.
 */
function isRecoverableModelError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as { status?: number; code?: number | string; message?: string };
  const status =
    typeof err.status === 'number'
      ? err.status
      : typeof err.code === 'number'
        ? err.code
        : undefined;
  if (status === 429 || status === 500 || status === 503 || status === 504) return true;
  const msg = (err.message ?? '').toString();
  return /RESOURCE_EXHAUSTED|UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|quota|rate.?limit|overloaded|timed out|too many requests/i.test(
    msg,
  );
}

function shortError(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  return msg.length > 160 ? `${msg.slice(0, 157)}…` : msg;
}

function extractText(response: unknown): string {
  // The new @google/genai SDK exposes .text on the response. Be defensive.
  const r = response as { text?: string | (() => string); response?: { text?: () => string } };
  if (typeof r.text === 'string') return r.text;
  if (typeof r.text === 'function') return r.text();
  if (r.response?.text) return r.response.text();
  return '';
}

function safeJsonParse<T>(input: string): T | null {
  if (!input) return null;
  try {
    return JSON.parse(input) as T;
  } catch {
    // Strip ```json fences if the model added them despite responseMimeType.
    const stripped = input.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    try {
      return JSON.parse(stripped) as T;
    } catch {
      return null;
    }
  }
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function isValidStateMachine(sm: RepairStateMachine | undefined): boolean {
  if (!sm || sm.version !== 1) return false;
  if (typeof sm.start_state !== 'string') return false;
  if (!sm.states || typeof sm.states !== 'object') return false;
  if (!sm.states[sm.start_state]) return false;
  for (const [, state] of Object.entries(sm.states)) {
    if (!state || typeof state !== 'object' || !('type' in state)) return false;
    switch (state.type) {
      case 'instruction':
        if (!sm.states[state.next]) return false;
        break;
      case 'verify_photo':
        if (!sm.states[state.pass] || !sm.states[state.fail]) return false;
        break;
      case 'question':
        if (state.next && !sm.states[state.next]) return false;
        if (state.branches) {
          for (const b of state.branches) if (!sm.states[b.next]) return false;
        }
        break;
      case 'complete':
      case 'escalate':
        break;
      default:
        return false;
    }
  }
  return true;
}

async function fetchImageAsInlinePart(imageUrl: string): Promise<{
  inlineData: { mimeType: string; data: string };
}> {
  if (imageUrl.startsWith('data:')) {
    const match = /^data:([^;]+);base64,(.*)$/i.exec(imageUrl);
    if (!match) throw new InternalServerErrorException('Malformed data URL.');
    return { inlineData: { mimeType: match[1]!, data: match[2]! } };
  }

  const res = await fetch(imageUrl);
  if (!res.ok) {
    throw new InternalServerErrorException(
      `Failed to download image (${res.status}) from ${imageUrl}`,
    );
  }
  const mimeType = res.headers.get('content-type') ?? 'image/jpeg';
  const buf = Buffer.from(await res.arrayBuffer());
  return { inlineData: { mimeType, data: buf.toString('base64') } };
}

function stubPlan(symptom: string): RepairPlanPayload {
  return {
    diagnosis: `Stub diagnosis for symptom: ${symptom}`,
    safety_warnings: ['Set GEMINI_API_KEY to receive real planning output.'],
    state_machine: {
      version: 1,
      start_state: 'S1',
      states: {
        S1: {
          type: 'instruction',
          text: 'Unplug the appliance from power.',
          next: 'S2',
          safetyWarnings: ['Always disconnect power before inspection.'],
        },
        S2: {
          type: 'verify_photo',
          text: 'Take a photo showing the unplugged power cord.',
          expected_visual: ['power cord visibly disconnected'],
          pass: 'S3',
          fail: 'S1',
        },
        S3: { type: 'complete', text: 'Stub plan completed. Configure Gemini for full guidance.' },
      },
    },
  };
}
