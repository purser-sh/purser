import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

export const COMPILE_TARGETS = [
  { target: "bun-darwin-arm64", outfile: "agentdeck-darwin-arm64" },
  { target: "bun-darwin-x64", outfile: "agentdeck-darwin-x64" },
  { target: "bun-linux-x64", outfile: "agentdeck-linux-x64" },
  { target: "bun-windows-x64", outfile: "agentdeck-windows-x64.exe" },
] as const;

export type CompileTarget = (typeof COMPILE_TARGETS)[number]["target"];

function repoRoot(): string {
  return join(import.meta.dir, "..");
}

export async function buildWebUi(root: string): Promise<string> {
  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: join(root, "apps/web"),
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error("vite build failed");
  }
  const dist = join(root, "apps/web/dist");
  if (!existsSync(join(dist, "index.html"))) {
    throw new Error("apps/web/dist/index.html missing after build");
  }
  return dist;
}

export function stageUi(root: string, dist: string): string {
  const ui = join(root, "apps/runner/ui");
  rmSync(ui, { recursive: true, force: true });
  mkdirSync(ui, { recursive: true });
  cpSync(dist, ui, { recursive: true });
  return ui;
}

export async function compileOne(input: {
  root: string;
  target: CompileTarget;
  outfileName: string;
}): Promise<string> {
  const outDir = join(input.root, "dist/bin");
  mkdirSync(outDir, { recursive: true });
  const outfile = join(outDir, input.outfileName);
  const args = [
    "build",
    "--compile",
    `--target=${input.target}`,
    "--asset",
    "./ui",
    "--outfile",
    outfile,
    "./src/index.ts",
  ];
  if (input.target.startsWith("bun-windows-")) {
    args.push("--windows-hide-console");
  }
  const proc = Bun.spawn(["bun", ...args], {
    cwd: join(input.root, "apps/runner"),
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(`compile failed for ${input.target}`);
  }
  return outfile;
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

async function main(): Promise<void> {
  const root = repoRoot();
  const all = process.argv.includes("--all");
  const dist = await buildWebUi(root);
  stageUi(root, dist);
  const wanted = all
    ? COMPILE_TARGETS
    : COMPILE_TARGETS.filter((row) => {
        if (process.platform === "linux" && process.arch === "x64") {
          return row.target === "bun-linux-x64";
        }
        if (process.platform === "darwin" && process.arch === "arm64") {
          return row.target === "bun-darwin-arm64";
        }
        if (process.platform === "darwin" && process.arch === "x64") {
          return row.target === "bun-darwin-x64";
        }
        if (process.platform === "win32") {
          return row.target === "bun-windows-x64";
        }
        return row.target === "bun-linux-x64";
      });
  const lines: string[] = [];
  for (const row of wanted) {
    const path = await compileOne({ root, target: row.target, outfileName: row.outfile });
    lines.push(`${sha256File(path)}  ${row.outfile}`);
    console.log(`compiled ${path}`);
  }
  await Bun.write(join(root, "dist/bin/SHA256SUMS"), `${lines.join("\n")}\n`);
}

if (import.meta.main) {
  await main();
}
