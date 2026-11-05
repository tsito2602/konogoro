/* global crypto, process */
// アプリ通知（Web Push）の VAPID 鍵を作り、Worker の secret VAPID_KEY に入れる JWK を1行で出力する。
// 鍵を作り直すと、それまでの端末の通知は届かなくなる（端末が次に開いたときに登録し直す）。
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const { kty, crv, d, x, y } = await crypto.subtle.exportKey("jwk", pair.privateKey);
process.stdout.write(JSON.stringify({ kty, crv, d, x, y }));
