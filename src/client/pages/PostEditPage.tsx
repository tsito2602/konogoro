import { AlertCircle, GripVertical, ImagePlus, LoaderCircle, Plus, RotateCcw, Video, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { EventDetail, EventScene, EventSummary, Post, UploadTarget } from "../../shared/types";
import { api } from "../api";
import { ErrorState } from "../components/AsyncState";
import { MediaProcessingStatus } from "../components/MediaProcessingStatus";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { useToast } from "../components/Toast";
import { moveMediaItem } from "../media-order";
import {
  acceptedMediaTypes,
  createPendingMediaFile,
  prepareMediaFiles,
  uploadFile,
  validateMediaFiles,
  type SelectedMediaFile,
} from "../media-upload";

type OrderedMedia = { type: "existing"; media: Post["media"][number] } | { type: "new"; file: SelectedMediaFile };

export function PostEditPage() {
  const { postId = "" } = useParams();
  const location = useLocation();
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
  const [mediaOrder, setMediaOrder] = useState<string[]>([]);
  const [draggedMediaId, setDraggedMediaId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const filesRef = useRef(files);
  const draggedMediaIdRef = useRef<string | null>(null);
  const dragTargetMediaIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  const load = () => {
    setError("");
    void Promise.all([api<Post>(`/posts/${postId}`), api<{ events: EventSummary[] }>("/events")])
      .then(([result, eventResult]) => {
        setPost(result);
        setEvents(eventResult.events);
        setEventId(result.eventId ?? "");
        setSceneId(result.sceneId ?? "");
        setMediaOrder(result.media.map((media) => media.id));
      })
      .catch((reason: Error) => setError(reason.message));
  };

  useEffect(() => {
    void Promise.all([api<Post>(`/posts/${postId}`), api<{ events: EventSummary[] }>("/events")])
      .then(([result, eventResult]) => {
        setPost(result);
        setEvents(eventResult.events);
        setEventId(result.eventId ?? "");
        setSceneId(result.sceneId ?? "");
        setMediaOrder(result.media.map((media) => media.id));
      })
      .catch((reason: Error) => setError(reason.message));
  }, [postId]);
  useEffect(() => {
    if (!eventId) return;
    void api<EventDetail>(`/events/${eventId}`)
      .then((event) => setScenes(event.scenes))
      .catch((reason: Error) => setError(reason.message));
  }, [eventId]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      filesRef.current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    };
  }, []);

  if (!post && !error)
    return (
      <>
        <PageHeader title="投稿を編集" back />
        <PageSkeleton variant="form" />
      </>
    );
  if (!post)
    return (
      <>
        <PageHeader title="投稿を編集" back />
        <ErrorState message={error} retry={load} />
      </>
    );

  const remainingMedia = post.media.filter((media) => !removedMediaIds.includes(media.id));
  const totalCount = remainingMedia.length + files.length;
  const updateFile = (index: number, values: Partial<SelectedMediaFile>) =>
    setFiles((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...values } : item)));

  const applyPreparedFile = (prepared: SelectedMediaFile) => {
    if (!mountedRef.current) {
      URL.revokeObjectURL(prepared.previewUrl);
      return;
    }
    setFiles((current) => {
      if (!current.some((item) => item.id === prepared.id)) {
        URL.revokeObjectURL(prepared.previewUrl);
        return current;
      }
      return current.map((item) => (item.id === prepared.id ? prepared : item));
    });
    if (prepared.status === "preparation-failed") {
      setError("準備できなかった項目があります。写真・動画の上から再試行してください。");
    }
  };

  const selectFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(event.target.files ?? []);
    event.target.value = "";
    const validationError = validateMediaFiles(chosen, totalCount);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    const selected = chosen.map(createPendingMediaFile);
    setFiles((current) => [...current, ...selected]);
    setMediaOrder((current) => [...current, ...selected.map((item) => item.id)]);
    await prepareMediaFiles(selected, applyPreparedFile);
  };

  const retryPreparation = async (id: string) => {
    const item = files.find((file) => file.id === id);
    if (!item) return;
    const pending = { ...item, status: "preparing" as const };
    setError("");
    setFiles((current) => current.map((file) => (file.id === id ? pending : file)));
    await prepareMediaFiles([pending], applyPreparedFile, 1);
  };

  const removeNewFile = async (id: string) => {
    const item = files.find((file) => file.id === id);
    if (!item) return;
    if (item.mediaId) {
      try {
        await api(`/posts/${post.id}/media/${item.mediaId}`, { method: "DELETE" });
      } catch (reason) {
        setError((reason as Error).message);
        return;
      }
    }
    URL.revokeObjectURL(item.previewUrl);
    setFiles((current) => current.filter((file) => file.id !== id));
    setMediaOrder((current) => current.filter((mediaId) => mediaId !== id));
  };

  const removeExistingMedia = (id: string) => {
    setRemovedMediaIds((current) => [...current, id]);
    setMediaOrder((current) => current.filter((mediaId) => mediaId !== id));
  };

  const reorderMedia = (targetId: string) => {
    const sourceId = draggedMediaIdRef.current;
    if (!sourceId || sourceId === targetId) return;
    setMediaOrder((current) => moveMediaItem(current, sourceId, targetId));
  };

  const moveMediaByOffset = (id: string, offset: number) => {
    setMediaOrder((current) => {
      const index = current.indexOf(id);
      const targetId = current[index + offset];
      return targetId ? moveMediaItem(current, id, targetId) : current;
    });
  };

  const startMediaDrag = (id: string) => {
    draggedMediaIdRef.current = id;
    dragTargetMediaIdRef.current = id;
    setDraggedMediaId(id);
  };

  const finishMediaDrag = () => {
    draggedMediaIdRef.current = null;
    dragTargetMediaIdRef.current = null;
    setDraggedMediaId(null);
  };

  const movePointerMedia = (event: ReactPointerEvent<HTMLElement>) => {
    const targetId = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-media-id]")
      ?.dataset.mediaId;
    if (targetId) dragTargetMediaIdRef.current = targetId;
  };

  const createScene = async () => {
    if (!eventId || !newScene.trim()) return;
    try {
      const scene = await api<EventScene>(`/events/${eventId}/scenes`, {
        method: "POST",
        body: JSON.stringify({ title: newScene }),
      });
      setScenes((current) => [...current, scene]);
      setSceneId(scene.id);
      setNewScene("");
      setShowSceneForm(false);
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  const uploadEntries = async (entries: Array<{ item: SelectedMediaFile; index: number; target: UploadTarget }>) => {
    const totalBytes = entries.reduce(
      (total, { item, target }) =>
        total +
        item.file.size +
        (item.thumbnail?.size ?? 0) +
        (target.previewUploadUrl && item.optimizedPreview ? item.optimizedPreview.size : 0),
      0,
    );
    const loadedByRequest = new Map<string, number>();
    let loadedBytes = 0;
    let nextEntry = 0;
    let failed = false;
    const reportProgress = (key: string, loaded: number) => {
      const previous = loadedByRequest.get(key) ?? 0;
      loadedByRequest.set(key, loaded);
      loadedBytes += loaded - previous;
      setProgress(Math.round((loadedBytes / totalBytes) * 100));
    };
    await Promise.all(
      Array.from({ length: Math.min(2, entries.length) }, async () => {
        while (nextEntry < entries.length) {
          const { item, index, target } = entries[nextEntry++];
          const thumbnail = item.thumbnail;
          if (!thumbnail) {
            failed = true;
            updateFile(index, { status: "preparation-failed" });
            continue;
          }
          updateFile(index, { status: "uploading", mediaId: target.id });
          try {
            await Promise.all([
              uploadFile(target.uploadUrl, item.file, item.file.type, (loaded) =>
                reportProgress(`${index}:original`, loaded),
              ),
              uploadFile(target.thumbnailUploadUrl, thumbnail, "image/webp", (loaded) =>
                reportProgress(`${index}:thumbnail`, loaded),
              ),
              ...(target.previewUploadUrl && item.optimizedPreview
                ? [
                    uploadFile(target.previewUploadUrl, item.optimizedPreview, "image/webp", (loaded) =>
                      reportProgress(`${index}:preview`, loaded),
                    ),
                  ]
                : []),
            ]);
            await api(`/media/${target.id}/complete`, {
              method: "POST",
              body: JSON.stringify({ width: item.width, height: item.height }),
            });
            updateFile(index, { status: "uploaded", mediaId: target.id });
          } catch {
            failed = true;
            updateFile(index, { status: "failed", mediaId: target.id });
            await api(`/media/${target.id}/failed`, { method: "POST" }).catch(() => undefined);
          }
        }
      }),
    );
    return !failed;
  };

  const finishSave = async (caption: FormDataEntryValue | null, mediaIds: string[]) => {
    await api(`/posts/${post.id}`, {
      method: "PUT",
      body: JSON.stringify({ caption, eventId: eventId || null, sceneId: sceneId || null, mediaIds }),
    });
    for (const mediaId of removedMediaIds) await api(`/posts/${post.id}/media/${mediaId}`, { method: "DELETE" });
    showToast("投稿を更新しました");
    navigate(`/posts/${post.id}`, { replace: true, state: location.state });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (totalCount === 0) {
      setError("写真・動画を1件以上残してください");
      return;
    }
    if (files.some((item) => item.status === "preparing" || item.status === "preparation-failed")) {
      setError("すべての写真・動画の準備が完了してから保存してください");
      return;
    }
    setSaving(true);
    setError("");
    setProgress(0);
    const caption = new FormData(event.currentTarget).get("caption");
    try {
      const ready = files.map((item, index) => ({ item, index })).filter(({ item }) => item.status === "ready");
      const failed = files
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.status === "failed" && item.mediaId);
      const entries: Array<{ item: SelectedMediaFile; index: number; target: UploadTarget }> = [];
      if (ready.length > 0) {
        const response = await api<{ media: UploadTarget[] }>(`/posts/${post.id}/media/upload-urls`, {
          method: "POST",
          body: JSON.stringify({
            replacingMediaIds: removedMediaIds,
            files: ready.map(({ item }) => ({
              filename: item.file.name,
              mimeType: item.file.type,
              byteSize: item.file.size,
              capturedAt: item.capturedAt,
              durationSeconds: item.durationSeconds,
            })),
          }),
        });
        entries.push(
          ...ready.map(({ item, index }, targetIndex) => ({ item, index, target: response.media[targetIndex] })),
        );
      }
      entries.push(
        ...(await Promise.all(
          failed.map(async ({ item, index }) => ({
            item,
            index,
            target: await api<UploadTarget>(`/media/${item.mediaId}/upload-url`, { method: "POST" }),
          })),
        )),
      );
      if (entries.length > 0 && !(await uploadEntries(entries))) {
        setError("一部のアップロードに失敗しました。失敗した項目だけ再試行できます。");
        setSaving(false);
        return;
      }
      const uploadedMediaIds = new Map(entries.map(({ item, target }) => [item.id, target.id]));
      const orderedMediaIds = mediaOrder.flatMap((id) => {
        if (post.media.some((media) => media.id === id)) return [id];
        const mediaId = uploadedMediaIds.get(id) ?? files.find((item) => item.id === id)?.mediaId;
        return mediaId ? [mediaId] : [];
      });
      await finishSave(caption, orderedMediaIds);
    } catch (reason) {
      setError((reason as Error).message);
      setSaving(false);
    }
  };

  const photoCount =
    remainingMedia.filter((media) => media.kind === "image").length +
    files.filter((item) => item.file.type.startsWith("image/")).length;
  const videoCount = totalCount - photoCount;
  const preparing = files.some((item) => item.status === "preparing");
  const hasPreparationFailure = files.some((item) => item.status === "preparation-failed");
  const orderedMedia = mediaOrder.flatMap<OrderedMedia>((id) => {
    const media = remainingMedia.find((item) => item.id === id);
    if (media) return [{ type: "existing" as const, media }];
    const file = files.find((item) => item.id === id);
    return file ? [{ type: "new" as const, file }] : [];
  });

  return (
    <>
      <PageHeader title="投稿を編集" back />
      <main className="form-page page-content">
        <form className="form-stack" onSubmit={submit}>
          <MediaProcessingStatus files={files} uploading={saving && files.length > 0} uploadProgress={progress} />
          <section className="photo-picker">
            <div
              className="selected-photos"
              onPointerMove={movePointerMedia}
              onPointerUp={() => {
                if (dragTargetMediaIdRef.current) reorderMedia(dragTargetMediaIdRef.current);
                finishMediaDrag();
              }}
              onPointerCancel={finishMediaDrag}
            >
              {orderedMedia.map((entry) => {
                const id = entry.type === "existing" ? entry.media.id : entry.file.id;
                const filename = entry.type === "existing" ? entry.media.originalFilename : entry.file.file.name;
                return (
                  <div
                    className={`selected-photo${entry.type === "new" ? ` ${entry.file.status}` : ""}${
                      draggedMediaId === id ? " dragging" : ""
                    }`}
                    data-media-id={id}
                    key={id}
                  >
                    {entry.type === "existing" ? (
                      <>
                        <img src={entry.media.thumbnailUrl} alt="" draggable={false} />
                        {entry.media.kind === "video" && <span className="video-badge">動画</span>}
                        <button
                          className="remove-selected-photo"
                          type="button"
                          onClick={() => removeExistingMedia(entry.media.id)}
                          aria-label={`${filename}を削除`}
                          disabled={saving}
                        >
                          <X />
                        </button>
                      </>
                    ) : (
                      <>
                        {entry.file.file.type.startsWith("video/") && !entry.file.thumbnail ? (
                          <span className="video-preview-placeholder" aria-hidden="true">
                            <Video />
                          </span>
                        ) : (
                          <img src={entry.file.previewUrl} alt="" loading="lazy" decoding="async" draggable={false} />
                        )}
                        {entry.file.file.type.startsWith("video/") && <span className="video-badge">動画</span>}
                        {entry.file.status === "preparing" && (
                          <span className="preparing-badge" aria-label="準備中">
                            <LoaderCircle />
                          </span>
                        )}
                        {entry.file.status === "preparation-failed" && (
                          <button
                            className="preparation-retry"
                            type="button"
                            onClick={() => void retryPreparation(entry.file.id)}
                          >
                            <RotateCcw />
                            再試行
                          </button>
                        )}
                        {entry.file.status === "failed" && (
                          <span className="failed-badge">
                            <AlertCircle />
                          </span>
                        )}
                        <button
                          className="remove-selected-photo"
                          type="button"
                          onClick={() => void removeNewFile(entry.file.id)}
                          aria-label={`${filename}を外す`}
                          disabled={saving}
                        >
                          <X />
                        </button>
                      </>
                    )}
                    <button
                      className="media-drag-handle"
                      type="button"
                      aria-label={`${filename}を並び替え`}
                      disabled={saving}
                      draggable={false}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startMediaDrag(id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                          event.preventDefault();
                          moveMediaByOffset(id, -1);
                        }
                        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                          event.preventDefault();
                          moveMediaByOffset(id, 1);
                        }
                      }}
                    >
                      <GripVertical />
                    </button>
                  </div>
                );
              })}
              {totalCount < 30 && (
                <label className="photo-add">
                  <ImagePlus />
                  <span>写真・動画を追加</span>
                  <input
                    type="file"
                    accept={acceptedMediaTypes}
                    multiple
                    onChange={selectFiles}
                    disabled={saving || preparing}
                  />
                </label>
              )}
            </div>
            <p className="selection-count">
              {[photoCount ? `写真${photoCount}枚` : "", videoCount ? `動画${videoCount}本` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>
          <label>
            イベント
            <select
              value={eventId}
              onChange={(event) => {
                setEventId(event.target.value);
                setSceneId("");
                setScenes([]);
                setShowSceneForm(false);
              }}
              disabled={saving}
            >
              <option value="">イベントなし</option>
              {events.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          {eventId && (
            <label>
              シーン
              <select value={sceneId} onChange={(event) => setSceneId(event.target.value)} disabled={saving}>
                <option value="">シーンなし</option>
                {scenes.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {eventId &&
            (!showSceneForm ? (
              <button className="text-button inline-action" type="button" onClick={() => setShowSceneForm(true)}>
                <Plus />
                新しいシーン
              </button>
            ) : (
              <div className="inline-form">
                <input
                  value={newScene}
                  onChange={(event) => setNewScene(event.target.value)}
                  placeholder="例: 2日目・プレゼント"
                  maxLength={100}
                />
                <button type="button" className="outline-button" onClick={createScene}>
                  作成
                </button>
              </div>
            ))}
          <label>
            ひとこと（任意）
            <textarea name="caption" rows={4} maxLength={2000} defaultValue={post.caption} disabled={saving} />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className={files.some((item) => item.status === "failed") ? "outline-button wide" : "primary-button wide"}
            disabled={saving || preparing || hasPreparationFailure}
          >
            {files.some((item) => item.status === "failed") && <RotateCcw />}
            {saving
              ? "保存中…"
              : files.some((item) => item.status === "failed")
                ? "失敗した項目を再試行"
                : "変更を保存"}
          </button>
        </form>
      </main>
    </>
  );
}
