export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Listener = () => void;

export function createInstallPromptStore() {
  let pendingPrompt: BeforeInstallPromptEvent | null = null;
  const listeners = new Set<Listener>();

  const notify = () => listeners.forEach((listener) => listener());

  return {
    start(target: EventTarget) {
      const capture = (event: Event) => {
        event.preventDefault();
        pendingPrompt = event as BeforeInstallPromptEvent;
        notify();
      };
      target.addEventListener("beforeinstallprompt", capture);
      return () => target.removeEventListener("beforeinstallprompt", capture);
    },
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot() {
      return pendingPrompt;
    },
    consume(prompt: BeforeInstallPromptEvent) {
      if (pendingPrompt !== prompt) return;
      pendingPrompt = null;
      notify();
    },
  };
}

export const installPromptStore = createInstallPromptStore();
