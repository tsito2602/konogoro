export function putBlob(
  url: string,
  body: Blob,
  contentType: string,
  onProgress?: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<string | null> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const request = new XMLHttpRequest();
    const abort = () => request.abort();
    const finish = (error?: Error) => {
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else {
        onProgress?.(body.size);
        resolve(request.getResponseHeader("ETag")?.replace(/^"|"$/g, "") ?? null);
      }
    };
    request.open("PUT", url);
    request.timeout = 10 * 60 * 1000;
    request.addEventListener("timeout", () => finish(new Error("送信がタイムアウトしました。再試行してください")));
    request.addEventListener("abort", () => finish(new DOMException("送信を中断しました", "AbortError")));
    request.setRequestHeader("Content-Type", contentType);
    request.upload.addEventListener("progress", (event) => onProgress?.(Math.min(body.size, event.loaded)));
    request.addEventListener("load", () =>
      finish(request.status >= 200 && request.status < 300 ? undefined : new Error("アップロードに失敗しました")),
    );
    request.addEventListener("error", () => finish(new Error("アップロードに失敗しました")));
    signal?.addEventListener("abort", abort, { once: true });
    request.send(body);
  });
}
