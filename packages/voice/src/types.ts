export interface Pcm16Chunk {
  samples: Int16Array;
  sampleRate: 16000;
}

export type SttEvent =
  | { kind: "partial"; text: string }
  | { kind: "final"; text: string };

export interface SttStartOpts {
  language?: string;
  sampleRate: 16000;
}

export interface SttProvider {
  start(opts: SttStartOpts): AsyncIterable<SttEvent>;
  push(chunk: Pcm16Chunk): void;
  end(): Promise<void>;
}

export interface TtsSynthesizeOpts {
  text: string;
  voiceId?: string;
  speed?: number;
}

export interface TtsProvider {
  synthesize(opts: TtsSynthesizeOpts): AsyncIterable<Pcm16Chunk>;
}

export interface VadResult {
  speaking: boolean;
}

export interface VadProvider {
  push(chunk: Pcm16Chunk): VadResult;
  reset(): void;
}
