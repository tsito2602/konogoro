import { fileSha256 } from "./file-sha256";

self.onmessage = async (event: MessageEvent<Blob>) => {
  try {
    self.postMessage({ sha256: await fileSha256(event.data) });
  } catch {
    self.postMessage({ error: "ファイルを確認できません。選択し直してください。" });
  }
};
