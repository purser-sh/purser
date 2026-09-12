import { gate, glyph } from "./brand.ts";

/** Format the held-change line printed when an approval is pending. */
export function formatPermissionGate(action: string, detail: unknown): string {
  const path =
    detail !== null &&
    typeof detail === "object" &&
    "path" in detail &&
    typeof (detail as { path: unknown }).path === "string"
      ? (detail as { path: string }).path
      : typeof detail === "string"
        ? detail
        : null;
  const message =
    path !== null
      ? `Approve ${action} to ${path}?`
      : `Approve ${action}?`;
  return gate(message);
}

/** Format the outcome line after a human decision. */
export function formatPermissionOutcome(allow: boolean): string {
  return allow
    ? `${glyph.approved()}  approved`
    : `${glyph.rejected()}  rejected  ·  nothing written`;
}
