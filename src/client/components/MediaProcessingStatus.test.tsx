import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MediaProcessingStatus } from "./MediaProcessingStatus";

describe("MediaProcessingStatus", () => {
  it("ローカル準備の完了件数を表示する", () => {
    const html = renderToStaticMarkup(
      <MediaProcessingStatus
        files={[{ status: "ready" }, { status: "preparing" }, { status: "preparing" }]}
        uploading={false}
        uploadProgress={0}
      />,
    );
    expect(html).toContain("写真・動画を準備中");
    expect(html).toContain("1 / 3");
  });

  it("アップロードの件数と進捗を表示する", () => {
    const html = renderToStaticMarkup(
      <MediaProcessingStatus files={[{ status: "uploaded" }, { status: "uploading" }]} uploading uploadProgress={48} />,
    );
    expect(html).toContain("写真・動画を送信中");
    expect(html).toContain("1 / 2 · 48%");
  });

  it("転送100%でもサーバーの確定前は仕上げ表示にしない", () => {
    expect(
      renderToStaticMarkup(<MediaProcessingStatus files={[{ status: "uploading" }]} uploading uploadProgress={100} />),
    ).not.toContain("投稿を仕上げています");
    expect(
      renderToStaticMarkup(<MediaProcessingStatus files={[{ status: "uploaded" }]} uploading uploadProgress={100} />),
    ).toContain("投稿を仕上げています");
  });
  it("処理していないときは何も表示しない", () => {
    expect(
      renderToStaticMarkup(
        <MediaProcessingStatus files={[{ status: "ready" }]} uploading={false} uploadProgress={0} />,
      ),
    ).toBe("");
  });
});
