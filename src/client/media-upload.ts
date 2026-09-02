import * as exifr from "exifr";

export type UploadStatus = "preparing" | "preparation-failed" | "ready" | "uploading" | "uploaded" | "failed";

export type SelectedMediaFile = {
  id: string;
  file: File;
  previewUrl: string;
  thumbnail: Blob | null;
  optimizedPreview?: Blob;
  capturedAt: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  mediaId?: string;
  status: UploadStatus;
};

export const acceptedMediaTypes = "image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime";
const allowedTypes = new Set(acceptedMediaTypes.split(","));

export function validateMediaFiles(files: File[], currentCount: number): string | null {
  const invalid = files.find(
    (file) => !allowedTypes.has(file.type) || file.size > (file.type.startsWith("video/") ? 500 : 25) * 1024 * 1024,
  );
  if (invalid) return "JPEG・PNG・WebP・MP4・WebM・MOVを選択してください。写真25MB、動画500MBまでです。";
  if (currentCount + files.length > 30) return "選べる写真・動画は合計30件までです。";
  return null;
}

export function createPendingMediaFile(file: File): SelectedMediaFile {
  const previewUrl = URL.createObjectURL(file);
  return {
    id: previewUrl,
    file,
    previewUrl,
    thumbnail: null,
    capturedAt: null,
    width: null,
    height: null,
    durationSeconds: null,
    status: "preparing",
  };
}

export async function prepareMediaFiles(
  files: SelectedMediaFile[],
  onPrepared: (file: SelectedMediaFile) => void,
  concurrency = 2,
): Promise<void> {
  const limit = Math.max(1, concurrency);
  const imageFiles = files.filter((file) => !file.file.type.startsWith("video/"));
  const videoFiles = files.filter((file) => file.file.type.startsWith("video/"));
  if (limit === 1 || imageFiles.length === 0 || videoFiles.length === 0) {
    await prepareMediaQueue(files, videoFiles.length > 0 ? 1 : limit, onPrepared);
    return;
  }
  await Promise.all([
    prepareMediaQueue(imageFiles, limit - 1, onPrepared),
    prepareMediaQueue(videoFiles, 1, onPrepared),
  ]);
}

async function prepareMediaQueue(
  files: SelectedMediaFile[],
  concurrency: number,
  onPrepared: (file: SelectedMediaFile) => void,
): Promise<void> {
  let nextFile = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, files.length) }, async () => {
      while (nextFile < files.length) {
        const file = files[nextFile++];
        try {
          onPrepared(await prepareMediaFile(file));
        } catch {
          onPrepared({ ...file, status: "preparation-failed" });
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    }),
  );
}

async function prepareMediaFile(item: SelectedMediaFile): Promise<SelectedMediaFile> {
  const capturedAtPromise = captureDate(item.file);
  try {
    if (item.file.type.startsWith("video/")) {
      const video = await loadVideoFirstFrame(item.previewUrl);
      const width = video.videoWidth;
      const height = video.videoHeight;
      const durationSeconds = Number.isFinite(video.duration) ? video.duration : null;
      const thumbnail = await drawOptimizedImage(video, video.videoWidth, video.videoHeight, 480, 0.78);
      video.removeAttribute("src");
      video.load();
      const previewUrl = URL.createObjectURL(thumbnail);
      URL.revokeObjectURL(item.previewUrl);
      return {
        ...item,
        previewUrl,
        thumbnail,
        capturedAt: await capturedAtPromise,
        width,
        height,
        durationSeconds,
        status: "ready",
      };
    }
    const bitmap = await createImageBitmap(item.file);
    try {
      const thumbnail = await drawOptimizedImage(bitmap, bitmap.width, bitmap.height, 480, 0.78);
      const optimizedPreview = await drawOptimizedImage(bitmap, bitmap.width, bitmap.height, 1800, 0.86);
      const previewUrl = URL.createObjectURL(thumbnail);
      const result: SelectedMediaFile = {
        ...item,
        previewUrl,
        thumbnail,
        optimizedPreview,
        capturedAt: await capturedAtPromise,
        width: bitmap.width,
        height: bitmap.height,
        durationSeconds: null,
        status: "ready",
      };
      URL.revokeObjectURL(item.previewUrl);
      return result;
    } finally {
      bitmap.close();
    }
  } catch (error) {
    await capturedAtPromise;
    throw error;
  }
}

export function uploadFile(
  url: string,
  body: Blob,
  contentType = body.type,
  onProgress?: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", contentType);
    request.upload.addEventListener("progress", (event) => onProgress?.(event.loaded));
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(body.size);
        resolve();
      } else reject(new Error("アップロードに失敗しました"));
    });
    request.addEventListener("error", () => reject(new Error("アップロードに失敗しました")));
    request.send(body);
  });
}

async function captureDate(file: File): Promise<string | null> {
  if (file.type.startsWith("image/")) {
    try {
      const metadata = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
      const date = metadata?.DateTimeOriginal ?? metadata?.CreateDate;
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
    } catch {
      /* metadata is optional */
    }
  }
  return file.lastModified ? new Date(file.lastModified).toISOString() : null;
}

function loadVideoFirstFrame(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener("loadeddata", () => resolve(video), { once: true });
    video.addEventListener("error", () => reject(new Error("動画を読み込めません")), { once: true });
    video.src = url;
    video.load();
  });
}

async function drawOptimizedImage(
  source: CanvasImageSource,
  width: number,
  height: number,
  max: number,
  quality: number,
): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("プレビュー画像を作成できません"))),
      "image/webp",
      quality,
    ),
  );
}
