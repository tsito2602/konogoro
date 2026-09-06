/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import { app } from "./index";
import { serveStoredMedia } from "./media-delivery";

const viewer = { id: "01JDEVUSER0000000000000000", display_name: "Viewer", role: "viewer", avatar_url: null };
const uploaded = new Date("2026-09-06T03:00:00.500Z");
const videoKey = "media/video/original.mov";
const thumbnailKey = "media/video/thumbnail.webp";
const playbackKey = "media/video/playback.mp4";
const original = "abcdefghijkl";
const mediaRecord = {
  original_object_key: videoKey,
  preview_object_key: null as string | null,
  thumbnail_object_key: thumbnailKey as string | null,
  playback_object_key: null as string | null,
  playback_status: null as "pending" | "ready" | null,
  mime_type: "video/quicktime",
  original_filename: "旅の動画's (1).mov",
};

function mediaEnv(
  overrides: Partial<typeof mediaRecord> = {},
  options: { authenticated?: boolean; missingMedia?: boolean; missingKey?: string; thumbnailMime?: string } = {},
) {
  const media = { ...mediaRecord, ...overrides };
  function metadata(key: string) {
    const contentType = key === thumbnailKey ? options.thumbnailMime || "image/webp" : media.mime_type;
    return {
      key,
      size: original.length,
      etag: "video-etag",
      httpEtag: '"video-etag"',
      uploaded,
      httpMetadata: { contentType },
      writeHttpMetadata: (headers: Headers) => headers.set("Content-Type", contentType),
    } as R2Object;
  }
  const head = vi.fn(async (key: string) => (options.missingKey === key ? null : metadata(key)));
  const get = vi.fn(async (key: string, getOptions?: R2GetOptions) => {
    if (options.missingKey === key) return null;
    const range = getOptions?.range as { offset: number; length: number } | undefined;
    return {
      ...metadata(key),
      range,
      body: new Response(range ? original.slice(range.offset, range.offset + range.length) : original).body,
      arrayBuffer: () => {
        throw new Error("Do not buffer media in the Worker");
      },
    } as unknown as R2ObjectBody;
  });
  const prepare = vi.fn((query: string) => ({
    bind: () => ({
      first: async () =>
        query.includes("FROM users WHERE id")
          ? options.authenticated === false
            ? null
            : viewer
          : options.missingMedia
            ? null
            : media,
    }),
  }));
  return {
    APP_ORIGIN: "http://localhost:5173",
    R2_ACCOUNT_ID: "account-id",
    R2_ACCESS_KEY_ID: "access-key-id",
    R2_SECRET_ACCESS_KEY: "secret-access-key",
    R2_BUCKET_NAME: "family-timeline-media",
    DB: { prepare } as unknown as D1Database,
    MEDIA: { get, head } as unknown as R2Bucket,
    calls: { get, head, prepare },
  } as Cloudflare.Env & { calls: { get: typeof get; head: typeof head; prepare: typeof prepare } };
}

describe("authenticated media delivery", () => {
  it.each([
    ["viewer", "draft", viewer.id, "uploaded", false],
    ["uploader", "draft", viewer.id, "uploaded", true],
    ["owner", "draft", viewer.id, "uploaded", true],
    ["uploader", "draft", "other-author", "uploaded", false],
    ["owner", "draft", "other-author", "uploaded", false],
    ["viewer", "published", "other-author", "uploaded", true],
    ["uploader", "published", "other-author", "uploaded", true],
    ["owner", "published", "other-author", "uploaded", true],
    ["uploader", "draft", viewer.id, "pending", false],
    ["viewer", "deleted", "other-author", "uploaded", false],
  ] as const)(
    "SQL認可: %s / 投稿 %s / 作成者 %s / メディア %s",
    async (role, postStatus, author, mediaStatus, allowed) => {
      const sql = new DatabaseSync(":memory:");
      try {
        sql.exec(`
        CREATE TABLE users (id TEXT, display_name TEXT, role TEXT, avatar_url TEXT, is_active INTEGER);
        CREATE TABLE posts (id TEXT, status TEXT, created_by TEXT);
        CREATE TABLE media (id TEXT, post_id TEXT, status TEXT, original_object_key TEXT,
          preview_object_key TEXT, thumbnail_object_key TEXT, playback_object_key TEXT,
          playback_status TEXT, mime_type TEXT, original_filename TEXT);
      `);
        sql.prepare("INSERT INTO users VALUES (?, 'Viewer', ?, NULL, 1)").run(viewer.id, role);
        sql.prepare("INSERT INTO posts VALUES ('post', ?, ?)").run(postStatus, author);
        sql
          .prepare("INSERT INTO media VALUES ('video-1', 'post', ?, ?, NULL, ?, NULL, NULL, ?, ?)")
          .run(mediaStatus, videoKey, thumbnailKey, mediaRecord.mime_type, mediaRecord.original_filename);
        const env = mediaEnv();
        env.DB = {
          prepare: (query: string) => ({
            bind: (...values: (string | number)[]) => ({
              first: async () => sql.prepare(query).get(...values) ?? null,
            }),
          }),
        } as unknown as D1Database;
        for (const method of ["GET", "HEAD"]) {
          for (const path of ["content", "content?variant=thumbnail", "download"]) {
            const response = await app.request(`/api/media/video-1/${path}`, { method }, env);
            expect(response.status).toBe(allowed ? (method === "GET" && path === "content" ? 307 : 200) : 404);
          }
        }
        if (!allowed) {
          expect(env.calls.get).not.toHaveBeenCalled();
          expect(env.calls.head).not.toHaveBeenCalled();
        }
      } finally {
        sql.close();
      }
    },
  );

  it.each(["GET", "HEAD"])("%sは未認証時にメディア情報やR2へアクセスしない", async (method) => {
    for (const path of ["content", "content?variant=thumbnail", "download"]) {
      const env = mediaEnv({}, { authenticated: false });
      const response = await app.request(
        `/api/media/video-1/${path}`,
        { method, headers: { Range: "bytes=0-1" } },
        env,
      );
      expect(response.status).toBe(401);
      expect(response.headers.has("Location")).toBe(false);
      expect(env.calls.prepare).toHaveBeenCalledTimes(1);
      expect(env.calls.get).not.toHaveBeenCalled();
      expect(env.calls.head).not.toHaveBeenCalled();
    }
  });

  it("未確定・削除済みメディアはR2へアクセスしない", async () => {
    const env = mediaEnv({}, { missingMedia: true });
    const response = await app.request("/api/media/video-1/download", undefined, env);
    expect(response.status).toBe(404);
    expect(env.calls.prepare.mock.calls.at(-1)?.[0]).toContain("status = 'uploaded'");
    expect(env.calls.get).not.toHaveBeenCalled();
    expect(env.calls.head).not.toHaveBeenCalled();
  });

  it("認証後は15分有効なR2の再生URLへリダイレクトする", async () => {
    const env = mediaEnv();
    const response = await app.request("/api/media/video-1/content", undefined, env);
    expect(response.status).toBe(307);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const location = new URL(response.headers.get("Location")!);
    expect(location.origin).toBe("https://account-id.r2.cloudflarestorage.com");
    expect(location.pathname).toBe(`/family-timeline-media/${videoKey}`);
    expect(location.searchParams.get("X-Amz-Expires")).toBe("900");
    expect(location.searchParams.has("X-Amz-Signature")).toBe(true);
    expect(env.calls.get).not.toHaveBeenCalled();
  });

  it.each([null, "pending", "ready"] as const)("再生用動画は状態 %s に応じて確定後だけ選ぶ", async (status) => {
    const env = mediaEnv({ playback_object_key: playbackKey, playback_status: status });
    const response = await app.request("/api/media/video-1/content", undefined, env);
    expect(new URL(response.headers.get("Location")!).pathname).toBe(
      `/family-timeline-media/${status === "ready" ? playbackKey : videoKey}`,
    );
  });

  it.each(["thumbnail", "preview"])("動画の%sは署名URL発行前に画像として解決する", async (variant) => {
    const env = mediaEnv();
    Object.assign(env, { R2_SECRET_ACCESS_KEY: undefined });
    const response = await app.request(`/api/media/video-1/content?variant=${variant}`, undefined, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.has("Location")).toBe(false);
    expect(env.calls.get).toHaveBeenCalledExactlyOnceWith(thumbnailKey);
    expect(env.calls.head).not.toHaveBeenCalled();
  });

  it.each([
    { record: { thumbnail_object_key: null }, options: {} },
    { record: {}, options: { missingKey: thumbnailKey } },
    { record: { thumbnail_object_key: videoKey }, options: {} },
    { record: {}, options: { thumbnailMime: "video/mp4" } },
  ])("サムネイルが欠落・不正でも動画本体ではなく有効なSVGを返す: %o", async ({ record, options }) => {
    const env = mediaEnv(record, options);
    const response = await app.request("/api/media/video-1/content?variant=thumbnail", undefined, env);
    const bytes = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml; charset=utf-8");
    expect(response.headers.get("Content-Length")).toBe(String(new TextEncoder().encode(bytes).length));
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.has("Location")).toBe(false);
    expect(bytes).toMatch(/^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    expect(env.calls.get.mock.calls.some(([key]) => key === videoKey)).toBe(false);
  });

  it("写真の派生画像が未登録なら元写真を表示できる", async () => {
    const env = mediaEnv({ mime_type: "image/jpeg", thumbnail_object_key: null });
    const response = await app.request("/api/media/image-1/content?variant=thumbnail", undefined, env);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.has("Location")).toBe(false);
    expect(env.calls.get).toHaveBeenCalledExactlyOnceWith(videoKey);
  });

  it("HEAD再生要求はGET署名URLに転送せず選択した動画のメタデータだけ返す", async () => {
    const env = mediaEnv({ playback_object_key: playbackKey, playback_status: "ready" });
    const response = await app.request("/api/media/video-1/content", { method: "HEAD" }, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/mp4");
    expect(await response.text()).toBe("");
    expect(env.calls.head).toHaveBeenCalledExactlyOnceWith(playbackKey);
    expect(env.calls.get).not.toHaveBeenCalled();
  });
});

describe("streamed original downloads", () => {
  it("保存時は再生用動画があっても元動画と元のファイル名を返す", async () => {
    const env = mediaEnv({ playback_object_key: playbackKey, playback_status: "ready" });
    const response = await app.request("/api/media/video-1/download?variant=thumbnail", undefined, env);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("video/quicktime");
    expect(response.headers.get("Content-Length")).toBe("12");
    expect(response.headers.get("Accept-Ranges")).toBe("bytes");
    expect(response.headers.get("ETag")).toBe('"video-etag"');
    expect(response.headers.get("Last-Modified")).toBe(uploaded.toUTCString());
    expect(response.headers.get("Content-Disposition")).toBe(
      "attachment; filename*=UTF-8''%E6%97%85%E3%81%AE%E5%8B%95%E7%94%BB%27s%20%281%29.mov",
    );
    expect(await response.text()).toBe(original);
    expect(env.calls.get).toHaveBeenCalledExactlyOnceWith(videoKey);
    expect(env.calls.head).not.toHaveBeenCalled();
  });

  it("Workerで本体を読まずR2のstreamをそのまま返す", async () => {
    const env = mediaEnv();
    const object = await env.calls.get(videoKey);
    env.calls.get.mockResolvedValueOnce(object);
    const response = await serveStoredMedia(new Request("https://example.com/download"), env.MEDIA, videoKey, {
      contentType: "video/quicktime",
    });
    expect(response!.body).toBe(object!.body);
  });

  it("HEADはRangeを無視してメタデータだけ取得し、全体の長さを返す", async () => {
    const env = mediaEnv();
    const response = await app.request(
      "/api/media/video-1/download",
      { method: "HEAD", headers: { Range: "bytes=0-1" } },
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Length")).toBe("12");
    expect(response.headers.has("Content-Range")).toBe(false);
    expect(await response.text()).toBe("");
    expect(env.calls.head).toHaveBeenCalledExactlyOnceWith(videoKey);
    expect(env.calls.get).not.toHaveBeenCalled();
  });

  it.each([
    ["bytes=0-0", "a", "bytes 0-0/12", 0, 1],
    ["bytes=3-6", "defg", "bytes 3-6/12", 3, 4],
    ["bytes=11-", "l", "bytes 11-11/12", 11, 1],
    ["bytes=-3", "jkl", "bytes 9-11/12", 9, 3],
    ["bytes=-100", original, "bytes 0-11/12", 0, 12],
    ["bytes=5-9999999999999999999999", "fghijkl", "bytes 5-11/12", 5, 7],
  ] as const)("%sは範囲内だけR2から取得して206を返す", async (range, body, contentRange, offset, length) => {
    const env = mediaEnv();
    const response = await app.request("/api/media/video-1/download", { headers: { Range: range } }, env);
    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe(contentRange);
    expect(response.headers.get("Content-Length")).toBe(String(length));
    expect(await response.text()).toBe(body);
    expect(env.calls.get).toHaveBeenCalledExactlyOnceWith(videoKey, {
      onlyIf: { etagMatches: "video-etag" },
      range: { offset, length },
    });
  });

  it.each(["bytes=12-", "bytes=9999999999999999999999-", "bytes=-0", "bytes=5-2"])(
    "%sはR2本体を読まず416を返す",
    async (range) => {
      const env = mediaEnv();
      const response = await app.request("/api/media/video-1/download", { headers: { Range: range } }, env);
      expect(response.status).toBe(416);
      expect(response.headers.get("Content-Range")).toBe("bytes */12");
      expect(response.headers.get("Content-Length")).toBe("0");
      expect(await response.text()).toBe("");
      expect(env.calls.get).not.toHaveBeenCalled();
    },
  );

  it.each(["bytes=0-1,4-5", "items=0-1", "bytes=abc", "bytes=-"])(
    "非対応の範囲 %s は200全体配信に戻す",
    async (range) => {
      const response = await app.request("/api/media/video-1/download", { headers: { Range: range } }, mediaEnv());
      expect(response.status).toBe(200);
      expect(response.headers.has("Content-Range")).toBe(false);
      expect(await response.text()).toBe(original);
    },
  );

  it.each([
    ['"video-etag"', 206],
    [uploaded.toUTCString(), 206],
    ['"old-etag"', 200],
    ['W/"video-etag"', 200],
    ["Sun, 06 Sep 2026 02:00:00 GMT", 200],
    ["Sun, 06 Sep 2026 04:00:00 GMT", 200],
    ["not-a-date", 200],
  ] as const)("If-Range %s は表現が一致するときだけ部分取得する", async (ifRange, status) => {
    const response = await app.request(
      "/api/media/video-1/download",
      { headers: { Range: "bytes=0-1", "If-Range": ifRange } },
      mediaEnv(),
    );
    expect(response.status).toBe(status);
    expect(await response.text()).toBe(status === 206 ? "ab" : original);
  });

  it.each(['"video-etag"', 'W/"video-etag"', '"other", W/"video-etag"', "*"])(
    "If-None-Match %s が一致したら本体を取得せず304を返す",
    async (etag) => {
      const env = mediaEnv();
      const response = await app.request(
        "/api/media/video-1/download",
        { headers: { "If-None-Match": etag, Range: "bytes=0-1" } },
        env,
      );
      expect(response.status).toBe(304);
      expect(response.headers.get("ETag")).toBe('"video-etag"');
      expect(response.headers.has("Content-Range")).toBe(false);
      expect(response.headers.has("Content-Length")).toBe(false);
      expect(await response.text()).toBe("");
      expect(env.calls.get).not.toHaveBeenCalled();
    },
  );

  it("If-None-Matchが不一致ならIf-Modified-Sinceより優先して本体を返す", async () => {
    const response = await app.request(
      "/api/media/video-1/download",
      { headers: { "If-None-Match": '"old-etag"', "If-Modified-Since": uploaded.toUTCString() } },
      mediaEnv(),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(original);
  });

  it("If-Modified-SinceはHTTP秒単位で比較する", async () => {
    const env = mediaEnv();
    const response = await app.request(
      "/api/media/video-1/download",
      { headers: { "If-Modified-Since": uploaded.toUTCString() } },
      env,
    );
    expect(response.status).toBe(304);
    expect(env.calls.get).not.toHaveBeenCalled();
  });

  it("If-Matchが不一致なら412を返す", async () => {
    const env = mediaEnv();
    const response = await app.request(
      "/api/media/video-1/download",
      { headers: { "If-Match": 'W/"video-etag"' } },
      env,
    );
    expect(response.status).toBe(412);
    expect(env.calls.get).not.toHaveBeenCalled();
  });

  it("元ファイルがR2にない場合は404を返す", async () => {
    const response = await app.request(
      "/api/media/video-1/download",
      undefined,
      mediaEnv({}, { missingKey: videoKey }),
    );
    expect(response.status).toBe(404);
  });

  it("head後にオブジェクトが変わったら古いRangeヘッダーと新しい本体を混ぜない", async () => {
    const env = mediaEnv();
    const metadata = await env.calls.head(videoKey);
    env.calls.get.mockResolvedValueOnce(metadata as R2ObjectBody);
    const response = await app.request("/api/media/video-1/download", { headers: { Range: "bytes=0-1" } }, env);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("1");
    expect(response.headers.has("Content-Range")).toBe(false);
    expect(await response.text()).toBe("");
  });
});
