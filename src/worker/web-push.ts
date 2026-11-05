// Web Push（RFC 8291 の aes128gcm と RFC 8292 の VAPID）を Workers の WebCrypto だけで送る。

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

export class PushDeliveryError extends Error {
  constructor(public readonly status: number) {
    super(`Web Push request failed (status: ${status})`);
  }
  /** 端末側で購読が消えた。二度と届かないので購読を消す。 */
  get gone(): boolean {
    return this.status === 404 || this.status === 410;
  }
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

const encoder = new TextEncoder();

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - (normalized.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/** VAPID_KEY には秘密鍵の JWK（d・x・y を含む）を JSON で入れる。公開鍵は x・y から作る。 */
export function parseVapidKey(value: string | undefined): VapidKeys | null {
  if (!value) return null;
  try {
    const jwk = JSON.parse(value) as JsonWebKey;
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.d || !jwk.x || !jwk.y) return null;
    const publicKey = base64UrlEncode(concat(new Uint8Array([4]), base64UrlDecode(jwk.x), base64UrlDecode(jwk.y)));
    return { publicKey, privateJwk: { kty: "EC", crv: "P-256", d: jwk.d, x: jwk.x, y: jwk.y } };
  } catch {
    return null;
  }
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  length: number,
) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length * 8));
}

/** RFC 8291 の aes128gcm で本文を暗号化する。試験のために送信側の鍵と salt を差し替えられる。 */
export async function encryptPushPayload(
  subscription: Pick<PushSubscriptionKeys, "p256dh" | "auth">,
  payload: string,
  options: { senderKeys?: CryptoKeyPair; salt?: Uint8Array<ArrayBuffer> } = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const receiverPublic = base64UrlDecode(subscription.p256dh);
  const authSecret = base64UrlDecode(subscription.auth);
  const senderKeys =
    options.senderKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const senderPublic = new Uint8Array(await crypto.subtle.exportKey("raw", senderKeys.publicKey));
  const receiverKey = await crypto.subtle.importKey(
    "raw",
    receiverPublic,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: receiverKey }, senderKeys.privateKey, 256),
  );
  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    concat(encoder.encode("WebPush: info\0"), receiverPublic, senderPublic),
    32,
  );
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  // 1レコードだけなので、本文の後ろに最後のレコードを示す 0x02 を付ける。
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      key,
      concat(encoder.encode(payload), new Uint8Array([2])),
    ),
  );
  const header = new Uint8Array(21 + senderPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = senderPublic.length;
  header.set(senderPublic, 21);
  return concat(header, ciphertext);
}

/** RFC 8292 の VAPID 署名（ES256 の JWT）を作る。 */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = new Date()) {
  const header = base64UrlEncode(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now.getTime() / 1000) + 12 * 60 * 60,
        sub: subject,
      }),
    ),
  );
  const key = await crypto.subtle.importKey("jwk", keys.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${claims}`)),
  );
  return `vapid t=${header}.${claims}.${base64UrlEncode(signature)}, k=${keys.publicKey}`;
}

/** badge はアイコンの右上に出す数（まだ見ていない思い出の数）。 */
export type PushMessage = { title: string; body: string; url: string; tag: string; badge?: number };

export type PushSend = (input: {
  subscription: PushSubscriptionKeys;
  message: PushMessage;
  keys: VapidKeys;
  subject: string;
}) => Promise<void>;

export const sendWebPush: PushSend = async ({ subscription, message, keys, subject }) => {
  const body = await encryptPushPayload(subscription, JSON.stringify(message));
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: await vapidAuthorization(subscription.endpoint, keys, subject),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      // 一日たっても届けられない通知は意味が薄いので捨ててもらう。
      TTL: String(24 * 60 * 60),
      Urgency: "normal",
      // 同じ topic の未配達の通知は新しいもので置き換わる。
      Topic: message.tag,
    },
    body,
  });
  if (!response.ok) throw new PushDeliveryError(response.status);
};
