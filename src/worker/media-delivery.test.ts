import { describe, expect, it } from "vitest";
import { app } from "./index";

const viewer = {
  id: "01JDEVUSER0000000000000000",
  display_name: "Viewer",
  role: "viewer",
  avatar_url: null,
};

function mediaEnv() {
  return {
    APP_ORIGIN: "http://localhost:5173",
    R2_ACCOUNT_ID: "account-id",
    R2_ACCESS_KEY_ID: "access-key-id",
    R2_SECRET_ACCESS_KEY: "secret-access-key",
    R2_BUCKET_NAME: "family-timeline-media",
    DB: {
      prepare: (query: string) => ({
        bind: () => ({
          first: async () =>
            query.includes("FROM users WHERE id")
              ? viewer
              : {
                  original_object_key: "media/video/original.mov",
                  preview_object_key: null,
                  thumbnail_object_key: "media/video/thumbnail.webp",
                  mime_type: "video/quicktime",
                  original_filename: "movie.mov",
                },
        }),
      }),
    } as unknown as D1Database,
    MEDIA: {
      get: async (_key: string, options?: R2GetOptions) => {
        const partial = Boolean(options?.range);
        return {
          size: 12,
          httpEtag: '"video-etag"',
          range: partial ? { offset: 0, length: 2 } : undefined,
          body: new Response(partial ? "ab" : "abcdefghijkl").body,
          writeHttpMetadata: () => undefined,
        } as unknown as R2ObjectBody;
      },
    } as unknown as R2Bucket,
  } as Cloudflare.Env;
}

describe("video delivery", () => {
  it("認証後は15分有効なR2の再生URLへリダイレクトする", async () => {
    const response = await app.request("/api/media/video-1/content", undefined, mediaEnv());

    expect(response.status).toBe(307);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://account-id.r2.cloudflarestorage.com");
    expect(location.pathname).toBe("/family-timeline-media/media/video/original.mov");
    expect(location.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(location.searchParams.has("X-Amz-Signature")).toBe(true);
  });

  it("保存時は元動画をWorker経由で返す", async () => {
    const response = await app.request("/api/media/video-1/download", undefined, mediaEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/quicktime");
    expect(await response.text()).toBe("abcdefghijkl");
  });
});
