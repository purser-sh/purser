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
        <div className="bg-destructive px-4 py-2 text-center text-sm font-medium text-destructive-foreground" key={session.id}>
          Bypass is on for “{session.title}”. Tools run without asking until{" "}
          {session.bypassExpiresAt !== null ? new Date(session.bypassExpiresAt).toLocaleTimeString() : "it expires"}
          {session.bypassRunsRemaining !== null ? ` or after ${session.bypassRunsRemaining} more run${session.bypassRunsRemaining === 1 ? "" : "s"}` : ""}. This stays visible until bypass ends.
        </div>
      ))}
    </>
  );
}
