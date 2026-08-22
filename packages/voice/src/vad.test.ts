import { describe, expect, test } from "bun:test";
import { EnergyVad } from "./vad.ts";

describe("EnergyVad", () => {
  test("starts on loud audio and stops after silence", () => {
    const vad = new EnergyVad();
    const loud = new Int16Array(320);
    loud.fill(12000);
    const quiet = new Int16Array(320);
    expect(vad.push({ samples: loud, sampleRate: 16000 }).speaking).toBe(true);
    let speaking = true;
    for (let i = 0; i < 20; i += 1) {
      speaking = vad.push({ samples: quiet, sampleRate: 16000 }).speaking;
    }
    expect(speaking).toBe(false);
  });
});
