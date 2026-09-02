import { Plus, Trash2, Video } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { EventCoverMedia, EventDetail, EventSection } from "../../shared/types";
import { api } from "../api";
import { ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";

export function EventEditPage() {
  const { eventId = "" } = useParams();
  const navigate = useNavigate();
  const showToast = useToast();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [media, setMedia] = useState<EventCoverMedia[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => {
    setError("");
    return Promise.all([
      api<EventDetail>(`/events/${eventId}`),
      api<{ media: EventCoverMedia[] }>(`/events/${eventId}/cover-media`),
    ]).then(([event, cover]) => { setDetail(event); setMedia(cover.media); }).catch((reason: Error) => setError(reason.message));
  }, [eventId]);
  useEffect(() => {
    void Promise.all([
      api<EventDetail>(`/events/${eventId}`),
      api<{ media: EventCoverMedia[] }>(`/events/${eventId}/cover-media`),
    ]).then(([event, cover]) => { setDetail(event); setMedia(cover.media); }).catch((reason: Error) => setError(reason.message));
  }, [eventId]);

  if (!detail && !error) return <><PageHeader title="イベントを編集" back /><Loading /></>;
  if (!detail) return <><PageHeader title="イベントを編集" back /><ErrorState message={error} retry={() => void load()} /></>;

  const saveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api(`/events/${eventId}`, { method: "PUT", body: JSON.stringify({ title: data.get("title"), description: data.get("description"), startDate: data.get("startDate") || null, endDate: data.get("endDate") || null }) });
      showToast("イベントを更新しました");
      navigate(`/events/${eventId}`);
    } catch (reason) { setError((reason as Error).message); setSaving(false); }
  };

  const addSection = async (form: HTMLFormElement) => {
    const title = new FormData(form).get("title");
    try {
      const section = await api<EventSection>(`/events/${eventId}/sections`, { method: "POST", body: JSON.stringify({ title }) });
      setDetail({ ...detail, sections: [...detail.sections, section] }); form.reset();
    } catch (reason) { setError((reason as Error).message); }
  };

  const renameSection = async (section: EventSection, title: string) => {
    try {
      await api(`/events/${eventId}/sections/${section.id}`, { method: "PUT", body: JSON.stringify({ title }) });
      setDetail({ ...detail, sections: detail.sections.map((item) => item.id === section.id ? { ...item, title } : item) });
    } catch (reason) { setError((reason as Error).message); }
  };

  const deleteSection = async (section: EventSection) => {
    if (!confirm(`「${section.title}」を削除しますか？`)) return;
    try {
      await api(`/events/${eventId}/sections/${section.id}`, { method: "DELETE" });
      setDetail({ ...detail, sections: detail.sections.filter((item) => item.id !== section.id) });
    } catch (reason) { setError((reason as Error).message); }
  };

  const selectCover = async (mediaId: string | null) => {
    try {
      await api(`/events/${eventId}/cover`, { method: "PUT", body: JSON.stringify({ mediaId }) });
      await load();
    } catch (reason) { setError((reason as Error).message); }
  };

  const deleteEvent = async () => {
    if (!confirm(`「${detail.title}」を削除しますか？投稿はイベントなしになります。`)) return;
    try { await api(`/events/${eventId}`, { method: "DELETE" }); showToast("イベントを削除しました"); navigate("/events", { replace: true }); }
    catch (reason) { setError((reason as Error).message); }
  };

  return <>
    <PageHeader title="イベントを編集" back />
    <main className="form-page page-content event-edit">
      <form onSubmit={saveEvent} className="form-stack">
        <label>タイトル<input name="title" required maxLength={100} defaultValue={detail.title} /></label>
        <div className="date-row"><label>開始日<input name="startDate" type="date" defaultValue={detail.startDate ?? ""} /></label><label>終了日<input name="endDate" type="date" defaultValue={detail.endDate ?? ""} /></label></div>
        <label>メモ<textarea name="description" rows={4} maxLength={1000} defaultValue={detail.description} /></label>
        <button className="primary-button wide" disabled={saving}>{saving ? "保存中…" : "変更を保存"}</button>
      </form>

      <section className="management-section"><h2>セクション</h2>
        {detail.sections.map((section) => <div className="section-editor" key={section.id}>
          <input aria-label={`${section.title}の名前`} defaultValue={section.title} onBlur={(event) => { const title = event.target.value.trim(); if (title && title !== section.title) void renameSection(section, title); }} maxLength={100} />
          <button className="icon-button" type="button" aria-label={`${section.title}を削除`} onClick={() => void deleteSection(section)}><Trash2 /></button>
        </div>)}
        <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void addSection(event.currentTarget); }}><input name="title" required maxLength={100} placeholder="新しいセクション" /><button className="outline-button"><Plus />追加</button></form>
      </section>

      <section className="management-section"><div className="section-heading"><h2>カバー</h2><button className="text-button" type="button" onClick={() => void selectCover(null)}>自動選択に戻す</button></div>
        {media.length === 0 ? <p className="muted">カバーに使えるMediaがない</p> : <div className="cover-grid">{media.map((item) => <button type="button" key={item.id} onClick={() => void selectCover(item.id)}><img src={item.thumbnailUrl} alt="" />{item.kind === "video" && <span><Video /></span>}</button>)}</div>}
        <p className="muted">現在: {detail.coverSource === "manual" ? "手動選択" : "自動選択"}</p>
      </section>

      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="management-section danger-zone"><h2>イベントを削除</h2><p>投稿やMediaは削除されず、イベントとの関連だけが解除される。</p><button className="danger-button" type="button" onClick={() => void deleteEvent()}>イベントを削除</button></section>
    </main>
  </>;
}
