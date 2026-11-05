import { api } from "./api";

/**
 * この端末のアプリ通知の状態。
 * - unsupported: 通知を受け取れない端末（iOS 16.3 以前など）。LINE通知のまま。
 * - needs-install: iPhone・iPad でホーム画面に追加していない。追加すると受け取れる。
 * - denied: 通知の許可を断った。端末の設定から戻す必要がある。
 * - off: まだオンにしていない。
 * - on: この端末で受け取る。
 */
export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function isAppleMobile(userAgent = navigator.userAgent): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

/** iPhone の iOS 16.4 以降なら、ホーム画面に追加すれば通知を受け取れる。 */
export function appleMobileSupportsPush(userAgent = navigator.userAgent): boolean {
  const match = /OS (\d+)_(\d+)/.exec(userAgent);
  if (!match) return true;
  const major = Number(match[1]);
  return major > 16 || (major === 16 && Number(match[2]) >= 4);
}

function pushApisAvailable(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushApisAvailable()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function readPushState(): Promise<PushState> {
  if (!pushApisAvailable()) {
    if (isAppleMobile() && !isStandalone() && appleMobileSupportsPush()) return "needs-install";
    return "unsupported";
  }
  if (Notification.permission === "denied") return "denied";
  const subscription = await currentSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

function applicationServerKey(publicKey: string): Uint8Array<ArrayBuffer> {
  const normalized = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function register(subscription: PushSubscription, enable: boolean): Promise<void> {
  const json = subscription.toJSON();
  await api<void>("/push/subscriptions", {
    method: "POST",
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, enable }),
  });
}

/** ボタンを押したときに呼ぶ。iPhone では押した直後でないと許可を聞けない。 */
export async function enablePush(publicKey: string): Promise<PushState> {
  if (!pushApisAvailable()) return readPushState();
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  const key = applicationServerKey(publicKey);
  const sameKey =
    subscription?.options.applicationServerKey &&
    new Uint8Array(subscription.options.applicationServerKey).every((byte, index) => byte === key[index]);
  if (subscription && !sameKey) {
    await subscription.unsubscribe();
    subscription = null;
  }
  subscription ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await register(subscription, true);
  return "on";
}

export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api<void>("/push/subscriptions", {
    method: "DELETE",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => undefined);
  await subscription.unsubscribe();
}

export async function sendTestPush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) throw new Error("この端末の通知がオンになっていません");
  await api<void>("/push/test", { method: "POST", body: JSON.stringify({ endpoint: subscription.endpoint }) });
}

/**
 * 起動のたびに、この端末の購読をサーバーへ伝え直す。
 * 端末側で宛先が変わったときや、サーバーが一度消したあとでも、アプリ通知に戻れる。
 */
export async function syncPushSubscription(): Promise<void> {
  if (!pushApisAvailable() || Notification.permission !== "granted") return;
  const subscription = await currentSubscription();
  if (subscription) await register(subscription, false);
}

/**
 * 試しのお知らせを、この端末のアプリが受け取るまで待つ。受け取れば true、時間内に来なければ false。
 * 受け取りは service worker が知らせてくる（public/service-worker.js の PUSH_RECEIVED）。
 */
export function waitForTestPush(timeoutMs = 12_000): Promise<boolean> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (received: boolean) => {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("message", onMessage);
      resolve(received);
    };
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; tag?: string } | null;
      if (data?.type === "PUSH_RECEIVED" && data.tag === "test") done(true);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    navigator.serviceWorker.addEventListener("message", onMessage);
  });
}
