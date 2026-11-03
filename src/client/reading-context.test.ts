import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";
import { readPages, restorePanelPosition, setReadingIdentity } from "./reading-context";
vi.mock("./api", () => ({ api: vi.fn() }));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

describe("returning to a paginated list", () => {
  it("stops if a server repeats a cursor instead of fetching indefinitely", async () => {
    vi.mocked(api).mockResolvedValue({ media: [], nextCursor: "same" });
    await readPages<{ media: unknown[]; nextCursor: string | null }>("/album", "media", 100);
    expect(api).toHaveBeenCalledTimes(2);
  });
});

it("retains same-user history but clears it on role, user and logout transitions", () => {
  const panel = Object.assign(new EventTarget(), { scrollTop: 100 }) as unknown as HTMLElement;
  const initial = vi.fn();
  setReadingIdentity("member:owner");
  restorePanelPosition("session", panel, initial)();
  setReadingIdentity("member:owner");
  restorePanelPosition("session", panel, initial)();
  expect(initial).toHaveBeenCalledTimes(1);
  setReadingIdentity("member:viewer");
  restorePanelPosition("session", panel, initial)();
  setReadingIdentity("other:viewer");
  restorePanelPosition("session", panel, initial)();
  setReadingIdentity(null);
  restorePanelPosition("session", panel, initial)();
  expect(initial).toHaveBeenCalledTimes(4);
});
