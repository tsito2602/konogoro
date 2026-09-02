import { describe, expect, it } from "vitest";
import { app } from "./index";

const viewer = { id: "01JDEVUSER0000000000000000", display_name: "Viewer", role: "viewer" };

function viewerEnv(): Cloudflare.Env {
  return {
    APP_ORIGIN: "http://localhost:5173",
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => viewer }),
      }),
    } as unknown as D1Database,
  } as Cloudflare.Env;
}

describe("viewer API authorization", () => {
  it.each([
    ["GET", "/api/family/members", undefined],
    ["PATCH", "/api/family/members/member-1", { role: "uploader" }],
    ["DELETE", "/api/family/members/member-1", undefined],
    ["GET", "/api/events/event-1/cover-media", undefined],
    [
      "PUT",
      "/api/events/event-1/manage",
      { event: { title: "旅行", description: "", startDate: null, endDate: null }, scenes: [], coverMediaId: null },
    ],
    ["POST", "/api/events/event-1/scenes", { title: "1日目" }],
    ["PUT", "/api/events/event-1/scenes/scene-1", { title: "2日目" }],
    ["DELETE", "/api/events/event-1/scenes/scene-1", undefined],
    ["POST", "/api/posts/post-1/media/upload-urls", { files: [] }],
    ["DELETE", "/api/posts/post-1/media/media-1", undefined],
    ["PUT", "/api/posts/post-1", { caption: "", eventId: null, sceneId: null }],
    ["POST", "/api/media/media-1/upload-url", undefined],
    ["POST", "/api/media/media-1/failed", undefined],
    ["POST", "/api/media/media-1/complete", { width: 100, height: 100 }],
    ["POST", "/api/posts/post-1/publish", undefined],
  ])("%s %sを拒否する", async (method, path, body) => {
    const response = await app.request(
      path,
      {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      },
      viewerEnv(),
    );

    expect(response.status).toBe(403);
  });
});
