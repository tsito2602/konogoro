import { Plus } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EventDetail, EventScene, EventSummary, Post } from "../../shared/types";
import { api } from "../api";
import { ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";

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
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

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

  if (!post && !error) return <><PageHeader title="投稿を編集" back /><Loading /></>;
  if (!post) return <><PageHeader title="投稿を編集" back /><ErrorState message={error} retry={load} /></>;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/posts/${post.id}`, { method: "PUT", body: JSON.stringify({ caption: form.get("caption"), eventId: eventId || null, sceneId: sceneId || null }) });
      showToast("投稿を更新しました");
      navigate(`/posts/${post.id}`, { replace: true });
    } catch (reason) { setError((reason as Error).message); setSaving(false); }
  };

  const createScene = async () => {
    if (!eventId || !newScene.trim()) return;
    try {
      const scene = await api<EventScene>(`/events/${eventId}/scenes`, { method: "POST", body: JSON.stringify({ title: newScene }) });
      setScenes((current) => [...current, scene]); setSceneId(scene.id); setNewScene(""); setShowSceneForm(false);
    } catch (reason) { setError((reason as Error).message); }
  };

  return <>
    <PageHeader title="投稿を編集" back />
    <main className="form-page page-content"><form className="form-stack" onSubmit={submit}>
      <section className="post-edit-media" aria-label="投稿中の写真と動画">
        {post.media.map((media) => <div key={media.id}><img src={media.thumbnailUrl} alt="" />{media.kind === "video" && <span aria-hidden>▶</span>}</div>)}
      </section>
      <p className="muted post-edit-media-note">写真・動画はそのまま保持される。</p>
      <label>イベント<select value={eventId} onChange={(event) => { setEventId(event.target.value); setSceneId(""); setScenes([]); setShowSceneForm(false); }} disabled={saving}><option value="">イベントなし</option>{events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      {eventId && <label>シーン<select value={sceneId} onChange={(event) => setSceneId(event.target.value)} disabled={saving}><option value="">シーンなし</option>{scenes.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>}
      {eventId && (!showSceneForm ? <button className="text-button inline-action" type="button" onClick={() => setShowSceneForm(true)}><Plus />新しいシーン</button> : <div className="inline-form"><input value={newScene} onChange={(event) => setNewScene(event.target.value)} placeholder="例: 2日目・プレゼント" maxLength={100} /><button type="button" className="outline-button" onClick={createScene}>作成</button></div>)}
      <label>ひとこと（任意）<textarea name="caption" rows={4} maxLength={2000} defaultValue={post.caption} disabled={saving} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button wide" disabled={saving}>{saving ? "保存中…" : "変更を保存"}</button>
    </form></main>
  </>;
}
