import { z } from "zod";
import { IdSchema } from "./primitives.ts";

export const FrameEnvelopeSchema = z
  .object({
    id: IdSchema,
    type: z.string().min(1),
    payload: z.unknown(),
  })
  .strict();
export type FrameEnvelope = z.infer<typeof FrameEnvelopeSchema>;
