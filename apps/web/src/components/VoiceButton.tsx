import { Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useRunner } from "@/lib/client";
import { useDeckStore } from "@/lib/store";

function downsample(input: Float32Array, fromRate: number, toRate: number): Int16Array {
  if (fromRate === toRate) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      out[i] = Math.max(-1, Math.min(1, input[i] ?? 0)) * 32767;
    }
    return out;
  }
  const ratio = fromRate / toRate;
  const length = Math.floor(input.length / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const sample = input[Math.floor(i * ratio)] ?? 0;
    out[i] = Math.max(-1, Math.min(1, sample)) * 32767;
  }
  return out;
}

export function VoiceButton() {
  const client = useRunner();
  const profiles = useDeckStore((state) => state.voiceProfiles);
  const voiceActive = useDeckStore((state) => state.voiceActive);
  const setVoiceActive = useDeckStore((state) => state.setVoiceActive);
  const defaultProfile = profiles.find((profile) => profile.isDefault) ?? profiles[0];
  const [mode] = useState<"push_to_talk" | "hands_free">("push_to_talk");
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const audioCtx = new AudioContext();
    ctxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsample(input, audioCtx.sampleRate, 16000);
      const bytes = new Uint8Array(pcm.buffer);
      let binary = "";
      for (const byte of bytes) {
        binary += String.fromCharCode(byte);
      }
      void client.request("voice_audio_chunk", { pcm16Base64: btoa(binary), sampleRate: 16000 });
    };
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioCtx.destination);
    await client.request("voice_start", { profileId: defaultProfile?.id, mode });
    setVoiceActive(true);
  }

  async function stop() {
    processorRef.current?.disconnect();
    ctxRef.current?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current = null;
    ctxRef.current = null;
    streamRef.current = null;
    await client.request("voice_stop", {});
    setVoiceActive(false);
  }

  return (
    <Button
      onClick={() => {
        if (voiceActive) {
          void stop();
        } else {
          void start();
        }
      }}
      size="sm"
      title="Hold to talk. Local commands: stop, cancel, repeat, approve, reject."
      type="button"
      variant={voiceActive ? "destructive" : "outline"}
    >
      {voiceActive ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      {defaultProfile?.name ?? "Voice"}
    </Button>
  );
}
