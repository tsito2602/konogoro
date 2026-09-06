import { z } from "zod";

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const filenameSchema = z
  .string()
  .min(1)
  .max(255)
  .refine((value) => !/[\\/]/.test(value));
const byteSizeSchema = z
  .number()
  .int()
  .positive()
  .max(500 * 1024 * 1024);

export const playbackEntrySchema = z.object({
  original: z.object({ filename: filenameSchema, byteSize: byteSizeSchema, sha256: sha256Schema }),
  playback: z
    .object({
      filename: filenameSchema,
      byteSize: byteSizeSchema,
      sha256: sha256Schema,
      mimeType: z.literal("video/mp4"),
      videoCodec: z.literal("h264"),
      audioCodec: z.literal("aac").nullable(),
      width: z.number().int().positive().max(1920),
      height: z.number().int().positive().max(1920),
      durationSeconds: z.number().positive(),
      faststart: z.literal(true),
    })
    .refine(({ width, height }) => Math.min(width, height) <= 1080 && width % 2 === 0 && height % 2 === 0),
});

export const playbackManifestSchema = z.object({
  version: z.literal(1),
  entries: z.array(playbackEntrySchema).min(1).max(30),
});

export type PlaybackEntry = z.infer<typeof playbackEntrySchema>;
