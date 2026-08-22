import { EnergyVad, transcribePcm, OpenAiTts, type Pcm16Chunk } from "@agentdeck/voice";
import type { VoiceInputMode, VoiceProfile } from "@agentdeck/protocol";
import { getSecret } from "./secrets.ts";

function concatPcm(chunks: Int16Array[]): Int16Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Int16Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export class VoiceSession {
  readonly vad = new EnergyVad();
  private chunks: Int16Array[] = [];
  private wasSpeaking = false;
  ttsAbort = new AbortController();

  constructor(
    readonly mode: VoiceInputMode,
    readonly profile: VoiceProfile | undefined,
  ) {}

  pushBase64(pcm16Base64: string): { utterance?: Int16Array } {
    const raw = Buffer.from(pcm16Base64, "base64");
    const even = raw.byteLength - (raw.byteLength % 2);
    const samples = new Int16Array(raw.buffer, raw.byteOffset, even / 2);
    this.chunks.push(samples);
    const speaking = this.vad.push({ samples, sampleRate: 16000 }).speaking;
    if (this.mode === "push_to_talk") {
      return {};
    }
    if (speaking) {
      this.wasSpeaking = true;
      return {};
    }
    if (this.wasSpeaking && !speaking) {
      this.wasSpeaking = false;
      const utterance = concatPcm(this.chunks);
      this.chunks = [];
      this.vad.reset();
      return { utterance };
    }
    return {};
  }

  flush(): Int16Array {
    const utterance = concatPcm(this.chunks);
    this.chunks = [];
    this.vad.reset();
    this.wasSpeaking = false;
    return utterance;
  }

  async transcribe(samples: Int16Array): Promise<string> {
    const key = getSecret("openai") ?? getSecret("generic_llm");
    if (key === null || samples.length === 0) {
      return "";
    }
    return transcribePcm(key, samples, 16000);
  }

  async *speak(text: string): AsyncIterable<Pcm16Chunk> {
    const key = getSecret("openai") ?? getSecret("generic_llm");
    if (key === null) {
      return;
    }
    const tts = new OpenAiTts(key);
    yield* tts.synthesize({
      text,
      voiceId: this.profile?.voiceId ?? undefined,
      speed: this.profile?.speed,
    });
  }

  stopTts(): void {
    this.ttsAbort.abort();
    this.ttsAbort = new AbortController();
  }
}

export function toBase64Pcm(chunk: Pcm16Chunk): string {
  return Buffer.from(chunk.samples.buffer, chunk.samples.byteOffset, chunk.samples.byteLength).toString("base64");
}
