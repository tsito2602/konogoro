import { Plus, Trash2, Video } from "lucide-react";
import { useCallback, useEffect, useState, useRef, type FormEvent } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import type { EventCoverMedia, EventDetail } from "../../shared/types";
import { api } from "../api";
import { ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { useToast } from "../components/Toast";
import { moveItemByOffset, useSceneReorder } from "../hooks/useMediaReorder";

type EditableScene = { key: string; id?: string; title: string };

export function EventEditPage() {
  const { eventId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const showToast = useToast();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [media, setMedia] = useState<EventCoverMedia[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [scenes, setScenes] = useState<EditableScene[]>([]);
  const [newSceneTitle, setNewSceneTitle] = useState("");
  const [coverMediaId, setCoverMediaId] = useState<string | null>(null);
  const coverDrag = useRef<{ x: number; y: number; position: { x: number; y: number } } | null>(null);
  const [coverPosition, setCoverPosition] = useState({ x: 50, y: 50 });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const { gridRef: sceneListRef, announcement: sceneAnnouncement } = useSceneReorder(
    scenes.map((scene) => scene.key),
    (order) =>
      setScenes((current) =>
        order.flatMap((key) => {
          const scene = current.find((item) => item.key === key);
          return scene ? [scene] : [];
        }),
      ),
    saving,
  );

  const applyDetail = (event: EventDetail, cover: { media: EventCoverMedia[] }) => {
    setDetail(event);
    setMedia(cover.media);
    setTitle(event.title);
    setDescription(event.description);
    setStartDate(event.startDate ?? "");
    setEndDate(event.endDate ?? "");
    setScenes(event.scenes.map((scene) => ({ key: scene.id, id: scene.id, title: scene.title })));
    setCoverMediaId(event.coverSource === "manual" ? event.coverMediaId : null);
    setCoverPosition(event.coverPosition ?? { x: 50, y: 50 });
  };
  const load = useCallback(() => {
    setError("");
    return Promise.all([
      api<EventDetail>(`/events/${eventId}`),
      api<{ media: EventCoverMedia[] }>(`/events/${eventId}/cover-media`),
    ])
      .then(([event, cover]) => applyDetail(event, cover))
      .catch((reason: Error) => setError(reason.message));
  }, [eventId]);
  useEffect(() => {
    void Promise.all([
      api<EventDetail>(`/events/${eventId}`),
      api<{ media: EventCoverMedia[] }>(`/events/${eventId}/cover-media`),
    ])
      .then(([event, cover]) => applyDetail(event, cover))
      .catch((reason: Error) => setError(reason.message));
  }, [eventId]);
  if (!detail && !error)
    return (
      <>
        <PageHeader title="イベントを編集" back />
        <PageSkeleton variant="event-edit" />
      </>
    );
  if (!detail)
    return (
      <>
        <PageHeader title="イベントを編集" back />
        <ErrorState message={error} retry={() => void load()} />
      </>
    );

  const originalCoverMediaId = detail.coverSource === "manual" ? detail.coverMediaId : null;
  const scenesChanged =
    scenes.length !== detail.scenes.length ||
    scenes.some((scene, index) => scene.id !== detail.scenes[index]?.id || scene.title !== detail.scenes[index]?.title);
  const hasChanges =
    title !== detail.title ||
    description !== detail.description ||
    startDate !== (detail.startDate ?? "") ||
    endDate !== (detail.endDate ?? "") ||
    scenesChanged ||
    coverMediaId !== originalCoverMediaId ||
    coverPosition.x !== (detail.coverPosition?.x ?? 50) ||
    coverPosition.y !== (detail.coverPosition?.y ?? 50);
  const automaticCover = media.find((item) => item.kind === "image") ?? media[0];
  const selectedCover = media.find((item) => item.id === coverMediaId) ?? automaticCover;

  const saveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api(`/events/${eventId}/manage`, {
        method: "PUT",
        body: JSON.stringify({
          event: { title, description, startDate: startDate || null, endDate: endDate || null },
          scenes: scenes.map((scene) => ({ id: scene.id, title: scene.title })),
          coverMediaId,
          coverPosition,
        }),
      });
      showToast("イベントを更新しました");
      if ((location.state as { returnToDetail?: boolean } | null)?.returnToDetail) navigate(-1);
      else navigate(`/events/${eventId}`, { replace: true });
    } catch (reason) {
      setError((reason as Error).message);
      setSaving(false);
    }
  };

  const addScene = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const sceneTitle = newSceneTitle.trim();
    if (!sceneTitle) return;
    setScenes((current) => [...current, { key: `new-${Date.now()}-${current.length}`, title: sceneTitle }]);
    setNewSceneTitle("");
  };

  const deleteScene = (scene: EditableScene) => {
    if (!confirm(`見出し「${scene.title}」を削除しますか？変更を保存するまで削除は確定しません。`)) return;
    setScenes((current) => current.filter((item) => item.key !== scene.key));
  };

  const deleteEvent = async () => {
    if (!confirm(`「${title}」を削除しますか？投稿はイベントなしになります。`)) return;
    try {
      await api(`/events/${eventId}`, { method: "DELETE" });
      showToast("イベントを削除しました");
      navigate("/events", { replace: true });
    } catch (reason) {
      setError((reason as Error).message);
    }
  };

  return (
    <>
      <PageHeader title="イベントを編集" back />
      <main className={`form-page page-content event-edit${hasChanges ? " has-save-bar" : ""}`}>
        <form id="event-edit-form" onSubmit={saveEvent} className="form-stack">
          <label>
            タイトル
            <input
              name="title"
              required
              maxLength={100}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={saving}
            />
          </label>
          <div className="date-row">
            <label>
              開始日
              <input
                name="startDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                disabled={saving}
              />
            </label>
            <label>
              終了日
              <input
                name="endDate"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={saving}
              />
            </label>
          </div>
          <label>
            メモ
            <textarea
              name="description"
              rows={4}
              maxLength={1000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
            />
          </label>
        </form>

        <section className="management-section">
          <h2>見出し</h2>
          <div className="scene-list" ref={sceneListRef}>
            {scenes.map((scene, index) => (
              <div
                className="scene-editor scene-editor-deletable"
                data-scene-id={scene.key}
                key={scene.key}
                tabIndex={saving ? -1 : 0}
                aria-label={`見出し「${scene.title}」。長押し、または上下矢印キーで並び替え`}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget || (event.key !== "ArrowUp" && event.key !== "ArrowDown"))
                    return;
                  event.preventDefault();
                  setScenes((current) => moveItemByOffset(current, index, event.key === "ArrowUp" ? -1 : 1));
                }}
              >
                <input
                  aria-label={`見出し「${scene.title}」の名前`}
                  value={scene.title}
                  onChange={(event) =>
                    setScenes((current) =>
                      current.map((item) => (item.key === scene.key ? { ...item, title: event.target.value } : item)),
                    )
                  }
                  maxLength={100}
                  disabled={saving}
                />
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`見出し「${scene.title}」を削除`}
                  onClick={() => deleteScene(scene)}
                  disabled={saving}
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
          <p className="muted scene-reorder-hint">
            見出しを長押しして並び替え。キーボードでは見出しを選んで上下矢印キー。
          </p>
          <span className="media-reorder-status" role="status" aria-live="polite">
            {sceneAnnouncement}
          </span>
          <form className="inline-form" onSubmit={addScene}>
            <input
              value={newSceneTitle}
              onChange={(event) => setNewSceneTitle(event.target.value)}
              required
              maxLength={100}
              placeholder="新しい見出し"
              disabled={saving}
            />
            <button className="outline-button" disabled={saving}>
              <Plus />
              追加
            </button>
          </form>
        </section>

        <section className="management-section">
          <div className="management-heading">
            <h2>カバー</h2>
            <button
              className={`text-button${coverMediaId === null ? " selected" : ""}`}
              type="button"
              onClick={() => {
                setCoverMediaId(null);
                setCoverPosition({ x: 50, y: 50 });
              }}
              disabled={saving}
            >
              自動選択
            </button>
          </div>
          {media.length === 0 ? (
            <p className="muted">カバーに使えるメディアがない</p>
          ) : (
            <div className="cover-grid">
              {media.map((item) => (
                <button
                  className={coverMediaId === item.id ? "selected" : ""}
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setCoverMediaId(item.id);
                    setCoverPosition({ x: 50, y: 50 });
                  }}
                  aria-label={`${item.kind === "video" ? "動画" : "写真"} ${media.indexOf(item) + 1}をカバーに選択`}
                  aria-pressed={coverMediaId === item.id}
                  disabled={saving}
                >
                  <img src={item.thumbnailUrl} alt="" />
                  {item.kind === "video" && (
                    <span>
                      <Video />
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          <p className="muted">選択中: {coverMediaId ? "手動選択" : "自動選択"}</p>
          {selectedCover && (
            <fieldset className="cover-position-editor" disabled={saving}>
              <legend>表示位置</legend>
              <p className="muted">
                一覧の写真をドラッグするか、左右・上下のつまみで表示位置を調整できます。つまみは矢印キーでも操作できます。
              </p>
              <div className="cover-previews">
                <figure>
                  <figcaption>一覧</figcaption>
                  <img
                    className="cover-preview-list"
                    draggable={false}
                    onPointerDown={(event) => {
                      if (saving) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      coverDrag.current = { x: event.clientX, y: event.clientY, position: coverPosition };
                    }}
                    onPointerMove={(event) => {
                      const drag = coverDrag.current;
                      if (!drag || saving) return;
                      const bounds = event.currentTarget.getBoundingClientRect();
                      setCoverMediaId(selectedCover.id);
                      setCoverPosition({
                        x: Math.round(
                          Math.max(0, Math.min(100, drag.position.x - ((event.clientX - drag.x) / bounds.width) * 100)),
                        ),
                        y: Math.round(
                          Math.max(
                            0,
                            Math.min(100, drag.position.y - ((event.clientY - drag.y) / bounds.height) * 100),
                          ),
                        ),
                      });
                    }}
                    onPointerUp={() => {
                      coverDrag.current = null;
                    }}
                    onPointerCancel={() => {
                      coverDrag.current = null;
                    }}
                    onLostPointerCapture={() => {
                      coverDrag.current = null;
                    }}
                    src={selectedCover.thumbnailUrl}
                    alt="一覧のカバープレビュー"
                    style={{ objectPosition: `${coverPosition.x}% ${coverPosition.y}%` }}
                  />
                </figure>
                <figure>
                  <figcaption>詳細（スマートフォン）</figcaption>
                  <img
                    className="cover-preview-detail"
                    src={selectedCover.thumbnailUrl}
                    alt="スマートフォンの詳細カバープレビュー"
                    style={{ objectPosition: `${coverPosition.x}% ${coverPosition.y}%` }}
                  />
                </figure>
                <figure>
                  <figcaption>詳細（PC）</figcaption>
                  <img
                    className="cover-preview-desktop"
                    src={selectedCover.thumbnailUrl}
                    alt="PCの詳細カバープレビュー"
                    style={{ objectPosition: `${coverPosition.x}% ${coverPosition.y}%` }}
                  />
                </figure>
              </div>
              {(["x", "y"] as const).map((axis) => (
                <label key={axis}>
                  {axis === "x" ? "左右" : "上下"}：{coverPosition[axis]}%
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={coverPosition[axis]}
                    onChange={(event) => {
                      setCoverMediaId(selectedCover.id);
                      setCoverPosition((current) => ({ ...current, [axis]: Number(event.target.value) }));
                    }}
                  />
                </label>
              ))}
              <button type="button" className="text-button" onClick={() => setCoverPosition({ x: 50, y: 50 })}>
                中央に戻す
              </button>
              <p className="muted">変更を保存すると一覧と詳細へ反映されます。画面幅により切り抜く範囲は変わります。</p>
            </fieldset>
          )}
        </section>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className={`change-save-bar${hasChanges ? " visible" : ""}`} aria-hidden={!hasChanges}>
          <button
            className="primary-button wide"
            type="submit"
            form="event-edit-form"
            disabled={saving || !title.trim() || scenes.some((scene) => !scene.title.trim())}
          >
            {saving ? "保存中…" : "変更を保存"}
          </button>
        </div>
        <section className="management-section danger-zone">
          <h2>イベントを削除</h2>
          <p>投稿やメディアは削除されず、イベントとの関連だけが解除される。</p>
          <button className="danger-button" type="button" onClick={() => void deleteEvent()} disabled={saving}>
            イベントを削除
          </button>
        </section>
      </main>
    </>
  );
}
