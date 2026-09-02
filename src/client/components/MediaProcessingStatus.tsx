import type { UploadStatus } from "../media-upload";

type MediaProcessingStatusProps = {
  files: Array<{ status: UploadStatus }>;
  uploading: boolean;
  uploadProgress: number;
};

export function MediaProcessingStatus({ files, uploading, uploadProgress }: MediaProcessingStatusProps) {
  const preparingCount = files.filter((file) => file.status === "preparing").length;
  if (preparingCount > 0) {
    const finishedCount = files.length - preparingCount;
    return (
      <div className="media-processing-status" role="status" aria-live="polite">
        <div>
          <span>写真・動画を準備中</span>
          <strong>
            {finishedCount} / {files.length}
          </strong>
        </div>
        <progress value={finishedCount} max={files.length} />
      </div>
    );
  }

  if (!uploading || files.length === 0) return null;
  const uploadedCount = files.filter((file) => file.status === "uploaded").length;
  return (
    <div className="media-processing-status" role="status" aria-live="polite">
      <div>
        <span>{uploadProgress === 100 ? "投稿を仕上げています" : "アップロード中"}</span>
        <strong>
          {uploadedCount} / {files.length} · {uploadProgress}%
        </strong>
      </div>
      <progress value={uploadProgress} max={100} />
    </div>
  );
}
