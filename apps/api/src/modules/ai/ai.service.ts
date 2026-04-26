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
  BroadCategory,
  type RepairPlanPayload,
  type RepairStateMachine,
} from '@fixit/shared';
import {
  MAINTENANCE_PLANNER_SYSTEM_PROMPT,
  PLANNER_SYSTEM_PROMPT,
  REGISTER_FROM_IMAGE_SYSTEM_PROMPT,
  VERIFY_PHOTO_SYSTEM_PROMPT,
} from './prompts';

export interface ApplianceDetection {
  type: ApplianceType;
  typeOptions?: Array<{ type: ApplianceType; confidence: number }>;
  brand: string | null;
  model: string | null;
  confidence: number;
  /** 1-3 word natural language description (e.g. "Coffee maker"). */
  categoryGuess?: string | null;
  /** Coarser bucket for items that don't fit the strict ApplianceType union. */
  broadCategory?: BroadCategory | null;
}

export interface PhotoVerification {
  passed: boolean;
  found: string[];
  missing: string[];
  feedback: string;
}

export interface MaintenanceTaskTemplate {
  title: string;
  description: string;
  category?: string;
  focusPart?: string;
  cadenceDays: number;
  estimatedMinutes: number;
  safetyWarnings: string[];
  whyItMatters: string;
}

export interface MaintenancePlan {
  tasks: MaintenanceTaskTemplate[];
  modelName: string;
}

export interface SuggestedMaintenanceTask {
  title: string;
  description: string;
  cadenceDays: 1 | 7 | 30;
  estimatedMinutes: number;
  safetyWarnings: string[];
  whyItMatters: string;
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

  async detectApplianceFromImage(object: string, imageUrl: string): Promise<ApplianceDetection> {
    if (!this.client) {
      return {
        type: ApplianceType.OTHER,
        typeOptions: [{ type: ApplianceType.OTHER, confidence: 0.0 }],
        brand: null,
        model: null,
        confidence: 0.0,
        categoryGuess: null,
        broadCategory: null,
      };
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
                { text: `Identify the ${object} in this photo per the JSON contract.` },
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
      return {
        type: ApplianceType.OTHER,
        typeOptions: [{ type: ApplianceType.OTHER, confidence: 0.0 }],
        brand: null,
        model: null,
        confidence: 0.0,
        categoryGuess: null,
        broadCategory: null,
      };
    }

    const cleanedOptions =
      Array.isArray(parsed.typeOptions) && parsed.typeOptions.length > 0
        ? parsed.typeOptions
            .filter(
              (o): o is { type: ApplianceType; confidence: number } =>
                !!o &&
                typeof o === 'object' &&
                'type' in o &&
                'confidence' in o &&
                typeof (o as any).confidence === 'number' &&
                (o as any).type in ApplianceType,
            )
            .map((o) => ({ type: o.type, confidence: clamp01(o.confidence) }))
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 3)
        : [{ type: parsed.type, confidence: clamp01(parsed.confidence ?? 0) }];

    const rawGuess = (parsed as any).categoryGuess;
    const categoryGuess =
      typeof rawGuess === 'string' && rawGuess.trim().length > 0
        ? rawGuess.trim().slice(0, 60)
        : null;

    const rawBroad = (parsed as any).broadCategory;
    const broadCategory: BroadCategory | null =
      typeof rawBroad === 'string' && rawBroad in BroadCategory
        ? (rawBroad as BroadCategory)
        : null;

    return {
      type: parsed.type,
      typeOptions: cleanedOptions,
      brand: parsed.brand ?? null,
      model: parsed.model ?? null,
      confidence: clamp01(parsed.confidence ?? 0),
      categoryGuess,
      broadCategory,
    };
  }

  async topObjectFromGoogleVision(imageUrl: string): Promise<string> {
    const key = this.config.get<string>('GOOGLE_VISION_API_KEY');
    if (!key) return 'appliance';
    try {
      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { source: { imageUri: imageUrl } },
              features: [
                { type: 'OBJECT_LOCALIZATION', maxResults: 10 },
                { type: 'LABEL_DETECTION', maxResults: 10 },
              ],
            },
          ],
        }),
      });
      const json = (await res.json().catch(() => null)) as any;
      const r0 = json?.responses?.[0];
      const objs: Array<{ name?: string; score?: number }> = r0?.localizedObjectAnnotations ?? [];
      const labels: Array<{ description?: string; score?: number }> = r0?.labelAnnotations ?? [];
      const topObj = objs
        .filter((o) => typeof o?.score === 'number' && !!o?.name)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      if (topObj?.name) return String(topObj.name);
      const topLabel = labels
        .filter((l) => typeof l?.score === 'number' && !!l?.description)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      if (topLabel?.description) return String(topLabel.description);
      return 'appliance';
    } catch {
      return 'appliance';
    }
  }

  async getSuggestedMaintenanceTasks(input: {
    applianceType: ApplianceType;
    brand: string;
    modelId?: string;
    imageUrl?: string;
  }): Promise<SuggestedMaintenanceTask[]> {
    if (!this.client) {
      throw new InternalServerErrorException('GEMINI_API_KEY not set.');
    }
    const subject =
      input.modelId && input.modelId.trim()
        ? `${input.brand} ${input.modelId} ${input.applianceType}`
        : `${input.brand} ${input.applianceType}`;

    const prompt =
      `Return daily, weekly, and monthly maintenance tasks for the ${subject}.\n` +
      `These tasks must be homeowner-safe and specific to appliance maintenance.\n` +
      `You MUST output ONLY valid JSON in this exact format:\n` +
      `[` +
      `{` +
      `"title": "",` +
      `"description": "",` +
      `"cadenceDays": 1 | 7 | 30,` +
      `"estimatedMinutes": number,` +
      `"safetyWarnings": string[],` +
      `"whyItMatters": ""` +
      `}` +
      `]\n` +
      `Rules:\n` +
      `- Return exactly 3 tasks: one with cadenceDays=1, one with cadenceDays=7, one with cadenceDays=30.\n` +
      `- Keep titles 3–8 words.\n` +
      `- safetyWarnings must be actionable and may be empty.\n`;

    const inline = input.imageUrl ? await fetchImageAsInlinePart(input.imageUrl) : null;

    const { result: response } = await this.runWithFallback(
      'suggest-maintenance-tasks',
      this.plannerModels,
      (m) =>
        this.client!.models.generateContent({
          model: m,
          contents: [
            {
              role: 'user',
              parts: inline ? [inline, { text: prompt }] : [{ text: prompt }],
            },
          ],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }),
    );

    const raw = extractText(response);
    const parsed = safeJsonParse<unknown>(raw);
    if (!Array.isArray(parsed)) {
      this.logger.warn(`Task suggestions returned non-array JSON: ${raw.slice(0, 200)}`);
      throw new InternalServerErrorException('Task suggestion returned invalid JSON.');
    }
    const cleaned = parsed
      .filter((x): x is any => !!x && typeof x === 'object')
      .map((x) => ({
        title: String((x as any).title ?? '').trim(),
        description: String((x as any).description ?? '').trim(),
        cadenceDays: Number((x as any).cadenceDays ?? 0) as 1 | 7 | 30,
        estimatedMinutes: Number((x as any).estimatedMinutes ?? 0),
        safetyWarnings: Array.isArray((x as any).safetyWarnings)
          ? (x as any).safetyWarnings.map((s: any) => String(s)).filter(Boolean)
          : [],
        whyItMatters: String((x as any).whyItMatters ?? '').trim(),
      }))
      .filter(
        (t) =>
          t.title &&
          t.description &&
          (t.cadenceDays === 1 || t.cadenceDays === 7 || t.cadenceDays === 30) &&
          Number.isFinite(t.estimatedMinutes) &&
          t.estimatedMinutes > 0 &&
          t.whyItMatters,
      );

    // Ensure we have 1/7/30 specifically; if not, fail fast so caller can retry.
    const byCadence = new Map<number, SuggestedMaintenanceTask>();
    for (const t of cleaned) if (!byCadence.has(t.cadenceDays)) byCadence.set(t.cadenceDays, t);
    const out = [byCadence.get(1), byCadence.get(7), byCadence.get(30)].filter(Boolean) as SuggestedMaintenanceTask[];
    if (out.length !== 3) {
      throw new InternalServerErrorException('Task suggestion missing required cadences (1/7/30).');
    }
    return out;
  }

  // ---- Planner: maintenance plan ----

  /**
   * Generate a list of recurring maintenance tasks tailored to an appliance.
   * Uses the planner-model fallback chain. Throws on total failure so callers
   * can decide whether to fall back to a static template.
   */
  async generateMaintenancePlan(input: {
    applianceType: ApplianceType;
    brand: string | null;
    model: string | null;
    installedAt: Date | null;
  }): Promise<MaintenancePlan> {
    if (!this.client) {
      throw new InternalServerErrorException(
        'GEMINI_API_KEY not set — caller should fall back to static template.',
      );
    }

    const userText = [
      `Appliance type: ${input.applianceType}`,
      input.brand ? `Brand: ${input.brand}` : null,
      input.model ? `Model: ${input.model}` : null,
      input.installedAt
        ? `Installed: ${input.installedAt.toISOString().slice(0, 10)}`
        : null,
      'Generate the maintenance plan per the JSON contract.',
    ]
      .filter(Boolean)
      .join('\n');

    const { result: response, model } = await this.runWithFallback(
      'maintenance-plan',
      this.plannerModels,
      (m) =>
        this.client!.models.generateContent({
          model: m,
          contents: [{ role: 'user', parts: [{ text: userText }] }],
          config: {
            systemInstruction: MAINTENANCE_PLANNER_SYSTEM_PROMPT,
            responseMimeType: 'application/json',
            temperature: 0.3,
          },
        }),
    );

    const raw = extractText(response);
    const parsed = safeJsonParse<{ tasks: unknown[] }>(raw);
    if (!parsed || !Array.isArray(parsed.tasks)) {
      this.logger.error(
        `Maintenance planner returned non-JSON: ${raw.slice(0, 500)}`,
      );
      throw new InternalServerErrorException(
        'Maintenance planner returned invalid JSON.',
      );
    }

    const tasks = parsed.tasks
      .map((t) => sanitizeMaintenanceTask(t))
      .filter((t): t is MaintenanceTaskTemplate => t !== null);

    if (tasks.length === 0) {
      throw new InternalServerErrorException(
        'Maintenance planner returned no usable tasks.',
      );
    }

    return { tasks, modelName: model };
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

  /**
   * Voice intent router. Takes plain text (from STT) and returns:
   * - a user-facing reply
   * - optional UI instructions for the mobile app
   *
   * If GEMINI_API_KEY is unset, this returns a simple stub response.
   */
  async voiceRouter(
    userText: string,
    history?: Array<{ role: 'user' | 'assistant'; text: string }>,
  ): Promise<{ replyText: string; ui: { type: 'none' } | { type: 'toast'; text: string } }> {
    const cleaned = (userText ?? '').trim();
    if (!cleaned) {
      return {
        replyText: "I didn't catch that—try again.",
        ui: { type: 'toast', text: 'No speech detected.' },
      };
    }

    if (!this.client) {
      return {
        replyText: `Heard: "${cleaned}". (AI is stubbed until GEMINI_API_KEY is set.)`,
        ui: { type: 'none' },
      };
    }

    const system = [
      'You are Fixit Fred, an appliance helper.',
      'Classify the user request into one of intents: ADD_APPLIANCE, TROUBLESHOOT_EXISTING, GENERAL_QUESTION.',
      'Return STRICT JSON with keys: intent, replyText.',
      'replyText should be short and actionable (1-3 sentences).',
    ].join('\n');

    const { result: response } = await this.runWithFallback(
      'voice-router',
      this.plannerModels,
      async (m) => {
        const prior =
          history && history.length
            ? history
                .slice(-8)
                .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
                .join('\n')
            : '';
        return this.client!.models.generateContent({
          model: m,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    `${system}\n\n` +
                    (prior ? `Conversation so far:\n${prior}\n\n` : '') +
                    `User: ${cleaned}`,
                },
              ],
            },
          ],
          config: { responseMimeType: 'application/json' },
        });
      },
    );

    const raw = extractText(response);
    const parsed = safeJson<{ intent?: string; replyText?: string }>(raw);
    const replyText =
      parsed?.replyText?.trim() ||
      raw.trim() ||
      "Got it. Tell me the appliance type and what it's doing, and I'll guide you.";

    return { replyText, ui: { type: 'none' } };
  }
}

function safeJson<T>(s: string): T | null {
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as T;
  } catch {
    return null;
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

/**
 * Coerce one item from the model's `tasks[]` into a strict
 * MaintenanceTaskTemplate. Returns null if the row is malformed enough
 * that we'd rather drop it than risk inserting garbage into the DB.
 */
function sanitizeMaintenanceTask(raw: unknown): MaintenanceTaskTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  if (title.length === 0 || title.length > 120) return null;

  const cadenceDays = Number(r.cadenceDays);
  if (!Number.isFinite(cadenceDays) || cadenceDays < 1 || cadenceDays > 3650) {
    return null;
  }

  const estimatedMinutes = Number(r.estimatedMinutes);
  const description =
    typeof r.description === 'string' ? r.description.trim().slice(0, 1000) : '';
  const whyItMatters =
    typeof r.whyItMatters === 'string' ? r.whyItMatters.trim().slice(0, 500) : '';
  const safetyWarnings = Array.isArray(r.safetyWarnings)
    ? r.safetyWarnings
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= 240)
        .slice(0, 5)
    : [];

  const category = typeof r.category === 'string' ? r.category.trim().slice(0, 80) : undefined;
  const focusPart = typeof r.focusPart === 'string' ? r.focusPart.trim().slice(0, 80) : undefined;

  return {
    title,
    description,
    category: category || undefined,
    focusPart: focusPart || undefined,
    cadenceDays: Math.round(cadenceDays),
    estimatedMinutes:
      Number.isFinite(estimatedMinutes) && estimatedMinutes > 0
        ? Math.round(estimatedMinutes)
        : 15,
    safetyWarnings,
    whyItMatters,
  };
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
