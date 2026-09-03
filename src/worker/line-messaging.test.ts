import { describe, expect, it, vi } from "vitest";
import { buildNotificationText, sendLineNotification } from "./line-messaging";

describe("buildNotificationText", () => {
  it("投稿と写真・動画の件数を新着閲覧リンク付きで案内する", () => {
    expect(
      buildNotificationText({
        postCount: 3,
        photoCount: 15,
        videoCount: 2,
        appOrigin: "https://family.example.com/",
      }),
    ).toBe(
      "新しい思い出が届きました。投稿3件（写真15枚・動画2本）\nまとめて見る：https://family.example.com/unread",
    );
  });

  it("存在するmedia種別だけを表示する", () => {
    expect(
      buildNotificationText({
        postCount: 1,
        photoCount: 0,
        videoCount: 1,
        appOrigin: "https://family.example.com",
      }),
    ).toBe("新しい思い出が届きました。投稿1件（動画1本）\nまとめて見る：https://family.example.com/unread");
  });

  it("mediaがない場合も投稿件数と新着閲覧リンクだけを表示する", () => {
    expect(
      buildNotificationText({
        postCount: 1,
        photoCount: 0,
        videoCount: 0,
        appOrigin: "https://family.example.com",
      }),
    ).toBe("新しい思い出が届きました。投稿1件\nまとめて見る：https://family.example.com/unread");
  });
});

describe("sendLineNotification", () => {
  it("Bearer tokenとretry keyを付けてtext messageを送る", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    const retryKey = "123e4567-e89b-42d3-a456-426614174000";
    await sendLineNotification({ channelAccessToken: "secret-token", to: "U123", text: "通知本文", retryKey, fetcher });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(init?.method).toBe("POST");
    expect(headers.get("Authorization")).toBe("Bearer secret-token");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Line-Retry-Key")).toBe(retryKey);
    expect(JSON.parse(String(init?.body))).toEqual({
      to: "U123",
      messages: [{ type: "text", text: "通知本文" }],
    });
  });

  it("失敗時はstatusだけを含み秘密値を含まないErrorを投げる", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"message":"private body"}', { status: 401 }));

    const request = {
      channelAccessToken: "secret-token",
      to: "U123",
      text: "秘密の通知本文",
      retryKey: crypto.randomUUID(),
      fetcher,
    };
    await expect(sendLineNotification(request)).rejects.toThrow("LINE Messaging API request failed (status: 401)");

    try {
      await sendLineNotification(request);
    } catch (error) {
      expect(String(error)).not.toContain("secret-token");
      expect(String(error)).not.toContain("private body");
      expect(String(error)).not.toContain("秘密の通知本文");
    }
  });
});
