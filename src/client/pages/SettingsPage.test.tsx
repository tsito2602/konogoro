import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StagingRoleGuide } from "./SettingsPage";

describe("StagingRoleGuide", () => {
  it("見出しをカード内の通常フローに置き、権限グループの名前を維持する", () => {
    const html = renderToStaticMarkup(<StagingRoleGuide currentRole="viewer" disabled={false} onChange={vi.fn()} />);

    expect(html).toContain('<div class="settings-card staging-role-guide">');
    expect(html).toContain('<p class="staging-role-guide-title" aria-hidden="true">確認する権限</p>');
    expect(html).toContain('<legend class="visually-hidden">確認する権限</legend>');
    expect(html.match(/name="staging-role"/g)).toHaveLength(3);
    expect(html).toMatch(/<label class="selected"><input[^>]*checked=""[^>]*value="viewer"/);
  });

  it("切替中は権限グループ全体を無効にする", () => {
    const html = renderToStaticMarkup(<StagingRoleGuide currentRole="owner" disabled={true} onChange={vi.fn()} />);

    expect(html).toContain('<fieldset class="role-guide" disabled="">');
  });
});
