import { afterEach, describe, expect, it, vi } from "vitest";
import { getThemePreference, setThemePreference } from "./theme";

afterEach(() => vi.unstubAllGlobals());

describe("theme", () => {
  it.each([
    ["light", "light"],
    ["dark", "dark"],
    ["unknown", "system"],
    [null, "system"],
  ] as const)("保存値%sをテーマ設定として読み込む", (stored, expected) => {
    vi.stubGlobal("window", { localStorage: { getItem: () => stored } });
    expect(getThemePreference()).toBe(expected);
  });

  it("ダークテーマをDOMとブラウザUIへ反映する", () => {
    const lightMeta = { media: "" };
    const darkMeta = { media: "" };
    const documentElement = { dataset: {} as Record<string, string> };
    vi.stubGlobal("window", { localStorage: { setItem: vi.fn() } });
    vi.stubGlobal("document", {
      documentElement,
      querySelector: (selector: string) => selector.includes("light") ? lightMeta : darkMeta,
    });

    setThemePreference("dark");

    expect(documentElement.dataset.theme).toBe("dark");
    expect(lightMeta.media).toBe("not all");
    expect(darkMeta.media).toBe("all");
  });

  it("システム設定へ戻す", () => {
    const lightMeta = { media: "" };
    const darkMeta = { media: "" };
    const documentElement = { dataset: { theme: "dark" } as Record<string, string> };
    vi.stubGlobal("window", { localStorage: { setItem: vi.fn() } });
    vi.stubGlobal("document", {
      documentElement,
      querySelector: (selector: string) => selector.includes("light") ? lightMeta : darkMeta,
    });

    setThemePreference("system");

    expect(documentElement.dataset.theme).toBeUndefined();
    expect(lightMeta.media).toBe("(prefers-color-scheme: light)");
    expect(darkMeta.media).toBe("(prefers-color-scheme: dark)");
  });
});
