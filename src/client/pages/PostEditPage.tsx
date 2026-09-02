import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EventDetail, EventSection, EventSummary, Post } from "../../shared/types";
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
  const [sections, setSections] = useState<EventSection[]>([]);
  const [eventId, setEventId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setError("");
    void Promise.all([api<Post>(`/posts/${postId}`), api<{ events: EventSummary[] }>("/events")])
      .then(([result, eventResult]) => {
        setPost(result); setEvents(eventResult.events); setEventId(result.eventId ?? ""); setSectionId(result.sectionId ?? "");
      })
      .catch((reason: Error) => setError(reason.message));
  };

  useEffect(() => {
    void Promise.all([api<Post>(`/posts/${postId}`), api<{ events: EventSummary[] }>("/events")])
      .then(([result, eventResult]) => {
        setPost(result); setEvents(eventResult.events); setEventId(result.eventId ?? ""); setSectionId(result.sectionId ?? "");
      })
      .catch((reason: Error) => setError(reason.message));
  }, [postId]);

  useEffect(() => {
    if (!eventId) return;
    void api<EventDetail>(`/events/${eventId}`).then((event) => setSections(event.sections)).catch((reason: Error) => setError(reason.message));
  }, [eventId]);

  if (!post && !error) return <><PageHeader title="投稿を編集" back /><Loading /></>;
  if (!post) return <><PageHeader title="投稿を編集" back /><ErrorState message={error} retry={load} /></>;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/posts/${post.id}`, { method: "PUT", body: JSON.stringify({ title: form.get("title"), caption: form.get("caption"), eventId: eventId || null, sectionId: sectionId || null }) });
      showToast("投稿を更新しました");
      navigate(`/posts/${post.id}`, { replace: true });
    } catch (reason) { setError((reason as Error).message); setSaving(false); }
  };

  return <>
    <PageHeader title="投稿を編集" back />
    <main className="form-page page-content"><form className="form-stack" onSubmit={submit}>
      <section className="post-edit-media" aria-label="投稿中の写真と動画">
        {post.media.map((media) => <div key={media.id}><img src={media.thumbnailUrl} alt="" />{media.kind === "video" && <span aria-hidden>▶</span>}</div>)}
      </section>
      <p className="muted post-edit-media-note">写真・動画はそのまま保持される。</p>
      <label>イベント<select value={eventId} onChange={(event) => { setEventId(event.target.value); setSectionId(""); setSections([]); }} disabled={saving}><option value="">イベントなし</option>{events.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      {eventId && <label>セクション<select value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={saving}><option value="">セクションなし</option>{sections.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>}
      <label>投稿タイトル<input name="title" required maxLength={120} defaultValue={post.title} disabled={saving} /></label>
      <label>キャプション<textarea name="caption" rows={4} maxLength={2000} defaultValue={post.caption} disabled={saving} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-button wide" disabled={saving}>{saving ? "保存中…" : "変更を保存"}</button>
    </form></main>
  </>;
}
