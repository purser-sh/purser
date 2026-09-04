const KEY = "purser.operator";

export type OperatorProfile = {
  displayName: string;
  email: string;
};

export function readOperatorProfile(): OperatorProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) {
      return { displayName: "", email: "" };
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { displayName: "", email: "" };
    }
    const record = parsed as Record<string, unknown>;
    return {
      displayName: typeof record.displayName === "string" ? record.displayName : "",
      email: typeof record.email === "string" ? record.email : "",
    };
  } catch {
    return { displayName: "", email: "" };
  }
}

export function writeOperatorProfile(profile: OperatorProfile): void {
  localStorage.setItem(KEY, JSON.stringify(profile));
}
