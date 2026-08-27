import { z } from "zod";

/**
 * Why a provider cannot be used on this machine. `unknown` means the
 * prerequisite could not be decided, which is never a reason to block a run.
 */
export const ReadinessStateSchema = z.enum([
  "ready",
  "package_missing",
  "cli_missing",
  "not_authenticated",
  "api_key_missing",
  "unreachable",
  "unknown",
]);
export type ReadinessState = z.infer<typeof ReadinessStateSchema>;

/**
 * What Purser tells the user to do. Vendor wording (`Please run /login`) never
 * reaches this shape: `fix` is phrased for someone sitting in front of Purser.
 */
export const RemedySchema = z
  .object({
    title: z.string().min(1),
    fix: z.string().min(1),
    command: z.string().min(1).nullable(),
    docsUrl: z.string().min(1).nullable(),
  })
  .strict();
export type Remedy = z.infer<typeof RemedySchema>;
