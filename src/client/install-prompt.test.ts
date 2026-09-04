import { describe, expect, it, vi } from "vitest";
import { createInstallPromptStore, type BeforeInstallPromptEvent } from "./install-prompt";

function installPromptEvent(): BeforeInstallPromptEvent {
  return Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(async () => undefined),
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
}

describe("install prompt store", () => {
  it("認証前に発火したinstall promptを認証後の購読時にも利用できる", () => {
    const target = new EventTarget();
    const store = createInstallPromptStore();
    const stop = store.start(target);
    const prompt = installPromptEvent();

    target.dispatchEvent(prompt);

    expect(prompt.defaultPrevented).toBe(true);
    expect(store.getSnapshot()).toBe(prompt);

    const authenticatedSubscriber = vi.fn();
    const unsubscribe = store.subscribe(authenticatedSubscriber);
    expect(store.getSnapshot()).toBe(prompt);

    store.consume(prompt);
    expect(store.getSnapshot()).toBeNull();
    expect(authenticatedSubscriber).toHaveBeenCalledOnce();

    unsubscribe();
    stop();
  });

  it("停止後はイベントを捕捉しない", () => {
    const target = new EventTarget();
    const store = createInstallPromptStore();
    const stop = store.start(target);
    stop();

    target.dispatchEvent(installPromptEvent());

    expect(store.getSnapshot()).toBeNull();
  });
});
