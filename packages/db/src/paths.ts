export function toIso(date: Date): string {
  return date.toISOString();
}

export function expandHome(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/")) {
    return `${homedir()}/${path.slice(2)}`;
  }
  return path;
}

function homedir(): string {
  const home = process.env.HOME;
  if (home === undefined || home.length === 0) {
    throw new Error("HOME is not set");
  }
  return home;
}

export function resolveSqliteFilePath(url: string): string {
  let path = url.trim();
  if (path.startsWith("sqlite://")) {
    path = path.slice("sqlite://".length);
  } else if (path.startsWith("file:")) {
    path = path.slice("file:".length);
  }
  return expandHome(path);
}

export function defaultSqlitePath(): string {
  return resolveSqliteFilePath("sqlite://~/.agentdeck/agentdeck.sqlite");
}

export function agentdeckHome(): string {
  return expandHome("~/.agentdeck");
}
