import { canonicalizePairingCode } from "./pairing-code.ts";

const HKDF_SALT = new TextEncoder().encode("purser-relay-v1");
const HKDF_INFO = new TextEncoder().encode("frame-aes-256-gcm");

export type SealedFrame = {
  type: "sealed";
  iv: string;
  ciphertext: string;
};

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function isSealedFrame(value: unknown): value is SealedFrame {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (!("type" in value) || value.type !== "sealed") {
    return false;
  }
  if (!("iv" in value) || !("ciphertext" in value)) {
    return false;
  }
  return typeof value.iv === "string" && typeof value.ciphertext === "string";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export async function deriveRelayKey(pairingCode: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(new TextEncoder().encode(canonicalizePairingCode(pairingCode))),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: toArrayBuffer(HKDF_SALT), info: toArrayBuffer(HKDF_INFO) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealJson(key: CryptoKey, value: unknown): Promise<SealedFrame> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(plaintext),
  );
  return {
    type: "sealed",
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
}

export async function openSealed(key: CryptoKey, frame: SealedFrame): Promise<unknown> {
  const iv = toArrayBuffer(base64ToBytes(frame.iv));
  const ciphertext = toArrayBuffer(base64ToBytes(frame.ciphertext));
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted));
  return parsed;
}
