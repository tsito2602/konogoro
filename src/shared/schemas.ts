import { z } from "zod";

export const eventInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).default(""),
  startDate: z.string().date().nullable().default(null),
  endDate: z.string().date().nullable().default(null),
}).refine(
  ({ startDate, endDate }) => !startDate || !endDate || endDate >= startDate,
  { message: "終了日は開始日以降にしてください", path: ["endDate"] },
);

export const sectionInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export const postInputSchema = z.object({
  title: z.string().trim().min(1).max(120),
  caption: z.string().trim().max(2000).default(""),
  eventId: z.string().min(1).nullable().default(null),
  sectionId: z.string().min(1).nullable().default(null),
});

export const uploadFilesSchema = z.object({
  files: z.array(z.object({
    filename: z.string().min(1).max(255),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"]),
    byteSize: z.number().int().positive().max(500 * 1024 * 1024),
    capturedAt: z.string().datetime().nullable().default(null),
    durationSeconds: z.number().nonnegative().nullable().default(null),
  })).min(1).max(30),
});

export const mediaCompleteSchema = z.object({
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
});

export const commentInputSchema = z.object({
  body: z.string().trim().min(1, "コメントを入力してください").max(1000),
});
