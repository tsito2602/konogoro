import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Media } from "../shared/types";
import {
  canPrepareVideo,
  clearPreparedVideo,
  MAX_VIDEO_PRELOAD_BYTES,
  permitsVideoPreparation,
  playbackMemory,
  prepareNextVideo,
  recordVideoMetric,
  setVideoIdentity,
  takePreparedVideo,
  videoMetrics,
} from "./video-experience";

const media = {
  id: "next-video",
  kind: "video",
  contentUrl: "/api/media/next/content",
  playbackReady: true,
  playbackByteSize: 4,
} as Media;
beforeEach(() => {
  setVideoIdentity(null);
  setVideoIdentity("user:viewer");
});
afterEach(() => {
  setVideoIdentity(null);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("video preparation", () => {
  it("never preloads raw, unknown-size or oversized videos", () => {
    expect(canPrepareVideo(media)).toBe(true);
    for (const candidate of [
      { ...media, playbackReady: false },
      { ...media, playbackByteSize: null },
      { ...media, playbackByteSize: MAX_VIDEO_PRELOAD_BYTES + 1 },
    ]) {
      expect(canPrepareVideo(candidate)).toBe(false);
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      prepareNextVideo(candidate);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
  it("reuses a complete bounded rendition once instead of refetching the signed URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "Content-Length": "4" } })),
    );
    const create = vi.spyOn(URL, "createObjectURL");
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const stop = prepareNextVideo(media);
    await vi.waitFor(() => expect(videoMetrics().preloadBytes).toBe(4));
    stop(); // A route remount cancels ongoing work but can consume the finished result.
    const prepared = takePreparedVideo(media.id);
    expect(prepared?.url).toMatch(/^blob:/);
    expect(create.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect((create.mock.calls[0][0] as Blob).size).toBe(4);
    expect(takePreparedVideo(media.id)).toBeNull();
    expect(videoMetrics().preloadHits).toBe(1);
    prepared?.release();
    expect(revoke).toHaveBeenCalledWith(prepared?.url);
  });
  it("cancels a stream that exceeds the byte cap despite missing or incorrect headers", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(5 * 1024 * 1024));
      },
      cancel,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body)));
    prepareNextVideo(media);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalled());
    expect(takePreparedVideo(media.id)).toBeNull();
    expect(videoMetrics().preloadBytes).toBe(0);
  });
  it("aborts preparation after three seconds and rejects partial responses", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url, options: RequestInit) => {
        signal = options.signal as AbortSignal;
        return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(new Error("aborted"))));
      }),
    );
    prepareNextVideo(media);
    await vi.advanceTimersByTimeAsync(3000);
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
    expect(takePreparedVideo(media.id)).toBeNull();
  });
  it("clears prepared content and revokes active blobs when identity changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() => Promise.resolve(new Response(new Uint8Array(4)))),
    );
    prepareNextVideo(media);
    await vi.waitFor(() => expect(videoMetrics().preloadBytes).toBe(4));
    const prepared = takePreparedVideo(media.id)!;
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    setVideoIdentity("user:owner");
    expect(revoke).toHaveBeenCalledWith(prepared.url);
    expect(takePreparedVideo(media.id)).toBeNull();
    expect(videoMetrics().preloadHits).toBe(0);
    clearPreparedVideo();
  });
  it("turns off preparation for data saving and slow networks", () => {
    expect(permitsVideoPreparation()).toBe(true);
    expect(permitsVideoPreparation({ effectiveType: "4g", downlink: 10 })).toBe(true);
    expect(permitsVideoPreparation({ saveData: true })).toBe(false);
    expect(permitsVideoPreparation({ effectiveType: "3g" })).toBe(false);
    expect(permitsVideoPreparation({ effectiveType: "2g" })).toBe(false);
    expect(permitsVideoPreparation({ downlink: 0.5 })).toBe(false);
  });
});

describe("session playback state", () => {
  it("resumes position and removes completed media", () => {
    const memory = playbackMemory("video");
    memory.save(12, 60);
    expect(playbackMemory("video").position()).toBe(12);
    memory.save(60, 60);
    expect(memory.position()).toBe(0);
  });
  it("isolates users and roles and ignores stale saves after logout", () => {
    const stale = playbackMemory("video");
    stale.save(12, 60);
    setVideoIdentity("user:owner");
    expect(playbackMemory("video").position()).toBe(0);
    stale.save(20, 60);
    expect(playbackMemory("video").position()).toBe(0);
    setVideoIdentity(null);
    playbackMemory("video").save(25, 60);
    expect(playbackMemory("video").position()).toBe(0);
  });
  it("bounds position and timing history", () => {
    for (let index = 0; index < 60; index++) {
      playbackMemory(`video-${index}`).save(5, 60);
      recordVideoMetric("starts", performance.now());
    }
    expect(playbackMemory("video-0").position()).toBe(0);
    expect(playbackMemory("video-59").position()).toBe(5);
    expect(videoMetrics().starts).toHaveLength(32);
    expect(performance.getEntriesByName("konogoro:video-start")).toHaveLength(1);
  });
});

function mockStorage(initial: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initial));
  const storage = {
    get length() {
      return entries.size;
    },
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
    removeItem: (key: string) => {
      entries.delete(key);
    },
    key: (index: number) => [...entries.keys()][index] ?? null,
  };
  vi.stubGlobal("localStorage", storage);
  return storage;
}

describe("persistent resume", () => {
  it("restores after a module/page reload using only the same user and role", async () => {
    const storage = mockStorage();
    const memory = playbackMemory("video");
    memory.save(18, 60);
    memory.flush();
    expect(storage.getItem("konogoro:video-positions:user%3Aviewer")).toContain('"seconds":18');
    vi.resetModules();
    const reloaded = await import("./video-experience");
    reloaded.setVideoIdentity("user:viewer");
    expect(reloaded.playbackMemory("video").position()).toBe(18);
    reloaded.setVideoIdentity("user:owner");
    expect(reloaded.playbackMemory("video").position()).toBe(0);
    expect(storage.getItem("konogoro:video-positions:user%3Aviewer")).toBeNull();
    reloaded.setVideoIdentity(null);
  });
  it("ignores expired, future and malformed stored positions", async () => {
    mockStorage({
      "konogoro:video-positions:user%3Aviewer": JSON.stringify([
        ["valid", { seconds: 10, savedAt: Date.now() }],
        ["expired", { seconds: 10, savedAt: Date.now() - 8 * 86400_000 }],
        ["future", { seconds: 10, savedAt: Date.now() + 86400_000 }],
        ["negative", { seconds: -1, savedAt: Date.now() }],
        ["string", { seconds: "18", savedAt: Date.now() }],
        ["url?private", { seconds: 10, savedAt: Date.now() }],
      ]),
    });
    vi.resetModules();
    const reloaded = await import("./video-experience");
    reloaded.setVideoIdentity("user:viewer");
    expect(reloaded.playbackMemory("valid").position()).toBe(10);
    for (const key of ["expired", "future", "negative", "string", "url?private"])
      expect(reloaded.playbackMemory(key).position()).toBe(0);
    reloaded.setVideoIdentity(null);
  });
  it("clears saved positions when a reloaded page finds authentication expired", async () => {
    const storage = mockStorage({ "konogoro:video-positions:previous-user": "[]", "app-theme": "dark" });
    vi.resetModules();
    const reloaded = await import("./video-experience");
    reloaded.setVideoIdentity(null);
    expect(storage.getItem("konogoro:video-positions:previous-user")).toBeNull();
    expect(storage.getItem("app-theme")).toBe("dark");
  });
  it("keeps in-memory resume when device storage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
      removeItem() {
        throw new Error("blocked");
      },
    });
    const memory = playbackMemory("video");
    memory.save(22, 60);
    expect(() => memory.flush()).not.toThrow();
    expect(memory.position()).toBe(22);
  });
});
