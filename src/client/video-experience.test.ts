import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Media } from "../shared/types";
import {
  canPrepareVideo,
  MAX_VIDEO_PRELOAD_BYTES,
  playbackMemory,
  prepareNextVideo,
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
});

describe("session playback state", () => {
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
  it("clears saved positions when a reloaded page finds authentication expired", async () => {
    const storage = mockStorage({ "konogoro:video-positions:previous-user": "[]", "app-theme": "dark" });
    vi.resetModules();
    const reloaded = await import("./video-experience");
    reloaded.setVideoIdentity(null);
    expect(storage.getItem("konogoro:video-positions:previous-user")).toBeNull();
    expect(storage.getItem("app-theme")).toBe("dark");
  });
});
