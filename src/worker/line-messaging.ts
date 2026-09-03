const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

export type NotificationCounts = {
  postCount: number;
  photoCount: number;
  videoCount: number;
  appOrigin: string;
};

export function buildNotificationText(counts: NotificationCounts): string {
  const media = [
    counts.photoCount > 0 ? `写真${counts.photoCount}枚` : null,
    counts.videoCount > 0 ? `動画${counts.videoCount}本` : null,
  ]
    .filter((value): value is string => value !== null)
    .join("・");
  const summary = media ? `（${media}）` : "";
  const appOrigin = counts.appOrigin.replace(/\/+$/, "");
  const destination = `${appOrigin}/unread`;

  return `新しい思い出が届きました。投稿${counts.postCount}件${summary}\nまとめて見る：${destination}`;
}

type LineNotification = {
  channelAccessToken: string;
  to: string;
  text: string;
  retryKey: string;
  fetcher?: typeof fetch;
};

export async function sendLineNotification(notification: LineNotification): Promise<void> {
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
      messages: [{ type: "text", text: notification.text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`LINE Messaging API request failed (status: ${response.status})`);
  }
}
