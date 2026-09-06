import { api } from "./api";
import { putBlob } from "./upload-transport";
import { multipartPartBytes, type MultipartSession, type MultipartVariant } from "../shared/multipart";

export type UploadOptions = { mediaId?: string; variant?: MultipartVariant; signal?: AbortSignal };
type CompletedPart = { partNumber: number; etag: string; byteSize: number };
type UploadState = { session: MultipartSession; body: Blob; completed: Map<number, CompletedPart> };
// Deliberately memory-only: resumption is offered for this selection in the same page.
const uploads = new Map<string, UploadState>();
const starts = new Map<string, Promise<UploadState>>();
const aborting = new Map<string, Promise<void>>();
let activeParts = 0;
const waitingParts: Array<() => void> = [];
const MAX_ACTIVE_PARTS = 3;

function sessionKey(mediaId: string, variant: MultipartVariant): string {
  return `${mediaId}:${variant}`;
}
function basePath(mediaId: string): string {
  return `/media/${encodeURIComponent(mediaId)}/multipart`;
}
function control<T>(path: string, body?: unknown, signal?: AbortSignal, method = "POST"): Promise<T> {
  return api<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
  });
}

export async function uploadMultipart(
  mediaId: string,
  variant: MultipartVariant,
  body: Blob,
  contentType: string,
  onProgress?: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const key = sessionKey(mediaId, variant);
  signal?.throwIfAborted();
  const cleanup = aborting.get(key);
  if (cleanup) await untilAborted(cleanup, signal);
  let state = uploads.get(key);
  try {
    if (!state) {
      let starting = starts.get(key);
      if (!starting) {
        // Keep the start response available even if the user cancels during initiation, so it can be aborted.
        starting = retry(async () => {
          const session = await control<MultipartSession>(basePath(mediaId), { variant, byteSize: body.size });
          const value = { session, body, completed: new Map<number, CompletedPart>() };
          uploads.set(key, value);
          return value;
        }).finally(() => starts.delete(key));
        starts.set(key, starting);
      }
      state = await untilAborted(starting, signal);
    }
    if (state.body !== body) throw new Error("再試行する動画が元の選択と一致しません");
    signal?.throwIfAborted();
    if (state.session.status === "completed") {
      onProgress?.(body.size);
      uploads.delete(key);
      return;
    }
    const current = state;
    const sessionPath = `${basePath(mediaId)}/${encodeURIComponent(current.session.sessionId)}`;
    const loaded = new Map<number, number>(
      Array.from(current.completed.values(), (part) => [part.partNumber, part.byteSize]),
    );
    const report = (partNumber: number, bytes: number) => {
      loaded.set(partNumber, bytes);
      onProgress?.(
        Math.min(
          body.size,
          Array.from(loaded.values()).reduce((sum, value) => sum + value, 0),
        ),
      );
    };
    onProgress?.(Array.from(loaded.values()).reduce((sum, value) => sum + value, 0));
    const missing = Array.from({ length: current.session.partCount }, (_, index) => index + 1).filter(
      (partNumber) => !current.completed.has(partNumber),
    );
    let next = 0;
    let failure: unknown;
    await Promise.all(
      Array.from({ length: Math.min(MAX_ACTIVE_PARTS, missing.length) }, async () => {
        while (!failure && next < missing.length) {
          const partNumber = missing[next++];
          const byteSize = multipartPartBytes(body.size, partNumber, current.session.partSize);
          const part = body.slice(
            (partNumber - 1) * current.session.partSize,
            (partNumber - 1) * current.session.partSize + byteSize,
            contentType,
          );
          try {
            await retry(async () => {
              const release = await acquirePart(signal);
              try {
                signal?.throwIfAborted();
                // Sign on every attempt, including retries after a stale/expired URL.
                const target = await control<{ uploadUrl: string; byteSize: number }>(
                  `${sessionPath}/parts/${partNumber}`,
                  undefined,
                  signal,
                );
                if (target.byteSize !== byteSize) throw new Error("送信する部分の容量が一致しません");
                const etag = await putBlob(
                  target.uploadUrl,
                  part,
                  contentType,
                  (bytes) => report(partNumber, bytes),
                  signal,
                );
                if (!etag || !/^[a-fA-F0-9]{32}$/.test(etag))
                  throw new Error("送信結果を確認できません。R2のCORS設定を確認してください");
                current.completed.set(partNumber, { partNumber, etag, byteSize });
                report(partNumber, byteSize);
              } catch (error) {
                report(partNumber, 0);
                throw error;
              } finally {
                release();
              }
            }, signal);
          } catch (error) {
            failure = error;
          }
        }
      }),
    );
    if (failure) throw failure;
    signal?.throwIfAborted();
    await retry(
      () =>
        control(
          `${sessionPath}/complete`,
          {
            parts: Array.from(current.completed.values()).sort((a, b) => a.partNumber - b.partNumber),
          },
          signal,
        ),
      signal,
    );
    current.session.status = "completed";
    onProgress?.(body.size);
    uploads.delete(key);
  } catch (error) {
    // The UI can stop immediately; a late start response still supplies the session to clean up.
    if (signal?.aborted) void abortMultipartUpload(mediaId, variant).catch(() => undefined);
    throw error;
  }
}

export async function abortMultipartUpload(mediaId: string, variant: MultipartVariant = "original"): Promise<void> {
  const key = sessionKey(mediaId, variant);
  const previous = aborting.get(key);
  if (previous) return previous;
  const cleanup = (async () => {
    const state = uploads.get(key) ?? (await starts.get(key));
    if (!state) return;
    uploads.delete(key);
    await retry(() =>
      control(`${basePath(mediaId)}/${encodeURIComponent(state.session.sessionId)}`, undefined, undefined, "DELETE"),
    );
  })().finally(() => aborting.delete(key));
  aborting.set(key, cleanup);
  return cleanup;
}

function untilAborted<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function retry<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      if (signal?.aborted || attempt >= 2) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
}

async function acquirePart(signal?: AbortSignal): Promise<() => void> {
  signal?.throwIfAborted();
  if (activeParts >= MAX_ACTIVE_PARTS)
    await new Promise<void>((resolve, reject) => {
      const resume = () => {
        signal?.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        const index = waitingParts.indexOf(resume);
        if (index >= 0) waitingParts.splice(index, 1);
        reject(signal?.reason);
      };
      waitingParts.push(resume);
      signal?.addEventListener("abort", abort, { once: true });
    });
  else activeParts += 1;
  return () => {
    const next = waitingParts.shift();
    if (next) next();
    else activeParts -= 1;
  };
}
