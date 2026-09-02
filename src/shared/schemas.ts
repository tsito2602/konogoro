import { z } from "zod";

export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).default(""),
    startDate: z.string().date().nullable().default(null),
    endDate: z.string().date().nullable().default(null),
  })
  .refine(({ startDate, endDate }) => !startDate || !endDate || endDate >= startDate, {
    message: "終了日は開始日以降にしてください",
    path: ["endDate"],
  });

export const sceneInputSchema = z.object({
  title: z.string().trim().min(1).max(100),
});

export const eventManagementInputSchema = z
  .object({
    event: eventInputSchema,
    scenes: z
      .array(
        z.object({
          id: z.string().min(1).optional(),
          title: z.string().trim().min(1).max(100),
        }),
      )
      .max(100),
    coverMediaId: z.string().min(1).nullable(),
  })
  .refine(
    ({ scenes }) => {
      const ids = scenes.flatMap((scene) => (scene.id ? [scene.id] : []));
      return new Set(ids).size === ids.length;
    },
    { message: "同じシーンが重複しています", path: ["scenes"] },
  );

export const eventCoverInputSchema = z.object({
  mediaId: z.string().min(1).nullable(),
});

export const postInputSchema = z.object({
  caption: z.string().trim().max(2000).default(""),
  eventId: z.string().min(1).nullable().default(null),
  sceneId: z.string().min(1).nullable().default(null),
});

export const uploadFilesSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1).max(255),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"]),
        byteSize: z
          .number()
          .int()
          .positive()
          .max(500 * 1024 * 1024),
        capturedAt: z.string().datetime().nullable().default(null),
        durationSeconds: z.number().nonnegative().nullable().default(null),
      }),
    )
    .min(1)
    .max(30),
});

export const editUploadFilesSchema = uploadFilesSchema.extend({
  replacingMediaIds: z.array(z.string().min(1)).max(30).default([]),
});

export const mediaCompleteSchema = z.object({
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
});

export const commentInputSchema = z.object({
  body: z.string().trim().min(1, "コメントを入力してください").max(1000),
});

export const inviteInputSchema = z.object({
  role: z.enum(["owner", "uploader", "viewer"]).default("viewer"),
  expiresInDays: z.number().int().min(1).max(30).default(7),
  maxUses: z.number().int().min(1).max(100).default(1),
});

export const memberRoleInputSchema = z.object({
  role: z.enum(["owner", "uploader", "viewer"]),
});

export const profileInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50).optional(),
    notificationEnabled: z.boolean().optional(),
  })
  .refine(({ displayName, notificationEnabled }) => displayName !== undefined || notificationEnabled !== undefined, {
    message: "変更内容を指定してください",
  });
