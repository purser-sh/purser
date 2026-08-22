import type { Pcm16Chunk, SttEvent, SttProvider, SttStartOpts, TtsProvider, TtsSynthesizeOpts } from "./types.ts";

function pcmToWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataSize = samples.byteLength;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(samples.buffer, samples.byteOffset, dataSize));
  return new Uint8Array(buffer);
}

export class OpenAiStt implements SttProvider {
  private chunks: Int16Array[] = [];
  private opts: SttStartOpts = { sampleRate: 16000 };
  private ended = false;

  constructor(private readonly apiKey: string) {}

  start(opts: SttStartOpts): AsyncIterable<SttEvent> {
    this.opts = opts;
    this.chunks = [];
    this.ended = false;
    const self = this;
    return {
      async *[Symbol.asyncIterator]() {
        while (!self.ended) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        const text = await self.transcribe();
        if (text.length > 0) {
          yield { kind: "final", text };
        }
      },
    };
  }

  push(chunk: Pcm16Chunk): void {
    this.chunks.push(chunk.samples);
  }

  async end(): Promise<void> {
    this.ended = true;
  }

  async transcribeNow(): Promise<string> {
    return this.transcribe();
  }

  private async transcribe(): Promise<string> {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    if (total === 0) {
      return "";
    }
    const merged = new Int16Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    const wav = pcmToWav(merged, this.opts.sampleRate);
    const copy = new Uint8Array(wav);
    const blob = new Blob([copy], { type: "audio/wav" });
    const form = new FormData();
    form.set("model", "whisper-1");
    form.set("file", blob, "speech.wav");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: form,
    });
    if (!response.ok) {
      return "";
    }
    const body = (await response.json()) as { text?: string };
    return body.text?.trim() ?? "";
  }
}

export class OpenAiTts implements TtsProvider {
  constructor(private readonly apiKey: string) {}

  async *synthesize(opts: TtsSynthesizeOpts): AsyncIterable<Pcm16Chunk> {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts",
        voice: opts.voiceId ?? "alloy",
        input: opts.text,
        speed: opts.speed ?? 1,
        response_format: "pcm",
      }),
    });
    if (!response.ok) {
      return;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const even = bytes.byteLength - (bytes.byteLength % 2);
    const samples = new Int16Array(bytes.buffer, bytes.byteOffset, even / 2);
    const frame = 1600;
    for (let i = 0; i < samples.length; i += frame) {
      yield { samples: samples.slice(i, i + frame), sampleRate: 16000 };
    }
  }
}

export async function transcribePcm(apiKey: string, samples: Int16Array, sampleRate: 16000): Promise<string> {
  const stt = new OpenAiStt(apiKey);
  stt.push({ samples, sampleRate });
  return stt.transcribeNow();
}
