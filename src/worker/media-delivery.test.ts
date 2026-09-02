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
  it("通常応答に動画全体のサイズを含める", async () => {
    const response = await app.request("/api/media/video-1/content", undefined, mediaEnv());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/quicktime");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("Content-Length")).toBe("12");
  });

  it("Range要求へ206と取得範囲を返す", async () => {
    const response = await app.request("/api/media/video-1/content", { headers: { Range: "bytes=0-1" } }, mediaEnv());

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 0-1/12");
    expect(response.headers.get("Content-Length")).toBe("2");
    expect(await response.text()).toBe("ab");
  });
});
