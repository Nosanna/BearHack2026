import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiService } from '../ai/ai.service';

type AskWithAudioArgs = {
  bytes: Buffer;
  contentType: string;
  filename: string;
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
};

type VoiceUiInstruction =
  | { type: 'none' }
  | { type: 'navigate'; screen: 'CameraEntry' | 'ApplianceDetail' | 'Assistant'; params?: Record<string, unknown> }
  | { type: 'toast'; text: string };

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  /** Cached voice ID resolved from the user's ElevenLabs account. */
  private cachedVoiceId: string | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly ai: AiService,
  ) {}

  async askWithAudio(args: AskWithAudioArgs) {
    const elevenKey = this.config.get<string>('ELEVENLABS_API_KEY') ?? '';
    const sttModel = this.config.get<string>('ELEVENLABS_STT_MODEL') ?? 'scribe_v2';

    if (!elevenKey) {
      return {
        transcript: '',
        replyText:
          'Voice is not configured on the server yet (missing ELEVENLABS_API_KEY).',
        audioBase64: null as string | null,
        ui: { type: 'toast', text: 'Voice not configured.' } satisfies VoiceUiInstruction,
      };
    }

    const transcript = await this.transcribeViaElevenLabs({
      apiKey: elevenKey,
      bytes: args.bytes,
      contentType: args.contentType,
      filename: args.filename,
      modelId: sttModel,
    });

    return this.askWithText(transcript, { forceTts: true, history: args.history });
  }

  async askWithText(
    text: string,
    opts?: { forceTts?: boolean; history?: Array<{ role: 'user' | 'assistant'; text: string }> },
  ): Promise<{
    transcript: string;
    replyText: string;
    audioBase64: string | null;
    ui: VoiceUiInstruction;
  }> {
    const cleaned = (text ?? '').trim();
    const elevenKey = this.config.get<string>('ELEVENLABS_API_KEY') ?? '';

    const intent = await this.ai.voiceRouter(cleaned, opts?.history);

    if (!elevenKey || opts?.forceTts === false) {
      return {
        transcript: cleaned,
        replyText: intent.replyText,
        audioBase64: null,
        ui: intent.ui,
      };
    }

    const voiceId = await this.resolveVoiceId(elevenKey);
    if (!voiceId) {
      return {
        transcript: cleaned,
        replyText: intent.replyText,
        audioBase64: null,
        ui: intent.ui,
      };
    }

    const tts = await this.ttsViaElevenLabs({
      apiKey: elevenKey,
      voiceId,
      text: intent.replyText,
    });

    return {
      transcript: cleaned,
      replyText: intent.replyText,
      audioBase64: tts.audioBase64,
      ui: intent.ui,
    };
  }

  /**
   * Well-known ElevenLabs premade voice IDs. Used as a fallback list when the
   * account's API key doesn't have `voices_read` permission. We try each in
   * order with a tiny TTS probe and cache the first that succeeds.
   */
  private static readonly FALLBACK_VOICES: Array<{ id: string; name: string }> = [
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' },
    { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
    { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
    { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte' },
    { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie' },
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
  ];

  /**
   * Resolve a usable ElevenLabs voice ID:
   *  1. `ELEVENLABS_VOICE_ID` env var if set.
   *  2. Cached voice from a previous lookup.
   *  3. First voice returned by `/v1/voices` for this account.
   *  4. First voice in `FALLBACK_VOICES` that responds 2xx to a tiny TTS probe.
   */
  private async resolveVoiceId(apiKey: string): Promise<string | null> {
    const fromEnv = (this.config.get<string>('ELEVENLABS_VOICE_ID') ?? '').trim();
    if (fromEnv) return fromEnv;
    if (this.cachedVoiceId) return this.cachedVoiceId;

    // Try /voices (works if the key has voices_read).
    try {
      const r = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey },
      });
      if (r.ok) {
        const json = (await r.json()) as { voices?: Array<{ voice_id?: string; name?: string }> };
        const first = (json.voices ?? []).find((v) => v.voice_id);
        if (first?.voice_id) {
          this.cachedVoiceId = first.voice_id;
          this.logger.log(
            `ElevenLabs voice resolved (account): ${first.name ?? '(unnamed)'} (${first.voice_id})`,
          );
          return this.cachedVoiceId;
        }
      } else {
        const body = await r.text().catch(() => '');
        this.logger.log(
          `ElevenLabs /voices unavailable (${r.status}); trying premade fallbacks. ${body.slice(0, 160)}`,
        );
      }
    } catch (e) {
      this.logger.warn(`ElevenLabs voice lookup error: ${(e as Error).message}`);
    }

    // Probe known premade voices until one works.
    for (const v of VoiceService.FALLBACK_VOICES) {
      const ok = await this.probeVoice(apiKey, v.id);
      if (ok) {
        this.cachedVoiceId = v.id;
        this.logger.log(`ElevenLabs voice resolved (premade): ${v.name} (${v.id})`);
        return this.cachedVoiceId;
      }
    }

    this.logger.warn(
      'ElevenLabs: no voice ID could be resolved. Set ELEVENLABS_VOICE_ID in apps/api/.env to a voice your account has access to.',
    );
    return null;
  }

  /** Tiny TTS probe — succeeds (2xx) means this voice ID works for the key. */
  private async probeVoice(apiKey: string, voiceId: string): Promise<boolean> {
    try {
      const r = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
          },
          body: JSON.stringify({
            text: '.',
            model_id:
              this.config.get<string>('ELEVENLABS_TTS_MODEL') ?? 'eleven_multilingual_v2',
          }),
        },
      );
      // Drain the body so the connection releases.
      await r.arrayBuffer().catch(() => null);
      return r.ok;
    } catch {
      return false;
    }
  }

  private async transcribeViaElevenLabs(args: {
    apiKey: string;
    bytes: Buffer;
    contentType: string;
    filename: string;
    modelId: string;
  }): Promise<string> {
    const form = new FormData();
    form.set(
      'file',
      new Blob([args.bytes], { type: args.contentType }),
      args.filename,
    );
    form.set('model_id', args.modelId);
    form.set('diarize', 'false');
    form.set('tag_audio_events', 'false');

    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: {
        'xi-api-key': args.apiKey,
      },
      body: form,
    });

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      this.logger.warn(`ElevenLabs STT failed: ${r.status} ${body}`);
      return '';
    }

    const json = (await r.json()) as { text?: string };
    return (json.text ?? '').trim();
  }

  private async ttsViaElevenLabs(args: {
    apiKey: string;
    voiceId: string;
    text: string;
  }): Promise<{ audioBase64: string | null }> {
    const r = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(args.voiceId)}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': args.apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: args.text,
          model_id: this.config.get<string>('ELEVENLABS_TTS_MODEL') ?? 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.4,
            similarity_boost: 0.8,
          },
        }),
      },
    );

    if (!r.ok) {
      const body = await r.text().catch(() => '');
      this.logger.warn(`ElevenLabs TTS failed: ${r.status} ${body}`);
      // Stale voice cache (deleted from account, etc.) — invalidate so the
      // next request re-resolves a working voice.
      if (r.status === 404) this.cachedVoiceId = null;
      return { audioBase64: null };
    }

    const buf = Buffer.from(await r.arrayBuffer());
    return { audioBase64: buf.toString('base64') };
  }
}

