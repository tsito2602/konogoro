import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorState } from "./AsyncState";

describe("ErrorState", () => {
  it("再試行処理がある場合だけ再読み込みボタンを表示する", () => {
    expect(renderToStaticMarkup(<ErrorState message="取得に失敗しました" retry={() => undefined} />)).toContain(
      "再読み込み",
    );
    expect(renderToStaticMarkup(<ErrorState message="見つかりません" />)).not.toContain("再読み込み");
  });

  it("未ログイン時はLINEログイン導線を表示する", () => {
    const html = renderToStaticMarkup(<ErrorState message="ログインが必要です" retry={() => undefined} />);
    expect(html).toContain('href="/api/auth/line"');
    expect(html).toContain("LINEでログイン");
    expect(html).not.toContain("再読み込み");
  });
});
