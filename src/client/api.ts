export class ApiError extends Error {}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new ApiError(body.error ?? "処理に失敗しました");
  return body;
}

export function formatDate(value: string | null): string {
  if (!value) return "日付なし";
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

export function eventDate(start: string | null, end: string | null): string {
  if (!start) return "日付未設定";
  const startLabel = new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(
    new Date(`${start}T00:00:00`),
  );
  if (!end || end === start) return startLabel;
  const endLabel = new Intl.DateTimeFormat("ja-JP", { month: "short", day: "numeric" }).format(
    new Date(`${end}T00:00:00`),
  );
  return `${startLabel} – ${endLabel}`;
}
