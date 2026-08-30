export type ShellCardSeverity = "read_only" | "mutating" | "network";

export type ShellClassification =
  | { kind: "read_only"; effect: string }
  | { kind: "mutating"; effect: string }
  | { kind: "network"; effect: string }
  | { kind: "irreversible"; effect: string; rule: string }
  | { kind: "refused"; reason: string; enableHint: string };

const READ_ONLY_BINARIES = new Set([
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "grep",
  "rg",
  "pwd",
  "which",
  "echo",
]);

/** Documented read-only surface — binaries plus positively identified git/find forms. */
export const SHELL_READ_ONLY_ALLOWLIST = {
  binaries: [...READ_ONLY_BINARIES, "env (no arguments only)"],
  gitSubcommands: [
    "status",
    "log",
    "show (no --output)",
    "diff (no --output)",
    "branch (bare or --list only)",
  ],
  find: ["find without -delete, -exec, -execdir, -ok, -okdir, -fprintf, -fprint, -fls"],
  rg: ["rg without --pre or --pre-glob"],
} as const;

const NETWORK_BINARIES = new Set(["curl", "wget", "nc", "netcat", "telnet", "ssh", "scp", "ftp", "ping", "nmap"]);

const IRREVERSIBLE_RULES: Array<{ pattern: RegExp; rule: string; effect: string }> = [
  { pattern: /\brm\s+(?:-[^\s]+\s+)*-?[^\s]*r(?:\S*)?\b/i, rule: "rm -rf / rm -r", effect: "This deletes files recursively." },
  { pattern: /\bgit\s+reset\s+[^|;&]*--hard\b/i, rule: "git reset --hard", effect: "This discards uncommitted work and moves HEAD." },
  { pattern: /\bgit\s+clean\s+[^|;&]*-\S*f/i, rule: "git clean -f", effect: "This deletes untracked files from the workspace." },
  { pattern: /\bgit\s+checkout\s+[^|;&]*--\s+\./i, rule: "git checkout -- .", effect: "This reverts all tracked files in the workspace." },
  { pattern: /\bgit\s+push\s+[^|;&]*(?:--force|-f)\b/i, rule: "git push --force", effect: "This overwrites remote history." },
  { pattern: /\bdd\b/i, rule: "dd", effect: "This can overwrite raw disk data." },
  { pattern: /\bmkfs\b/i, rule: "mkfs", effect: "This formats a filesystem." },
  { pattern: /\btruncate\b/i, rule: "truncate", effect: "This can shrink or empty files." },
  { pattern: /\bshred\b/i, rule: "shred", effect: "This securely destroys file contents." },
  { pattern: /\bchmod\s+(?:-\S*\s+)*-[^\s]*R\b|\bchmod\s+-R\b/i, rule: "chmod -R", effect: "This changes permissions recursively." },
  { pattern: /\bchown\s+(?:-\S*\s+)*-[^\s]*R\b|\bchown\s+-R\b/i, rule: "chown -R", effect: "This changes ownership recursively." },
  { pattern: /\|\s*(?:sh|bash|zsh|dash|fish)\b/i, rule: "pipe into shell", effect: "This runs downloaded content as a shell script." },
  { pattern: /\b(?:curl|wget)\s+[^\n|;&]*\|\s*(?:sh|bash|zsh|dash|fish)\b/i, rule: "curl|sh", effect: "This pipes a download into a shell." },
];

const FIND_MUTATING_FLAGS = /\s-(?:delete|exec|execdir|okdir|ok|fprintf|fprint|fls)\b/;

function splitSegments(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    if (quote !== null) {
      current += char;
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }
    if (command.slice(index, index + 2) === "&&") {
      parts.push(current);
      current = "";
      index += 1;
      continue;
    }
    if (command.slice(index, index + 2) === "||") {
      parts.push(current);
      current = "";
      index += 1;
      continue;
    }
    if (char === "&" && command[index + 1] !== "&") {
      parts.push(current);
      current = "";
      continue;
    }
    if (char === "\n") {
      parts.push(current);
      current = "";
      continue;
    }
    if (char === ";" || char === "|") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

function hasSubshell(command: string): boolean {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]!;
    if (quote !== null) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (char === "(") {
      return true;
    }
  }
  return false;
}

function hasUnclassifiableSyntax(command: string): boolean {
  if (/\$\(/.test(command) || /`/.test(command) || /\beval\b/.test(command) || /\$\{/.test(command)) {
    return true;
  }
  if (hasSubshell(command)) {
    return true;
  }
  if (/(?:^|[^\d])>(?!>)/.test(command) || />>/.test(command)) {
    return true;
  }
  return false;
}

function firstToken(segment: string): string {
  const match = segment.trim().match(/^([a-zA-Z0-9._-]+)/);
  return match?.[1]?.toLowerCase() ?? "";
}

function gitWritesOutput(body: string): boolean {
  return /\s--output(?:=\S|\s+\S)/.test(body);
}

function classifyGit(segment: string): ShellClassification | null {
  const trimmed = segment.trim();
  if (!/^git\b/i.test(trimmed)) {
    return null;
  }
  const body = trimmed.slice(3).trim();
  const sub = body.split(/\s+/)[0]?.toLowerCase() ?? "";
  if (sub === "status") {
    return { kind: "read_only", effect: "Shows repository status." };
  }
  if (sub === "log") {
    return { kind: "read_only", effect: "Runs git log (read-only)." };
  }
  if (sub === "show" || sub === "diff") {
    if (gitWritesOutput(body)) {
      return { kind: "mutating", effect: `git ${sub} --output writes a file.` };
    }
    return { kind: "read_only", effect: `Runs git ${sub} (read-only).` };
  }
  if (sub === "branch") {
    const rest = body.slice("branch".length).trim();
    if (rest.length === 0 || rest === "--list") {
      return { kind: "read_only", effect: "Lists git branches." };
    }
    return { kind: "mutating", effect: "This creates, renames, or deletes a git branch." };
  }
  if (sub === "add") {
    const paths = body.slice(3).trim() || "files";
    return {
      kind: "mutating",
      effect: `git add ${paths}. This changes git's index. Purser cannot undo shell commands the way it undoes file edits.`,
    };
  }
  return { kind: "mutating", effect: `This runs git ${sub || "command"}, which may change the repository.` };
}

function classifyFind(segment: string): ShellClassification | null {
  if (firstToken(segment) !== "find") {
    return null;
  }
  if (FIND_MUTATING_FLAGS.test(segment)) {
    return { kind: "mutating", effect: "This find command can delete, execute, or write files." };
  }
  return { kind: "read_only", effect: "Searches the filesystem (read-only find)." };
}

function classifyEnv(segment: string): ShellClassification | null {
  if (firstToken(segment) !== "env") {
    return null;
  }
  if (/^env\s*$/i.test(segment.trim())) {
    return { kind: "read_only", effect: "Prints the environment (read-only)." };
  }
  return { kind: "mutating", effect: "env executes another command; not read-only." };
}

function classifyRg(segment: string): ShellClassification | null {
  if (firstToken(segment) !== "rg") {
    return null;
  }
  if (/\s--pre(?:-glob)?(?:=\S|\s+\S)/.test(segment)) {
    return { kind: "mutating", effect: "rg --pre runs an arbitrary preprocessor command." };
  }
  return { kind: "read_only", effect: "Runs rg (read-only)." };
}

function classifyReadOnlyBinary(segment: string): ShellClassification | null {
  const env = classifyEnv(segment);
  if (env !== null) {
    return env;
  }
  const rg = classifyRg(segment);
  if (rg !== null) {
    return rg;
  }
  const token = firstToken(segment);
  if (!READ_ONLY_BINARIES.has(token)) {
    return null;
  }
  return { kind: "read_only", effect: `Runs ${token} (read-only).` };
}

function classifyNetwork(segment: string): ShellClassification | null {
  const token = firstToken(segment);
  if (!NETWORK_BINARIES.has(token)) {
    return null;
  }
  return { kind: "network", effect: "This command contacts the network." };
}

function classifyIrreversible(segment: string): ShellClassification | null {
  for (const entry of IRREVERSIBLE_RULES) {
    if (entry.pattern.test(segment)) {
      return { kind: "irreversible", effect: entry.effect, rule: entry.rule };
    }
  }
  return null;
}

function classifySegment(segment: string): ShellClassification {
  const envWrap = classifyEnv(segment);
  if (envWrap !== null && envWrap.kind === "mutating") {
    return envWrap;
  }
  const irreversible = classifyIrreversible(segment);
  if (irreversible !== null) {
    return irreversible;
  }
  const network = classifyNetwork(segment);
  if (network !== null) {
    return network;
  }
  const git = classifyGit(segment);
  if (git !== null) {
    return git;
  }
  const find = classifyFind(segment);
  if (find !== null) {
    return find;
  }
  const readOnly = classifyReadOnlyBinary(segment);
  if (readOnly !== null) {
    return readOnly;
  }
  const token = firstToken(segment);
  if (token.length === 0) {
    return { kind: "mutating", effect: "This shell command could not be parsed; treating it as mutating." };
  }
  return {
    kind: "mutating",
    effect: `This runs ${token}, which is not on Purser's read-only allowlist.`,
  };
}

const SEVERITY_RANK: Record<ShellClassification["kind"], number> = {
  read_only: 0,
  network: 1,
  mutating: 2,
  irreversible: 3,
  refused: 4,
};

function mergeClassifications(left: ShellClassification, right: ShellClassification): ShellClassification {
  return SEVERITY_RANK[right.kind] > SEVERITY_RANK[left.kind] ? right : left;
}

/** Allowlist classifier — unknown means mutating, never safe. */
export function classifyShellCommand(
  command: string,
  options: { allowDestructiveShell?: boolean } = {},
): ShellClassification {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { kind: "mutating", effect: "Empty shell command." };
  }
  if (hasUnclassifiableSyntax(trimmed)) {
    return {
      kind: "mutating",
      effect: "This command uses shell syntax Purser cannot classify (subshell, redirect, backticks, or eval).",
    };
  }
  if (/\|\s*(?:sh|bash|zsh|dash|fish)\b/i.test(trimmed)) {
    const blocked: ShellClassification = {
      kind: "irreversible",
      effect: "This pipes a download or command output into a shell.",
      rule: "pipe into shell",
    };
    if (options.allowDestructiveShell !== true) {
      return {
        kind: "refused",
        reason: `Refused: ${blocked.rule} is not allowed while destructive shell is disabled.`,
        enableHint: "Enable destructive shell in Setup → Shell for this workspace if you intend to run this.",
      };
    }
    return { kind: "mutating", effect: blocked.effect };
  }
  const segments = splitSegments(trimmed);
  let merged: ShellClassification = classifySegment(segments[0] ?? trimmed);
  for (const segment of segments.slice(1)) {
    merged = mergeClassifications(merged, classifySegment(segment));
  }
  if (merged.kind === "irreversible" && options.allowDestructiveShell !== true) {
    return {
      kind: "refused",
      reason: `Refused: ${merged.rule} is not allowed while destructive shell is disabled.`,
      enableHint: "Enable destructive shell in Setup → Shell for this workspace if you intend to run this.",
    };
  }
  if (merged.kind === "irreversible" && options.allowDestructiveShell === true) {
    return { kind: "mutating", effect: merged.effect };
  }
  return merged;
}

export function shellCardSeverity(classification: ShellClassification): ShellCardSeverity {
  if (classification.kind === "read_only") {
    return "read_only";
  }
  if (classification.kind === "network") {
    return "network";
  }
  return "mutating";
}
