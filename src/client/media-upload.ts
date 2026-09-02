import * as exifr from "exifr";

export type UploadStatus = "ready" | "uploading" | "uploaded" | "failed";

export type SelectedMediaFile = {
  file: File;
  previewUrl: string;
  thumbnail: Blob;
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

export async function readMediaFile(file: File): Promise<SelectedMediaFile> {
  const previewUrl = URL.createObjectURL(file);
  try {
    const capturedAt = await captureDate(file);
    if (file.type.startsWith("video/")) {
      const video = await loadVideo(previewUrl);
      const thumbnail = await drawOptimizedImage(video, video.videoWidth, video.videoHeight, 480, 0.78);
      return {
        file,
        previewUrl,
        thumbnail,
        capturedAt,
        width: video.videoWidth,
        height: video.videoHeight,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
        status: "ready",
      };
    }
    const bitmap = await createImageBitmap(file);
    const [thumbnail, optimizedPreview] = await Promise.all([
      drawOptimizedImage(bitmap, bitmap.width, bitmap.height, 480, 0.78),
      drawOptimizedImage(bitmap, bitmap.width, bitmap.height, 1800, 0.86),
    ]);
    const result = {
      file,
      previewUrl,
      thumbnail,
      optimizedPreview,
      capturedAt,
      width: bitmap.width,
      height: bitmap.height,
      durationSeconds: null,
      status: "ready" as const,
    };
    bitmap.close();
    return result;
  } catch (error) {
    URL.revokeObjectURL(previewUrl);
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

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.addEventListener(
      "loadeddata",
      () => {
        const seekTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(1, video.duration / 3) : 0;
        if (seekTime === 0) resolve(video);
        else {
          video.currentTime = seekTime;
          window.setTimeout(() => resolve(video), 1000);
        }
      },
      { once: true },
    );
    video.addEventListener("seeked", () => resolve(video), { once: true });
    video.addEventListener("error", () => reject(new Error("動画を読み込めません")), { once: true });
    video.src = url;
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
