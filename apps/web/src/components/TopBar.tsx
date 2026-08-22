import { FolderPlus, Mic, Search, Settings } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeckStore } from "@/lib/store";

export function TopBar(props: { onNewWorkspace: () => void; onSettings: () => void }) {
  const connection = useDeckStore((state) => state.connection);
  const search = useDeckStore((state) => state.search);
  const setSearch = useDeckStore((state) => state.setSearch);
  const profiles = useDeckStore((state) => state.voiceProfiles);
  const defaultProfile = profiles.find((profile) => profile.isDefault) ?? profiles[0];

  return (
    <header className="flex h-14 items-center gap-3 border-b border-border px-4">
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
          AD
        </div>
        <div>
          <div className="text-sm font-semibold tracking-wide">AgentDeck</div>
          <div className="text-[11px] text-muted-foreground">local operator console</div>
        </div>
      </div>
      <div className="mx-auto flex w-full max-w-md items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search workspaces and sessions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <Badge className={connection === "ready" ? "border-emerald-500/40 text-emerald-400" : "text-amber-400"}>
        {connection}
      </Badge>
      <Button disabled size="sm" title="Voice is Phase 6" type="button" variant="outline">
        <Mic className="h-4 w-4" />
        {defaultProfile?.name ?? "Voice"}
      </Button>
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
