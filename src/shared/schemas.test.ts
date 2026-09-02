import { describe, expect, it } from "vitest";
import {
  commentInputSchema,
  eventCoverInputSchema,
  eventInputSchema,
  eventManagementInputSchema,
  memberRoleInputSchema,
  postInputSchema,
  sceneInputSchema,
  uploadFilesSchema,
} from "./schemas";

describe("API validation", () => {
  it("終了日が開始日より前のイベントを拒否する", () => {
    expect(eventInputSchema.safeParse({ title: "旅行", startDate: "2026-09-10", endDate: "2026-09-01" }).success).toBe(
      false,
    );
  });

  it("accepts manual and automatic event covers", () => {
    expect(eventCoverInputSchema.safeParse({ mediaId: "media-1" }).success).toBe(true);
    expect(eventCoverInputSchema.safeParse({ mediaId: null }).success).toBe(true);
    expect(eventCoverInputSchema.safeParse({}).success).toBe(false);
  });

  it("イベント編集内容をまとめて受け付け、重複シーンを拒否する", () => {
    const event = { title: "旅行", description: "", startDate: null, endDate: null };
    expect(
      eventManagementInputSchema.safeParse({
        event,
        scenes: [{ id: "scene-1", title: "1日目" }, { title: "2日目" }],
        coverMediaId: null,
      }).success,
    ).toBe(true);
    expect(
      eventManagementInputSchema.safeParse({
        event,
        scenes: [
          { id: "scene-1", title: "1日目" },
          { id: "scene-1", title: "重複" },
        ],
        coverMediaId: null,
      }).success,
    ).toBe(false);
  });

  it("空コメントを拒否する", () => {
    expect(commentInputSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("投稿タイトルなしでひとことを受け付ける", () => {
    expect(postInputSchema.safeParse({ caption: "旅行の思い出", eventId: null, sceneId: null }).success).toBe(true);
  });

  it("投稿メディアの並び順を受け付け、重複を拒否する", () => {
    expect(
      postInputSchema.safeParse({
        caption: "",
        eventId: null,
        sceneId: null,
        mediaIds: ["media-2", "media-1"],
      }).success,
    ).toBe(true);
    expect(
      postInputSchema.safeParse({
        caption: "",
        eventId: null,
        sceneId: null,
        mediaIds: ["media-1", "media-1"],
      }).success,
    ).toBe(false);
  });

  it("シーン名を受け付ける", () => {
    expect(sceneInputSchema.safeParse({ title: "1日目" }).success).toBe(true);
    expect(sceneInputSchema.safeParse({ title: "   " }).success).toBe(false);
  });

  it("対応動画を許可し未対応形式を拒否する", () => {
    const base = { filename: "memory.mp4", byteSize: 1024, capturedAt: null, durationSeconds: 10 };
    expect(uploadFilesSchema.safeParse({ files: [{ ...base, mimeType: "video/mp4" }] }).success).toBe(true);
    expect(uploadFilesSchema.safeParse({ files: [{ ...base, mimeType: "application/pdf" }] }).success).toBe(false);
  });

  it("メンバー権限は定義済みのroleだけを許可する", () => {
    expect(memberRoleInputSchema.safeParse({ role: "uploader" }).success).toBe(true);
    expect(memberRoleInputSchema.safeParse({ role: "admin" }).success).toBe(false);
  });
});
