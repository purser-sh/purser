import { FolderPlus, FolderSync, Search, Settings } from "lucide-react";
import { VoiceButton } from "@/components/VoiceButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeckStore } from "@/lib/store";

export function TopBar(props: { onNewWorkspace: () => void; onSettings: () => void }) {
  const connection = useDeckStore((state) => state.connection);
  const search = useDeckStore((state) => state.search);
  const setSearch = useDeckStore((state) => state.setSearch);
  const transcript = useDeckStore((state) => state.transcriptPartial);
  const voiceActive = useDeckStore((state) => state.voiceActive);
  const lastSyncEvent = useDeckStore((state) => state.lastSyncEvent);
  const folderWatches = useDeckStore((state) => state.folderWatches);

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border px-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
          AD
        </div>
        <div>
          <div className="text-sm font-semibold tracking-wide">AgentDeck</div>
          <div className="text-[11px] text-muted-foreground">
            {transcript.length > 0
              ? transcript
              : voiceActive
                ? "listening…"
                : "voice · folder sync · token coach"}
          </div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search workspaces and sessions"
          value={search}
        />
      </div>
      {folderWatches.length > 0 ? (
        <span className="hidden max-w-[14rem] truncate text-[11px] text-muted-foreground lg:inline-flex lg:items-center lg:gap-1">
          <FolderSync className="h-3.5 w-3.5" />
          {lastSyncEvent !== null ? `${lastSyncEvent.action} ${lastSyncEvent.destPath}` : `${folderWatches.length} watched`}
        </span>
      ) : null}
      <Badge className={connection === "ready" ? "border-emerald-500/40 text-emerald-400" : "text-amber-400"}>
        {connection}
      </Badge>
      <VoiceButton />
      <Button onClick={props.onNewWorkspace} size="sm" type="button" variant="secondary">
        <FolderPlus className="h-4 w-4" />
        Workspace
      </Button>
      <Button onClick={props.onSettings} size="icon" type="button" variant="ghost">
        <Settings className="h-4 w-4" />
      </Button>
    </header>
  );
}
