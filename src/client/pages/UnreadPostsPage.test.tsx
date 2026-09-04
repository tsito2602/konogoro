import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { UnreadComplete } from "./UnreadPostsPage";

describe("UnreadComplete", () => {
  it("全件閲覧後の完了状態とタイムラインへの導線を表示する", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <UnreadComplete />
      </MemoryRouter>,
    );

    expect(html).toContain("新しい思い出はすべて見ました");
    expect(html).toContain("タイムラインへ戻る");
    expect(html).toContain('href="/"');
  });
});
