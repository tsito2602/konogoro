import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SeenBy } from "./SeenBy";

describe("SeenBy", () => {
  it("両目アイコンと人数、閲覧者名を表示する", () => {
    const html = renderToStaticMarkup(createElement(SeenBy, { users: [
      { id: "user-1", displayName: "父" },
      { id: "user-2", displayName: "母" },
    ] }));

    expect(html).toContain("👀");
    expect(html).toContain("みたよ 2人、一覧を表示");
    expect(html).toContain("父");
    expect(html).toContain("母");
  });

  it("閲覧者がいない場合は表示しない", () => {
    expect(renderToStaticMarkup(createElement(SeenBy, { users: [] }))).toBe("");
  });
});
