import { useMediaReorder } from "../hooks/useMediaReorder";
import { SceneEditorList } from "../components/SceneEditorList";
import { PreparedVideoImport } from "../components/PreparedVideoImport";
import { uploadPreparedPlayback, type PreparedPlayback } from "../video-playback";
import { abortMultipartUpload } from "../multipart-upload";
import { removeMediaWithReconciliation } from "../remove-media";
import { uploadMissingParts } from "../upload-parts";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { VideoBadge } from "../components/VideoBadge";
import { AlertCircle, ImagePlus, LoaderCircle, Plus, RotateCcw, Video, X } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { EventDetail, EventScene, EventSummary, Post, UploadTarget } from "../../shared/types";
import { api as request } from "../api";
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

// Bound network waits so an interrupted connection returns to the retry controls.
const api = <T,>(path: string, init?: RequestInit) =>
  request<T>(path, {
    ...init,
    signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
  });

export function PostEditPage() {
  const { postId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const showToast = useToast();
  const [post, setPost] = useState<Post | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [scenes, setScenes] = useState<(EventScene & { isNew?: boolean })[]>([]);
  const [originalScenes, setOriginalScenes] = useState<EventScene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(true);
  const [scenesError, setScenesError] = useState("");
  const [sceneLoadAttempt, setSceneLoadAttempt] = useState(0);
  const scenesUnavailable = scenesLoading || !!scenesError;
  const scenesChanged = JSON.stringify(scenes) !== JSON.stringify(originalScenes);
  const [eventId, setEventId] = useState("");
  const [sceneId, setSceneId] = useState("");
  const [newScene, setNewScene] = useState("");
  const [showSceneForm, setShowSceneForm] = useState(false);
  const [removedMediaIds, setRemovedMediaIds] = useState<string[]>([]);
  const [files, setFiles] = useState<SelectedMediaFile[]>([]);
  const [mediaOrder, setMediaOrder] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importingPlayback, setImportingPlayback] = useState(false);
  const { gridRef, announcement } = useMediaReorder(mediaOrder, setMediaOrder, !post || saving || importingPlayback);
  const activeUploadRef = useRef<AbortController | null>(null);
  const [caption, setCaption] = useState<string | null>(null);
  const markSaved = useUnsavedChanges(
    !!post &&
      (files.length > 0 ||
        removedMediaIds.length > 0 ||
        !!newScene ||
        scenesChanged ||
        (caption !== null && caption !== post.caption) ||
        eventId !== (post.eventId ?? "") ||
        sceneId !== (post.sceneId ?? "") ||
        mediaOrder.join(",") !== post.media.map((item) => item.id).join(",")),
    saving,
    "未保存の入力は失われます。送信・削除・保存がすでに成功した変更は残ります。この画面を離れますか？",
  );
  const filesRef = useRef(files);
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
    let active = true;
    void api<EventDetail>(`/events/${eventId}`)
      .then((event) => {
        if (active) {
          setScenes(event.scenes);
          setOriginalScenes(event.scenes);
          setScenesLoading(false);
        }
      })
      .catch((reason: Error) => {
        if (active) {
          setScenesError(reason.message);
          setScenesLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [eventId, sceneLoadAttempt]);
  useEffect(() => {
    filesRef.current = files;
  }, [files]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeUploadRef.current?.abort();
      for (const file of filesRef.current) {
        if (file.mediaId && file.status !== "uploaded") {
          void abortMultipartUpload(file.mediaId).catch(() => undefined);
          void abortMultipartUpload(file.mediaId, "playback").catch(() => undefined);
        }
      }
      filesRef.current.forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    };
  }, []);

  if (!post && !error)
    return (
      <>
        <PageHeader title="投稿を編集" back />
        <PageSkeleton variant="post-edit" />
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

  const importPlayback = async (matches: Map<string, PreparedPlayback>) => {
    const selected = files
      .filter((item) => matches.has(item.id))
      .map((item) => ({
        ...item,
        playback: matches.get(item.id),
        status: "preparing" as const,
      }));
    setFiles((current) => current.map((item) => selected.find((selected) => selected.id === item.id) ?? item));
    await prepareMediaFiles(selected, applyPreparedFile, 1);
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
        await Promise.all([abortMultipartUpload(item.mediaId), abortMultipartUpload(item.mediaId, "playback")]);
        await removeMediaWithReconciliation(
          [item.mediaId],
          async () => (await api<Post>(`/posts/${post.id}`)).media.map((media) => media.id),
          (mediaId) => api(`/posts/${post.id}/media/${mediaId}`, { method: "DELETE" }),
        );
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

  const moveMediaByOffset = (id: string, offset: number) => {
    setMediaOrder((current) => {
      const index = current.indexOf(id);
      const targetId = current[index + offset];
      return targetId ? moveMediaItem(current, id, targetId) : current;
    });
  };

  const createScene = () => {
    if (!eventId || !newScene.trim() || scenesUnavailable || scenes.length >= 100) return;
    const id = crypto.randomUUID();
    setScenes((current) => [...current, { id, title: newScene.trim(), sortOrder: current.length, isNew: true }]);
    setSceneId(id);
    setNewScene("");
    setShowSceneForm(false);
  };

  const uploadEntries = async (entries: Array<{ item: SelectedMediaFile; index: number; target: UploadTarget }>) => {
    const controller = new AbortController();
    activeUploadRef.current = controller;
    const signal = controller.signal;
    const totalBytes = entries.reduce(
      (total, { item, target }) =>
        total +
        item.file.size +
        (item.playback?.file.size ?? 0) +
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
          if (signal.aborted) {
            failed = true;
            updateFile(index, { status: "failed", mediaId: target.id });
            await api(`/media/${target.id}/failed`, { method: "POST" }).catch(() => undefined);
            continue;
          }
          if (target.alreadyUploaded) {
            updateFile(index, { status: "uploaded", mediaId: target.id });
            reportProgress(
              `${index}:complete`,
              item.file.size +
                (item.thumbnail?.size ?? 0) +
                (item.optimizedPreview?.size ?? 0) +
                (item.playback?.file.size ?? 0),
            );
            continue;
          }
          const thumbnail = item.thumbnail;
          if (!thumbnail) {
            failed = true;
            updateFile(index, { status: "preparation-failed" });
            continue;
          }
          updateFile(index, { status: "uploading", mediaId: target.id });
          try {
            for (const part of item.completedParts ?? []) {
              const size =
                part === "original"
                  ? item.file.size
                  : part === "thumbnail"
                    ? thumbnail.size
                    : (item.optimizedPreview?.size ?? 0);
              reportProgress(`${index}:${part}`, size);
            }
            await uploadMissingParts(
              [
                {
                  key: "original",
                  send: () =>
                    uploadFile(
                      target.uploadUrl,
                      item.file,
                      item.file.type,
                      (loaded) => reportProgress(`${index}:original`, loaded),
                      { mediaId: target.id, variant: "original", signal },
                    ),
                },
                {
                  key: "thumbnail",
                  send: () =>
                    uploadFile(
                      target.thumbnailUploadUrl,
                      thumbnail,
                      "image/webp",
                      (loaded) => reportProgress(`${index}:thumbnail`, loaded),
                      { signal },
                    ),
                },
                ...(target.previewUploadUrl && item.optimizedPreview
                  ? [
                      {
                        key: "preview",
                        send: () =>
                          uploadFile(
                            target.previewUploadUrl!,
                            item.optimizedPreview!,
                            "image/webp",
                            (loaded) => reportProgress(`${index}:preview`, loaded),
                            { signal },
                          ),
                      },
                    ]
                  : []),
              ],
              item.completedParts ?? [],
              (completedParts) => updateFile(index, { completedParts }),
            );
            if (item.playback)
              await uploadPreparedPlayback(
                target.id,
                item.playback,
                (loaded) => reportProgress(`${index}:playback`, loaded),
                signal,
              );
            signal.throwIfAborted();
            await api(`/media/${target.id}/complete`, {
              method: "POST",
              body: JSON.stringify({ width: item.width, height: item.height }),
              signal,
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
    activeUploadRef.current = null;
    return !failed && !signal.aborted;
  };

  const finishSave = async (caption: FormDataEntryValue | null, mediaIds: string[]) => {
    await api(`/posts/${post.id}`, {
      method: "PUT",
      body: JSON.stringify({
        caption,
        eventId: eventId || null,
        sceneId: sceneId || null,
        mediaIds,
        ...(eventId && scenesChanged
          ? {
              scenes: scenes.map(({ id, title, isNew }) => ({ id, title, isNew })),
              deletedSceneIds: originalScenes
                .filter((original) => !scenes.some((scene) => scene.id === original.id))
                .map((scene) => scene.id),
            }
          : {}),
      }),
    });
    await removeMediaWithReconciliation(
      removedMediaIds,
      async () => (await api<Post>(`/posts/${post.id}`)).media.map((media) => media.id),
      (mediaId) => api(`/posts/${post.id}/media/${mediaId}`, { method: "DELETE" }),
    );
    markSaved();
    showToast("投稿を更新しました", { success: true });
    if ((location.state as { returnToDetail?: boolean } | null)?.returnToDetail) navigate(-1);
    else navigate(`/posts/${post.id}`, { replace: true, state: location.state });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (totalCount === 0) {
      setError("写真・動画を1件以上残してください");
      return;
    }
    if (
      importingPlayback ||
      files.some((item) => item.status === "preparing" || item.status === "preparation-failed")
    ) {
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
              requestId: item.requestId,
              filename: item.file.name,
              mimeType: item.file.type,
              byteSize: item.file.size,
              originalSha256: item.playback?.entry.original.sha256,
              capturedAt: item.capturedAt,
              durationSeconds: item.durationSeconds,
            })),
          }),
        });
        entries.push(
          ...ready.map(({ item, index }, targetIndex) => ({ item, index, target: response.media[targetIndex] })),
        );
      }
      // Keep allocated IDs even if renewing a different failed item fails.
      for (const { item, index, target } of entries)
        updateFile(index, { mediaId: target.id, status: "failed", completedParts: item.completedParts });
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
  const preparing = importingPlayback || files.some((item) => item.status === "preparing");
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
        <form className="form-stack post-edit-form" onSubmit={submit}>
          <MediaProcessingStatus files={files} uploading={saving && files.length > 0} uploadProgress={progress} />
          <PreparedVideoImport
            files={files}
            disabled={saving || preparing}
            onImport={importPlayback}
            onBusy={setImportingPlayback}
          />
          {saving && files.some((item) => item.status === "uploading") && (
            <button type="button" className="outline-button" onClick={() => activeUploadRef.current?.abort()}>
              送信を中断
            </button>
          )}
          <section className="photo-picker">
            <div className="selected-photos" ref={gridRef}>
              {orderedMedia.map((entry) => {
                const id = entry.type === "existing" ? entry.media.id : entry.file.id;
                const filename = entry.type === "existing" ? entry.media.originalFilename : entry.file.file.name;
                return (
                  <div
                    className={`selected-photo${entry.type === "new" ? ` ${entry.file.status}` : ""}`}
                    tabIndex={saving || importingPlayback ? -1 : 0}
                    aria-label={`${filename}。長押し、または矢印キーで並び替え`}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget || saving || importingPlayback) return;
                      if (["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"].includes(event.key)) {
                        event.preventDefault();
                        moveMediaByOffset(id, event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1);
                      }
                    }}
                    data-media-id={id}
                    key={id}
                  >
                    {entry.type === "existing" ? (
                      <>
                        <img src={entry.media.thumbnailUrl} alt="" draggable={false} />
                        {entry.media.kind === "video" && <VideoBadge durationSeconds={entry.media.durationSeconds} />}
                        <button
                          className="remove-selected-photo"
                          type="button"
                          onClick={() => removeExistingMedia(entry.media.id)}
                          aria-label={`${filename}を削除`}
                          disabled={saving || importingPlayback}
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
                        {entry.file.file.type.startsWith("video/") && (
                          <VideoBadge durationSeconds={entry.file.durationSeconds} />
                        )}
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
                          <span className="failed-badge" aria-label={`${filename}の送信に失敗`}>
                            <AlertCircle />
                            <small>送信失敗</small>
                          </span>
                        )}
                        {entry.file.status === "ready" && (
                          <span className="selected-upload-status">準備できました</span>
                        )}
                        {entry.file.status === "uploading" && <span className="selected-upload-status">送信中</span>}
                        {entry.file.status === "uploaded" && <span className="selected-upload-status">送信済み</span>}
                        <button
                          className="remove-selected-photo"
                          type="button"
                          onClick={() => void removeNewFile(entry.file.id)}
                          aria-label={`${filename}を外す`}
                          disabled={saving || importingPlayback}
                        >
                          <X />
                        </button>
                      </>
                    )}
                    <span className="selected-file-info" title={filename}>
                      {filename}
                    </span>
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
            <p className="muted media-reorder-hint">写真・動画を長押しして並び替え。</p>
            <span className="media-reorder-status" role="status">
              {announcement}
            </span>
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
                if (
                  (scenesChanged || !!newScene.trim()) &&
                  !confirm("見出しの未保存の変更を破棄してイベントを変更しますか？")
                )
                  return;
                setEventId(event.target.value);
                setSceneId("");
                setScenes([]);
                setOriginalScenes([]);
                setNewScene("");
                setScenesLoading(!!event.target.value);
                setScenesError("");
                setShowSceneForm(false);
              }}
              disabled={saving || importingPlayback}
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
              見出し
              <select
                value={sceneId}
                onChange={(event) => setSceneId(event.target.value)}
                disabled={saving || importingPlayback}
              >
                <option value="">見出しなし</option>
                {scenes.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          {eventId && (
            <section className="management-section">
              <p className="muted">名前と順序は同じイベントの投稿にも反映されます。変更は保存するまで確定しません。</p>
              {scenesError ? (
                <div role="alert">
                  <p className="form-error">{scenesError}</p>
                  <button
                    type="button"
                    className="outline-button"
                    onClick={() => {
                      setScenesError("");
                      setScenesLoading(true);
                      setSceneLoadAttempt((current) => current + 1);
                    }}
                  >
                    見出しの読み込みを再試行
                  </button>
                </div>
              ) : scenesLoading ? (
                <p role="status">見出しを読み込み中…</p>
              ) : (
                <SceneEditorList
                  key={eventId}
                  scenes={scenes}
                  disabled={saving || importingPlayback}
                  onOrder={(ids) =>
                    setScenes((current) => ids.flatMap((id) => current.filter((scene) => scene.id === id)))
                  }
                  onTitle={(id, title) =>
                    setScenes((current) => current.map((scene) => (scene.id === id ? { ...scene, title } : scene)))
                  }
                  onDelete={(id) => {
                    if (
                      !confirm(
                        "この見出しを削除しますか？関連する投稿は見出しなしになります。保存するまで削除は確定しません。",
                      )
                    )
                      return;
                    setScenes((current) => current.filter((scene) => scene.id !== id));
                    if (sceneId === id) setSceneId("");
                  }}
                />
              )}
            </section>
          )}
          {eventId &&
            (!showSceneForm ? (
              <button
                className="text-button inline-action"
                type="button"
                disabled={saving || importingPlayback || scenesUnavailable || scenes.length >= 100}
                onClick={() => setShowSceneForm(true)}
              >
                <Plus />
                新しい見出し
              </button>
            ) : (
              <div className="inline-form">
                <input
                  value={newScene}
                  onChange={(event) => setNewScene(event.target.value)}
                  placeholder="例: 2日目 午前（午後）"
                  maxLength={100}
                />
                <button
                  type="button"
                  className="outline-button"
                  disabled={saving || importingPlayback || scenesUnavailable || !newScene.trim()}
                  onClick={createScene}
                >
                  作成
                </button>
              </div>
            ))}
          <label>
            ひとこと（任意）
            <textarea
              name="caption"
              placeholder="行った場所、やったことなど"
              rows={4}
              maxLength={2000}
              value={caption ?? post.caption}
              onChange={(event) => setCaption(event.target.value)}
              disabled={saving || importingPlayback}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className={files.some((item) => item.status === "failed") ? "outline-button wide" : "primary-button wide"}
            disabled={
              saving ||
              preparing ||
              hasPreparationFailure ||
              (eventId !== "" && scenesUnavailable) ||
              scenes.some((scene) => !scene.title.trim())
            }
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
