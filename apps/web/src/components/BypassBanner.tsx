import { useDeckStore } from "@/lib/store";

export function BypassBanner() {
  const sessions = useDeckStore((state) => state.sessions);
  const active = sessions.filter((session) => session.permissionMode === "bypass");
  if (active.length === 0) {
    return null;
  }
  return (
    <>
      {active.map((session) => (
        <div className="bg-destructive px-4 py-2 text-center text-sm font-medium text-white" key={session.id}>
          Bypass is on for session “{session.title}”. Tools run without asking until{" "}
          {session.bypassExpiresAt !== null ? new Date(session.bypassExpiresAt).toLocaleTimeString() : "expiry"}
          {session.bypassRunsRemaining !== null ? ` or ${session.bypassRunsRemaining} run(s) left` : ""}. This banner
          cannot be dismissed.
        </div>
      ))}
    </>
  );
}
