import type { Session, SpendReportPayload, StoredEvent } from "@purser-sh/protocol";
import { providerDisplayLabel } from "@purser-sh/protocol";

export type SpendRow = {
  key: string;
  tokens: number;
  costUsdMicros: number | null;
  isOthers?: boolean;
};

export function reportRows(report: SpendReportPayload | undefined): SpendRow[] {
  if (report === undefined) {
    return [];
  }
  return report.rows.map((row) => ({
    key: row.groupKey,
    tokens: row.inputTokens + row.outputTokens,
    costUsdMicros: row.costUsdMicros,
  }));
}

export function providerSpendRows(
  report: SpendReportPayload | undefined,
  configs: ReadonlyArray<{ providerId: string; label: string }>,
): SpendRow[] {
  return reportRows(report).map((row) => ({
    ...row,
    key: providerDisplayLabel(row.key, configs),
  }));
}

/** Never show a raw session id — title, first prompt, or "untitled session". */
export function sessionSpendLabel(sessionId: string, sessions: Session[], events: StoredEvent[]): string {
  const session = sessions.find((item) => item.id === sessionId);
  if (session !== undefined && session.title !== "New session") {
    return session.title;
  }
  const first = events
    .filter((event) => event.sessionId === sessionId && event.kind === "user_message")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (first !== undefined && first.payload.kind === "user_message") {
    const text = first.payload.text.trim();
    if (text.length > 0) {
      return text.length > 48 ? `${text.slice(0, 48)}…` : text;
    }
  }
  return "untitled session";
}

/** Top N spenders plus one rolled-up "N others" row when there are more. */
export function collapseSpendRows(rows: SpendRow[], limit = 5): SpendRow[] {
  const sorted = [...rows].sort((a, b) => b.tokens - a.tokens);
  if (sorted.length <= limit) {
    return sorted;
  }
  const top = sorted.slice(0, limit);
  const rest = sorted.slice(limit);
  const othersTokens = rest.reduce((sum, row) => sum + row.tokens, 0);
  const priced = rest.filter((row) => row.costUsdMicros !== null);
  const othersCost =
    priced.length === 0 ? null : priced.reduce((sum, row) => sum + (row.costUsdMicros ?? 0), 0);
  return [...top, { key: `${rest.length} others`, tokens: othersTokens, costUsdMicros: othersCost, isOthers: true }];
}

export function sessionSpendRows(
  report: SpendReportPayload | undefined,
  sessions: Session[],
  events: StoredEvent[],
): SpendRow[] {
  const labeled = reportRows(report).map((row) => ({
    ...row,
    key: sessionSpendLabel(row.key, sessions, events),
  }));
  return collapseSpendRows(labeled);
}
