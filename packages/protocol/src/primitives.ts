import { z } from "zod";

/** ISO-8601 timestamps on the wire. */
export const IsoDateTimeSchema = z.iso.datetime();

export const IdSchema = z.string().min(1);

export const AbsolutePathSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith("/"), {
    message: "path must be absolute",
  });

/** Absolute path or `~/...`. The runner expands `~` before touching disk. */
export const UserFsPathSchema = z
  .string()
  .min(1)
  .refine((value) => value.startsWith("/") || value === "~" || value.startsWith("~/"), {
    message: "path must be absolute or start with ~/",
  });

export const WorkspaceRelativePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/") && !value.split("/").includes(".."), {
    message: "path must be workspace-relative and must not contain '..'",
  });
