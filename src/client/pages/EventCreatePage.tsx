import { EventDraftPreview } from "../components/EventDraftPreview";
import { DateRangePicker } from "../components/DateRangePicker";
import { useUnsavedChanges } from "../hooks/useUnsavedChanges";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";

export function EventCreatePage() {
  const navigate = useNavigate();
  const showToast = useToast();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ title: "", startDate: "", endDate: "", description: "" });
  const markSaved = useUnsavedChanges(Object.values(draft).some(Boolean), saving);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const result = await api<{ id: string }>("/events", {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          description: data.get("description"),
          startDate: data.get("startDate") || null,
          endDate: data.get("endDate") || null,
        }),
      });
      markSaved();
      showToast("イベントを作成しました", { success: true });
      navigate(`/events/${result.id}`, { replace: true });
    } catch (reason) {
      setError((reason as Error).message);
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader title="イベントを作成" back />
      <main className="form-page page-content event-create">
        <EventDraftPreview {...draft} />
        <form onSubmit={submit} className="form-stack">
          <label>
            タイトル
            <input
              name="title"
              value={draft.title}
              disabled={saving}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              required
              maxLength={100}
              autoFocus
            />
          </label>
          <DateRangePicker
            startDate={draft.startDate}
            endDate={draft.endDate}
            disabled={saving}
            onChange={(range) => setDraft((current) => ({ ...current, ...range }))}
          />
          <label>
            メモ
            <textarea
              name="description"
              value={draft.description}
              disabled={saving}
              onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
              rows={4}
              maxLength={1000}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary-button wide" disabled={saving}>
            {saving ? "作成中…" : "作成"}
          </button>
        </form>
      </main>
    </>
  );
}
