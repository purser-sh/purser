import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const RULE_FILES = ["AGENTS.md", "CLAUDE.md", ".cursorrules", ".agentdeck/rules.md"];

function readIfExists(path: string): string | null {
  if (!existsSync(path)) {
    return null;
  }
  return readFileSync(path, "utf8");
}

export function loadWorkspaceRules(workspaceRoot: string): string {
  const chunks: string[] = [];
  for (const file of RULE_FILES) {
    const content = readIfExists(join(workspaceRoot, file));
    if (content !== null && content.trim().length > 0) {
      chunks.push(`# ${file}\n${content}`);
    }
  }
  const cursorRules = join(workspaceRoot, ".cursor", "rules");
  if (existsSync(cursorRules)) {
    for (const name of readdirSync(cursorRules)) {
      const content = readIfExists(join(cursorRules, name));
      if (content) chunks.push(`# .cursor/rules/${name}\n${content}`);
    }
  }
  return chunks.join("\n\n");
}

export function loadSkills(workspaceRoot: string): string {
  const dirs = [join(homedir(), ".agentdeck", "skills"), join(workspaceRoot, ".agentdeck", "skills")];
  const chunks: string[] = [];
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".md")) continue;
      const content = readIfExists(join(dir, name));
      if (content) chunks.push(`# Skill ${name}\n${content}`);
    }
  }
  return chunks.join("\n\n");
}

export function buildExtraPrompt(workspaceRoot: string): string {
  return [loadWorkspaceRules(workspaceRoot), loadSkills(workspaceRoot)].filter((part) => part.length > 0).join("\n\n");
}
