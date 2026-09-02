import { AlertCircle, ImagePlus, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EventDetail, EventScene, EventSummary, Post, UploadTarget } from "../../shared/types";
import { api } from "../api";
import { ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { acceptedMediaTypes, readMediaFile, uploadFile, validateMediaFiles, type SelectedMediaFile } from "../media-upload";

export function PostEditPage() {
  const { postId = "" } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();
  const [post, setPost] = useState<Post | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [scenes, setScenes] = useState<EventScene[]>([]);
  const [eventId, setEventId] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [newScene, setNewScene] = useState("");
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [files, setFiles] = useState<SelectedMediaFile[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState(0);
  const filesRef = useRef(files);

  const load = () => {
    setError("");
    void Promise.all([api<Post>(`/posts/${postId}`), api<{ events: EventSummary[] }>("/events")])
      .then(([result, eventResult]) => {
        setPost(result); setEvents(eventResult.events); setEventId(result.eventId ?? ""); setSceneId(result.sceneId ?? "");
      })
      .catch((reason: Error) => setError(reason.message));
  };

  useEffect(() => {
    void Promise.all([api<Post>(`/posts/${postId}`), api<{ events: EventSummary[] }>("/events")])
      .then(([result, eventResult]) => {
        setPost(result); setEvents(eventResult.events); setEventId(result.eventId ?? ""); setSceneId(result.sceneId ?? "");
      })
      .catch((reason: Error) => setError(reason.message));
  }, [postId]);
  useEffect(() => {
    if (!eventId) return;
    void api<EventDetail>(`/events/${eventId}`).then((event) => setScenes(event.scenes)).catch((reason: Error) => setError(reason.message));
  }, [eventId]);
  useEffect(() => { filesRef.current = files; }, [files]);
  useEffect(() => () => filesRef.current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl)), []);

  if (!post && !error) return <><PageHeader title="投稿を編集" back /><Loading /></>;
  if (!post) return <><PageHeader title="投稿を編集" back /><ErrorState message={error} retry={load} /></>;

  const remainingMedia = post.media.filter((media) => !removedMediaIds.includes(media.id));
  const totalCount = remainingMedia.length + files.length;
  const updateFile = (index: number, values: Partial<SelectedMediaFile>) => setFiles((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...values } : item));

  const selectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    const validationError = validateMediaFiles(chosen, totalCount);
    if (validationError) { setError(validationError); return; }
    setError(""); setPreparing(true);
    try { const selected = await Promise.all(chosen.map(readMediaFile)); setFiles((current) => [...current, ...selected]); }
    catch { setError("選択したメディアを読み込めませんでした"); }
    finally { setPreparing(false); }
  };

  const removeNewFile = async (index: number) => {
    const item = files[index];
    if (item.mediaId) {
      try { await api(`/posts/${post.id}/media/${item.mediaId}`, { method: "DELETE" }); }
      catch (reason) { setError((reason as Error).message); return; }
    }
    URL.revokeObjectURL(item.previewUrl);
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const createScene = async () => {
    if (!eventId || !newScene.trim()) return;
    try {
      const scene = await api<EventScene>(`/events/${eventId}/scenes`, { method: "POST", body: JSON.stringify({ title: newScene }) });
      setScenes((current) => [...current, scene]); setSceneId(scene.id); setNewScene(""); setShowSceneForm(false);
    } catch (reason) { setError((reason as Error).message); }
  };

  const uploadEntries = async (entries: Array<{ item: SelectedMediaFile; index: number; target: UploadTarget }>) => {
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
    return !failed;
  };

  const finishSave = async (caption: FormDataEntryValue | null) => {
    await api(`/posts/${post.id}`, { method: "PUT", body: JSON.stringify({ caption, eventId: eventId || null, sceneId: sceneId || null }) });
    for (const mediaId of removedMediaIds) await api(`/posts/${post.id}/media/${mediaId}`, { method: "DELETE" });
    showToast("投稿を更新しました");
    navigate(`/posts/${post.id}`, { replace: true });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (totalCount === 0) { setError("写真・動画を1件以上残してください"); return; }
    setSaving(true); setError(""); setProgress(0);
    const caption = new FormData(event.currentTarget).get("caption");
    try {
      const ready = files.map((item, index) => ({ item, index })).filter(({ item }) => item.status === "ready");
      const failed = files.map((item, index) => ({ item, index })).filter(({ item }) => item.status === "failed" && item.mediaId);
      const entries: Array<{ item: SelectedMediaFile; index: number; target: UploadTarget }> = [];
      if (ready.length > 0) {
        const response = await api<{ media: UploadTarget[] }>(`/posts/${post.id}/media/upload-urls`, {
          method: "POST",
          body: JSON.stringify({ replacingMediaIds: removedMediaIds, files: ready.map(({ item }) => ({ filename: item.file.name, mimeType: item.file.type, byteSize: item.file.size, capturedAt: item.capturedAt, durationSeconds: item.durationSeconds })) }),
        });
        entries.push(...ready.map(({ item, index }, targetIndex) => ({ item, index, target: response.media[targetIndex] })));
      }
      entries.push(...await Promise.all(failed.map(async ({ item, index }) => ({ item, index, target: await api<UploadTarget>(`/media/${item.mediaId}/upload-url`, { method: "POST" }) }))));
      if (entries.length > 0 && !await uploadEntries(entries)) {
        setError("一部のアップロードに失敗しました。失敗した項目だけ再試行できます。"); setSaving(false); return;
      }
      await finishSave(caption);
    } catch (reason) { setError((reason as Error).message); setSaving(false); }
  };

  const photoCount = remainingMedia.filter((media) => media.kind === "image").length + files.filter((item) => item.file.type.startsWith("image/")).length;
  const videoCount = totalCount - photoCount;

  return <>
    <PageHeader title="投稿を編集" back />
    <main className="form-page page-content"><form className="form-stack" onSubmit={submit}>
      <section className="photo-picker"><div className="selected-photos">
        {remainingMedia.map((media) => <div className="selected-photo" key={media.id}><img src={media.thumbnailUrl} alt="" />{media.kind === "video" && <span className="video-badge">動画</span>}<button type="button" onClick={() => setRemovedMediaIds((current) => [...current, media.id])} aria-label={`${media.originalFilename}を削除`} disabled={saving}><X /></button></div>)}
        {files.map((item, index) => <div className={`selected-photo ${item.status}`} key={`${item.file.name}-${item.file.lastModified}-${index}`}><img src={item.previewUrl} alt="" />{item.file.type.startsWith("video/") && <span className="video-badge">動画</span>}{item.status === "failed" && <span className="failed-badge"><AlertCircle /></span>}<button type="button" onClick={() => void removeNewFile(index)} aria-label={`${item.file.name}を外す`} disabled={saving}><X /></button></div>)}
        {totalCount < 30 && <label className="photo-add"><ImagePlus /><span>写真・動画を追加</span><input type="file" accept={acceptedMediaTypes} multiple onChange={selectFiles} disabled={saving || preparing} /></label>}
      </div><p className="selection-count">{[photoCount ? `写真${photoCount}枚` : "", videoCount ? `動画${videoCount}本` : ""].filter(Boolean).join(" · ")}</p></section>
      <label>イベント<select value={eventId} onChange={(event) => { setEventId(event.target.value); setSceneId(""); setScenes([]); setShowSceneForm(false); }} disabled={saving}><option value="">イベントなし</option>{events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      {eventId && <label>シーン<select value={sceneId} onChange={(event) => setSceneId(event.target.value)} disabled={saving}><option value="">シーンなし</option>{scenes.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>}
      {eventId && (!showSceneForm ? <button className="text-button inline-action" type="button" onClick={() => setShowSceneForm(true)}><Plus />新しいシーン</button> : <div className="inline-form"><input value={newScene} onChange={(event) => setNewScene(event.target.value)} placeholder="例: 2日目・プレゼント" maxLength={100} /><button type="button" className="outline-button" onClick={createScene}>作成</button></div>)}
      <label>ひとこと（任意）<textarea name="caption" rows={4} maxLength={2000} defaultValue={post.caption} disabled={saving} /></label>
      {preparing && <p className="muted" role="status">画像を準備中…</p>}
      {saving && progress > 0 && <div className="upload-progress" role="status"><div><span>{progress === 100 ? "処理中" : "アップロード中"}</span><strong>{progress}%</strong></div><progress value={progress} max={100} /></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className={files.some((item) => item.status === "failed") ? "outline-button wide" : "primary-button wide"} disabled={saving || preparing}>{files.some((item) => item.status === "failed") && <RotateCcw />}{saving ? "保存中…" : files.some((item) => item.status === "failed") ? "失敗した項目を再試行" : "変更を保存"}</button>
    </form></main>
  </>;
}
