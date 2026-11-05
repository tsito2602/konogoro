const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

export class LineDeliveryError extends Error {
  constructor(public readonly status: number) {
    super(`LINE Messaging API request failed (status: ${status})`);
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export type LineNotificationEnv = {
  LINE_NOTIFICATION_ORIGIN?: string;
  APP_ORIGIN?: string;
};

export function lineNotificationOrigin(env: LineNotificationEnv, requestUrl?: string): string {
  // Keep notification destinations independent of the legacy login callback secret.
  return env.LINE_NOTIFICATION_ORIGIN ?? env.APP_ORIGIN ?? requestUrl ?? "";
}

export type NotificationCounts = {
  postCount: number;
  photoCount: number;
  videoCount: number;
  appOrigin: string;
};

/** 「投稿2件（写真3枚・動画1本）」の形。LINEとアプリの通知で同じ言い方にする。 */
export function notificationSummary(counts: Omit<NotificationCounts, "appOrigin">): string {
  const media = [
    counts.photoCount > 0 ? `写真${counts.photoCount}枚` : null,
    counts.videoCount > 0 ? `動画${counts.videoCount}本` : null,
  ]
    .filter((value): value is string => value !== null)
    .join("・");
  return `投稿${counts.postCount}件${media ? `（${media}）` : ""}`;
}

/** LINE から開くリンクは、LINE の中の画面ではなく端末のブラウザで開く。ログインやアプリの追加がふだんのブラウザと同じになる。 */
export function externalBrowserUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("openExternalBrowser", "1");
  return parsed.toString();
}

export function buildNotificationText(counts: NotificationCounts): string {
  const appOrigin = counts.appOrigin.replace(/\/+$/, "");
  const destination = externalBrowserUrl(`${appOrigin}/unread`);

  return `新しい思い出が届きました。${notificationSummary(counts)}\nまとめて見る：${destination}`;
}

type LineNotification = {
  channelAccessToken: string;
  to: string;
  text: string;
  retryKey: string;
  fetcher?: typeof fetch;
};

type LineActionNotification = LineNotification & {
  actionLabel: string;
  actionUrl: string;
};

export async function sendLineNotification(notification: LineNotification): Promise<void> {
  const fetcher = notification.fetcher ?? fetch;
  const response = await fetcher(LINE_PUSH_ENDPOINT, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Bearer ${notification.channelAccessToken}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": notification.retryKey,
    },
    body: JSON.stringify({
      to: notification.to,
      messages: [{ type: "text", text: notification.text }],
    }),
  });

  // Only an identified, already accepted request is a successful 409.
  if (response.status === 409 && response.headers.get("x-line-accepted-request-id")) return;
  if (!response.ok) throw new LineDeliveryError(response.status);
}

export async function sendLineActionNotification(notification: LineActionNotification): Promise<void> {
  const fetcher = notification.fetcher ?? fetch;
  const response = await fetcher(LINE_PUSH_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${notification.channelAccessToken}`,
      "Content-Type": "application/json",
      "X-Line-Retry-Key": notification.retryKey,
    },
    body: JSON.stringify({
      to: notification.to,
      messages: [
        {
          type: "template",
          altText: notification.text,
          template: {
            type: "buttons",
            text: notification.text,
            actions: [
              { type: "uri", label: notification.actionLabel, uri: externalBrowserUrl(notification.actionUrl) },
            ],
          },
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`LINE Messaging API request failed (status: ${response.status})`);
}
