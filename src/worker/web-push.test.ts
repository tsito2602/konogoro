import { describe, expect, it } from "vitest";
import { base64UrlDecode, base64UrlEncode, encryptPushPayload, parseVapidKey, vapidAuthorization } from "./web-push";

const ecdh = { name: "ECDH", namedCurve: "P-256" } as const;

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: string | Uint8Array<ArrayBuffer>,
  length: number,
) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bytes = typeof info === "string" ? new TextEncoder().encode(info) : info;
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: bytes }, key, length * 8),
  );
}

describe("web push", () => {
  it("端末の鍵で本文を復号できる（RFC 8291）", async () => {
    const receiver = (await crypto.subtle.generateKey(ecdh, true, ["deriveBits"])) as CryptoKeyPair;
    const receiverPublic = new Uint8Array(await crypto.subtle.exportKey("raw", receiver.publicKey));
    const auth = crypto.getRandomValues(new Uint8Array(16));
    const body = await encryptPushPayload(
      { p256dh: base64UrlEncode(receiverPublic), auth: base64UrlEncode(auth) },
      '{"title":"このごろ"}',
    );

    const salt = body.slice(0, 16);
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    const senderPublic = body.slice(21, 21 + body[20]!);
    const sender = await crypto.subtle.importKey("raw", senderPublic, ecdh, false, []);
    const shared = new Uint8Array(
      await crypto.subtle.deriveBits({ name: "ECDH", public: sender }, receiver.privateKey, 256),
    );
    const info = new Uint8Array([...new TextEncoder().encode("WebPush: info\0"), ...receiverPublic, ...senderPublic]);
    const ikm = await hkdf(auth, shared, info, 32);
    const key = await crypto.subtle.importKey(
      "raw",
      await hkdf(salt, ikm, "Content-Encoding: aes128gcm\0", 16),
      "AES-GCM",
      false,
      ["decrypt"],
    );
    const plain = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: await hkdf(salt, ikm, "Content-Encoding: nonce\0", 12) },
        key,
        body.slice(21 + senderPublic.length),
      ),
    );
    expect(plain.at(-1)).toBe(2);
    expect(new TextDecoder().decode(plain.slice(0, -1))).toBe('{"title":"このごろ"}');
  });

  it("VAPIDの署名を公開鍵で確かめられる（RFC 8292）", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
    const keys = parseVapidKey(JSON.stringify(await crypto.subtle.exportKey("jwk", pair.privateKey)))!;
    expect(keys.publicKey).toBe(base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))));
    const header = await vapidAuthorization("https://web.push.apple.com/abc", keys, "https://konogoro.example");
    const [, token, publicKey] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(publicKey).toBe(keys.publicKey);
    const [h, c, signature] = token!.split(".");
    expect(JSON.parse(new TextDecoder().decode(base64UrlDecode(c!)))).toEqual(
      expect.objectContaining({ aud: "https://web.push.apple.com", sub: "https://konogoro.example" }),
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pair.publicKey,
      base64UrlDecode(signature!),
      new TextEncoder().encode(`${h}.${c}`),
    );
    expect(ok).toBe(true);
    expect(parseVapidKey('{"kty":"EC"}')).toBeNull();
  });
});
