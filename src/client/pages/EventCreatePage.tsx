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
      showToast("イベントを作成しました");
      navigate(`/events/${result.id}`, { replace: true });
    } catch (reason) {
      setError((reason as Error).message);
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader title="イベントを作成" back />
      <main className="form-page page-content">
        <form onSubmit={submit} className="form-stack">
          <label>
            タイトル
            <input name="title" required maxLength={100} autoFocus />
          </label>
          <div className="date-row">
            <label>
              開始日
              <input name="startDate" type="date" />
            </label>
            <label>
              終了日
              <input name="endDate" type="date" />
            </label>
          </div>
          <label>
            メモ
            <textarea name="description" rows={4} maxLength={1000} />
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
