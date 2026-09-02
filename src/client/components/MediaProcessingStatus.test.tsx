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
    expect(html).toContain("アップロード中");
    expect(html).toContain("1 / 2 · 48%");
  });

  it("処理していないときは何も表示しない", () => {
    expect(
      renderToStaticMarkup(
        <MediaProcessingStatus files={[{ status: "ready" }]} uploading={false} uploadProgress={0} />,
      ),
    ).toBe("");
  });
});
