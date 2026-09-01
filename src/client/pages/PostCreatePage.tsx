import * as exifr from "exifr";
import { AlertCircle, ImagePlus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { EventDetail, EventSection, EventSummary, UploadTarget } from "../../shared/types";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";

type UploadStatus = "ready" | "uploading" | "uploaded" | "failed";
type SelectedFile = {
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

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"]);

export function PostCreatePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [sections, setSections] = useState<EventSection[]>([]);
  const [eventId, setEventId] = useState(searchParams.get("event") ?? "");
  const [sectionId, setSectionId] = useState("");
  const [files, setFiles] = useState<SelectedFile[]>([]);
  const [draftPostId, setDraftPostId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [newSection, setNewSection] = useState("");
  const [showSectionForm, setShowSectionForm] = useState(false);
  const filesRef = useRef(files);

  useEffect(() => { void api<{ events: EventSummary[] }>("/events").then(({ events: result }) => setEvents(result)); }, []);
  useEffect(() => {
    if (eventId) void api<EventDetail>(`/events/${eventId}`).then((detail) => setSections(detail.sections));
  }, [eventId]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => filesRef.current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl)), []);

  const updateFile = (index: number, values: Partial<SelectedFile>) => setFiles((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));

  const selectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    const invalid = chosen.find((file) => !allowedTypes.has(file.type) || file.size > (file.type.startsWith("video/") ? 500 : 25) * 1024 * 1024);
    if (invalid) { setError("JPEG・PNG・WebP・MP4・WebM・MOVを選択してください。写真25MB、動画500MBまでです。"); return; }
    if (files.length + chosen.length > 30) { setError("一度に選べる写真・動画は30件までです。"); return; }
    setError("");
    setPreparing(true);
    try { const selected = await Promise.all(chosen.map(readFileMetadata)); setFiles((current) => [...current, ...selected]); }
    catch { setError("選択したメディアを読み込めませんでした"); }
    finally { setPreparing(false); }
  };

  const removeFile = (index: number) => {
    setFiles((current) => { URL.revokeObjectURL(current[index].previewUrl); return current.filter((_, itemIndex) => itemIndex !== index); });
  };

  const createSection = async () => {
    if (!eventId || !newSection.trim()) return;
    try {
      const section = await api<EventSection>(`/events/${eventId}/sections`, { method: "POST", body: JSON.stringify({ title: newSection }) });
      setSections((current) => [...current, section]); setSectionId(section.id); setNewSection(""); setShowSectionForm(false);
    } catch (reason) { setError((reason as Error).message); }
  };

  const uploadEntries = async (postId: string, entries: Array<{ item: SelectedFile; index: number; target: UploadTarget }>) => {
    const totalBytes = entries.reduce((total, { item, target }) => total + item.file.size + item.thumbnail.size + (target.previewUploadUrl && item.optimizedPreview ? item.optimizedPreview.size : 0), 0);
    const loadedByRequest = new Map<string, number>();
    let loadedBytes = 0;
    let nextEntry = 0;
    let failed = false;
    const reportProgress = (key: string, loaded: number) => {
      const previous = loadedByRequest.get(key) ?? 0;
      loadedByRequest.set(key, loaded);
      loadedBytes += loaded - previous;
      setProgress(Math.round(loadedBytes / totalBytes * 100));
    };
    await Promise.all(Array.from({ length: Math.min(2, entries.length) }, async () => {
      while (nextEntry < entries.length) {
        const { item, index, target } = entries[nextEntry++];
        updateFile(index, { status: "uploading", mediaId: target.id });
        try {
          await Promise.all([
            uploadFile(target.uploadUrl, item.file, item.file.type, (loaded) => reportProgress(`${index}:original`, loaded)),
            uploadFile(target.thumbnailUploadUrl, item.thumbnail, "image/webp", (loaded) => reportProgress(`${index}:thumbnail`, loaded)),
            ...(target.previewUploadUrl && item.optimizedPreview ? [uploadFile(target.previewUploadUrl, item.optimizedPreview, "image/webp", (loaded) => reportProgress(`${index}:preview`, loaded))] : []),
          ]);
          await api(`/media/${target.id}/complete`, { method: "POST", body: JSON.stringify({ width: item.width, height: item.height }) });
          updateFile(index, { status: "uploaded", mediaId: target.id });
        } catch {
          failed = true;
          updateFile(index, { status: "failed", mediaId: target.id });
          await api(`/media/${target.id}/failed`, { method: "POST" }).catch(() => undefined);
        }
      }
    }));
    if (failed) {
      setError("一部のアップロードに失敗しました。失敗した項目だけ再試行できます。"); setBusy(false); return;
    }
    await api(`/posts/${postId}/publish`, { method: "POST" });
    navigate(`/posts/${postId}`, { replace: true });
  };

  const requestUploads = async (postId: string) => {
    const response = await api<{ media: UploadTarget[] }>(`/posts/${postId}/media/upload-urls`, { method: "POST", body: JSON.stringify({ files: files.map((item) => ({ filename: item.file.name, mimeType: item.file.type, byteSize: item.file.size, capturedAt: item.capturedAt, durationSeconds: item.durationSeconds })) }) });
    const prepared = files.map((item, index) => ({ ...item, mediaId: response.media[index].id }));
    setFiles(prepared);
    await uploadEntries(postId, prepared.map((item, index) => ({ item, index, target: response.media[index] })));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (files.length === 0) { setError("写真・動画を1件以上選択してください"); return; }
    setBusy(true); setError(""); setProgress(0);
    const form = new FormData(event.currentTarget);
    try {
      const post = await api<{ id: string }>("/posts", { method: "POST", body: JSON.stringify({ title: form.get("title"), caption: form.get("caption"), eventId: eventId || null, sectionId: sectionId || null }) });
      setDraftPostId(post.id);
      await requestUploads(post.id);
    } catch (reason) { setError((reason as Error).message); setBusy(false); }
  };

  const retryUploadSetup = async () => {
    if (!draftPostId) return;
    setBusy(true); setError(""); setProgress(0);
    try { await requestUploads(draftPostId); }
    catch (reason) { setError((reason as Error).message); setBusy(false); }
  };

  const retryFailed = async () => {
    if (!draftPostId) return;
    setBusy(true); setError(""); setProgress(0);
    try {
      const failed = files.map((item, index) => ({ item, index })).filter(({ item }) => item.status === "failed" && item.mediaId);
      const entries = await Promise.all(failed.map(async ({ item, index }) => ({ item, index, target: await api<UploadTarget>(`/media/${item.mediaId}/upload-url`, { method: "POST" }) })));
      await uploadEntries(draftPostId, entries);
    } catch (reason) { setError((reason as Error).message); setBusy(false); }
  };

  const retryPublish = async () => {
    if (!draftPostId) return;
    setBusy(true); setError("");
    try {
      await api(`/posts/${draftPostId}/publish`, { method: "POST" });
      navigate(`/posts/${draftPostId}`, { replace: true });
    } catch (reason) { setError((reason as Error).message); setBusy(false); }
  };

  const photos = files.filter((item) => item.file.type.startsWith("image/")).length;
  const videos = files.length - photos;

  return <>
    <PageHeader title="写真・動画を追加" back />
    <main className="form-page page-content"><form onSubmit={submit} className="form-stack">
      <section className="photo-picker"><div className="selected-photos">
        {files.map((item, index) => <div className={`selected-photo ${item.status}`} key={`${item.file.name}-${item.file.lastModified}-${index}`}><img src={item.previewUrl} alt="" />{item.file.type.startsWith("video/") && <span className="video-badge">動画</span>}{item.status === "failed" && <span className="failed-badge"><AlertCircle /></span>}{!draftPostId && <button type="button" onClick={() => removeFile(index)} aria-label={`${item.file.name}を外す`}><X /></button>}</div>)}
        {!draftPostId && <label className="photo-add"><ImagePlus /><span>{files.length ? "さらに選択" : "写真・動画を選択"}</span><input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime" multiple onChange={selectFiles} disabled={busy || preparing} /></label>}
      </div>{files.length > 0 && <p className="selection-count">{[photos ? `写真${photos}枚` : "", videos ? `動画${videos}本` : ""].filter(Boolean).join(" · ")}</p>}</section>
      <label>イベント<select value={eventId} onChange={(event) => { setEventId(event.target.value); setSectionId(""); setSections([]); }} disabled={busy || !!draftPostId}><option value="">イベントなし</option>{events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      {eventId && <label>セクション<select value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={busy || !!draftPostId}><option value="">セクションなし</option>{sections.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>}
      {eventId && !draftPostId && (!showSectionForm ? <button className="text-button inline-action" type="button" onClick={() => setShowSectionForm(true)}><Plus />新しいセクション</button> : <div className="inline-form"><input value={newSection} onChange={(event) => setNewSection(event.target.value)} placeholder="例: Day 2 - シュトゥットガルト" maxLength={100} /><button type="button" className="outline-button" onClick={createSection}>作成</button></div>)}
      <label>投稿タイトル<input name="title" required maxLength={120} placeholder="例: ポルシェミュージアム" disabled={busy || !!draftPostId} /></label>
      <label>キャプション<textarea name="caption" rows={4} maxLength={2000} placeholder="思い出をひとこと" disabled={busy || !!draftPostId} /></label>
      {preparing && <p className="muted" role="status">画像を準備中…</p>}
      {(busy || progress > 0) && <div className="upload-progress" role="status"><div><span>{progress === 100 ? "処理中" : "アップロード中"}</span><strong>{progress}%</strong></div><progress value={progress} max={100} /></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {busy ? null : files.some((item) => item.status === "failed") ? <button className="outline-button wide" type="button" onClick={retryFailed}><RotateCcw />失敗した項目を再試行</button>
        : draftPostId && files.every((item) => item.status === "uploaded") ? <button className="outline-button wide" type="button" onClick={retryPublish} disabled={busy}><RotateCcw />投稿を完了</button>
        : draftPostId ? <button className="outline-button wide" type="button" onClick={retryUploadSetup} disabled={busy}><RotateCcw />アップロードを再開</button>
        : <button className="primary-button wide" disabled={preparing || files.length === 0}>投稿</button>}
    </form></main>
  </>;
}

async function readFileMetadata(file: File): Promise<SelectedFile> {
  const previewUrl = URL.createObjectURL(file);
  const capturedAt = await captureDate(file);
  if (file.type.startsWith("video/")) {
    const video = await loadVideo(previewUrl);
    const thumbnail = await drawOptimizedImage(video, video.videoWidth, video.videoHeight, 480, 0.78);
    return { file, previewUrl, thumbnail, capturedAt, width: video.videoWidth, height: video.videoHeight, durationSeconds: Number.isFinite(video.duration) ? video.duration : null, status: "ready" };
  }
  const bitmap = await createImageBitmap(file);
  const [thumbnail, optimizedPreview] = await Promise.all([
    drawOptimizedImage(bitmap, bitmap.width, bitmap.height, 480, 0.78),
    drawOptimizedImage(bitmap, bitmap.width, bitmap.height, 1800, 0.86),
  ]);
  const result = { file, previewUrl, thumbnail, optimizedPreview, capturedAt, width: bitmap.width, height: bitmap.height, durationSeconds: null, status: "ready" as const };
  bitmap.close();
  return result;
}

async function captureDate(file: File): Promise<string | null> {
  if (file.type.startsWith("image/")) {
    try {
      const metadata = await exifr.parse(file, ["DateTimeOriginal", "CreateDate"]);
      const date = metadata?.DateTimeOriginal ?? metadata?.CreateDate;
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
    } catch { /* metadata is optional */ }
  }
  return file.lastModified ? new Date(file.lastModified).toISOString() : null;
}

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata"; video.muted = true; video.playsInline = true;
    video.addEventListener("loadeddata", () => {
      const seekTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(1, video.duration / 3) : 0;
      if (seekTime === 0) resolve(video);
      else {
        video.currentTime = seekTime;
        window.setTimeout(() => resolve(video), 1000);
      }
    }, { once: true });
    video.addEventListener("seeked", () => resolve(video), { once: true });
    video.addEventListener("error", () => reject(new Error("動画を読み込めません")), { once: true });
    video.src = url;
  });
}

async function drawOptimizedImage(source: CanvasImageSource, width: number, height: number, max: number, quality: number): Promise<Blob> {
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("プレビュー画像を作成できません")), "image/webp", quality));
}

function uploadFile(url: string, body: Blob, contentType = body.type, onProgress?: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url); request.setRequestHeader("Content-Type", contentType);
    request.upload.addEventListener("progress", (event) => onProgress?.(event.loaded));
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) { onProgress?.(body.size); resolve(); }
      else reject(new Error("アップロードに失敗しました"));
    });
    request.addEventListener("error", () => reject(new Error("アップロードに失敗しました")));
    request.send(body);
  });
}
