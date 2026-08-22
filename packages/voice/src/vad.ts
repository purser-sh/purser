import type { Pcm16Chunk, VadProvider, VadResult } from "./types.ts";

export class EnergyVad implements VadProvider {
  private speaking = false;
  private silenceFrames = 0;

  constructor(
    private readonly startRms = 900,
    private readonly stopRms = 400,
    private readonly hangoverFrames = 12,
  ) {}

  push(chunk: Pcm16Chunk): VadResult {
    let sum = 0;
    for (const sample of chunk.samples) {
      sum += sample * sample;
    }
    const rms = Math.sqrt(sum / Math.max(1, chunk.samples.length));
    if (!this.speaking && rms >= this.startRms) {
      this.speaking = true;
      this.silenceFrames = 0;
    } else if (this.speaking) {
      if (rms < this.stopRms) {
        this.silenceFrames += 1;
        if (this.silenceFrames >= this.hangoverFrames) {
          this.speaking = false;
          this.silenceFrames = 0;
        }
      } else {
        this.silenceFrames = 0;
      }
    }
    return { speaking: this.speaking };
  }

  reset(): void {
    this.speaking = false;
    this.silenceFrames = 0;
  }
}

export function pcmRms(samples: Int16Array): number {
  let sum = 0;
  for (const sample of samples) {
    sum += sample * sample;
  }
  return Math.sqrt(sum / Math.max(1, samples.length));
}
