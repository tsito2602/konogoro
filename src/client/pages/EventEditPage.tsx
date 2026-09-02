import { Plus, Trash2, Video } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EventCoverMedia, EventDetail } from "../../shared/types";
import { api } from "../api";
import { ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";

type EditableScene = { key: string; id?: string; title: string };

export function EventEditPage() {
  const { eventId = "" } = useParams();
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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const applyDetail = (event: EventDetail, cover: { media: EventCoverMedia[] }) => {
    setDetail(event);
    setMedia(cover.media);
    setTitle(event.title);
    setDescription(event.description);
    setStartDate(event.startDate ?? "");
    setEndDate(event.endDate ?? "");
    setScenes(event.scenes.map((scene) => ({ key: scene.id, id: scene.id, title: scene.title })));
    setCoverMediaId(event.coverSource === "manual" ? event.coverMediaId : null);
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
        <Loading />
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
    coverMediaId !== originalCoverMediaId;

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
        }),
      });
      showToast("イベントを更新しました");
      navigate(`/events/${eventId}`);
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
    if (!confirm(`「${scene.title}」を削除しますか？変更を保存するまで削除は確定しません。`)) return;
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
          <h2>シーン</h2>
          {scenes.map((scene) => (
            <div className="scene-editor" key={scene.key}>
              <input
                aria-label={`${scene.title}の名前`}
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
                aria-label={`${scene.title}を削除`}
                onClick={() => deleteScene(scene)}
                disabled={saving}
              >
                <Trash2 />
              </button>
            </div>
          ))}
          <form className="inline-form" onSubmit={addScene}>
            <input
              value={newSceneTitle}
              onChange={(event) => setNewSceneTitle(event.target.value)}
              required
              maxLength={100}
              placeholder="新しいシーン"
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
              onClick={() => setCoverMediaId(null)}
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
                  onClick={() => setCoverMediaId(item.id)}
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
