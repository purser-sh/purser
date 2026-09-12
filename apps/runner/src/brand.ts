/**
 * Purser terminal identity.
 *
 * Three tiers, used in different places:
 *   banner()  — first run, `purser --help`, `purser --version`. Big, once.
 *   header()  — top of a run. One line.
 *   gate()    — the approval prompt. This is where the mark earns its place.
 *
 * Never print the banner on every invocation. A CLI that shouts on every
 * command gets aliased away.
 */

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

type Depth = "truecolor" | "ansi256" | "basic" | "none";

function depth(): Depth {
  const env = process.env;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== "") return "none";
  if (env.FORCE_COLOR === "0") return "none";
  if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return "truecolor";
  if (!process.stdout.isTTY) return "none";

  const term = env.TERM ?? "";
  if (term === "dumb") return "none";
  if (/truecolor|24bit/.test(env.COLORTERM ?? "")) return "truecolor";
  if (/-256(color)?$/.test(term)) return "ansi256";
  if (term) return "basic";
  return "none";
}

/** Copper #F0743A — the accent. Degrades to 256-colour 209, then plain yellow. */
function copper(s: string): string {
  switch (depth()) {
    case "truecolor": return `\x1b[38;2;240;116;58m${s}${RESET}`;
    case "ansi256":   return `\x1b[38;5;209m${s}${RESET}`;
    case "basic":     return `\x1b[33m${s}${RESET}`;
    default:          return s;
  }
}

/** Paper #F7F4F1 — structural. Left uncoloured on basic terminals so it
 *  inherits whatever foreground the user has chosen. */
function paper(s: string): string {
  switch (depth()) {
    case "truecolor": return `\x1b[38;2;247;244;241m${s}${RESET}`;
    case "ansi256":   return `\x1b[38;5;255m${s}${RESET}`;
    default:          return s;
  }
}

function dim(s: string): string {
  return depth() === "none" ? s : `\x1b[2m${s}${RESET}`;
}

/** Block characters used below are U+2580 / U+2584 / U+2588 only — the three
 *  with the widest terminal font support. Anything fancier breaks somewhere. */
const CHEVRON = [
  "██▄        ",
  "  ▀██▄     ",
  "     ▀█▄   ",
  "     ▄█▀   ",
  "  ▄██▀     ",
  "██▀        ",
];

const BAR = "██";

const WORD = [
  "██████╗ ██╗   ██╗██████╗ ███████╗███████╗██████╗ ",
  "██╔══██╗██║   ██║██╔══██╗██╔════╝██╔════╝██╔══██╗",
  "██████╔╝██║   ██║██████╔╝███████╗█████╗  ██████╔╝",
  "██╔═══╝ ██║   ██║██╔══██╗╚════██║██╔══╝  ██╔══██╗",
  "██║     ╚██████╔╝██║  ██║███████║███████╗██║  ██║",
  "╚═╝      ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝  ╚═╝",
];

const TAGLINE = "Approve every change before it lands.";

/**
 * Full banner. First run, --help, --version. Not on every command.
 * Falls back to a plain two-line form on terminals that can't do blocks.
 */
export function banner(version: string, opts: { ascii?: boolean } = {}): string {
  const plain = opts.ascii ?? process.env.PURSER_ASCII === "1";
  if (plain || depth() === "none") {
    return [
      "",
      `  >|  purser ${version}`,
      `      ${TAGLINE}`,
      "",
    ].join("\n");
  }

  const lines = WORD.map(
    (w, i) => "  " + copper(CHEVRON[i]!) + paper(BAR) + "   " + paper(w),
  );

  return [
    "",
    ...lines,
    "",
    `  ${dim(TAGLINE)}`,
    `  ${dim(`v${version}`)}  ${dim("·")}  ${dim("local-first")}  ${dim("·")}  ${dim("Apache-2.0")}`,
    "",
  ].join("\n");
}

/** One line, top of a run. This is the one users see constantly, so it is small. */
export function header(version: string, workspace?: string): string {
  const mark = copper("❯") + paper("│");
  const name = depth() === "none" ? "purser" : paper(BOLD + "purser" + RESET);
  const ver = dim(`v${version}`);
  return workspace
    ? `${mark}  ${name} ${ver}  ${dim("·")}  ${dim(workspace)}`
    : `${mark}  ${name} ${ver}`;
}

/**
 * The approval prompt prefix. The mark appears at the exact moment the
 * product does its job — a change held at the gate, waiting for a human.
 */
export function gate(message: string): string {
  return `${copper("❯")}${paper("│")}  ${message}`;
}

/** Matching prefixes for the two outcomes, so the gate reads as a set. */
export const glyph = {
  pending: () => copper("❯") + paper("│"),
  approved: () => (depth() === "none" ? " +" : "\x1b[38;2;46;125;91m✓│" + RESET),
  rejected: () => (depth() === "none" ? " -" : "\x1b[38;2;176;58;46m✗│" + RESET),
};
