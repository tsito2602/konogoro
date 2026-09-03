import { Check, ShieldCheck, Smartphone, X } from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { CurrentUser } from "../../shared/types";
import { installPromptStore } from "../install-prompt";

export const OPEN_ONBOARDING_GUIDE_EVENT = "konogoro:open-onboarding-guide";
export const OPEN_INSTALL_GUIDE_EVENT = "konogoro:open-install-guide";
const ONBOARDING_SEEN_KEY = "konogoro:onboarding-seen:v1";
const INSTALL_GUIDE_DISMISSED_KEY = "konogoro:install-guide-dismissed:v1";

export type PwaEnvironment = "installed" | "ios-line" | "ios-browser" | "android-line" | "android-browser" | "other";

export function detectPwaEnvironment(userAgent: string, standalone: boolean): PwaEnvironment {
  if (standalone) return "installed";
  const line = /\bLine\//i.test(userAgent);
  if (/iPhone|iPad|iPod/i.test(userAgent)) return line ? "ios-line" : "ios-browser";
  if (/Android/i.test(userAgent)) return line ? "android-line" : "android-browser";
  return "other";
}

export function openOnboardingGuide() {
  window.dispatchEvent(new Event(OPEN_ONBOARDING_GUIDE_EVENT));
}

export function openInstallGuide() {
  window.dispatchEvent(new Event(OPEN_INSTALL_GUIDE_EVENT));
}

function stored(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function remember(key: string) {
  try {
    window.localStorage.setItem(key, "true");
  } catch {
    // Storageを利用できないブラウザでも案内を閉じて利用を続けられる。
  }
}

function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)").matches === true;
}

export function PwaGuide({ user, pathname }: { user: CurrentUser; pathname: string }) {
  const [welcomeOpen, setWelcomeOpen] = useState(() => user.role === "viewer" && !stored(ONBOARDING_SEEN_KEY));
  const [installOpen, setInstallOpen] = useState(false);
  const installPrompt = useSyncExternalStore(installPromptStore.subscribe, installPromptStore.getSnapshot, () => null);
  const [installed, setInstalled] = useState(isStandalone);
  const environment = useMemo(() => detectPwaEnvironment(navigator.userAgent, installed), [installed]);

  useEffect(() => {
    const showWelcome = () => setWelcomeOpen(true);
    const showInstall = () => setInstallOpen(true);
    const markInstalled = () => {
      setInstalled(true);
      setInstallOpen(false);
      remember(INSTALL_GUIDE_DISMISSED_KEY);
    };
    window.addEventListener(OPEN_ONBOARDING_GUIDE_EVENT, showWelcome);
    window.addEventListener(OPEN_INSTALL_GUIDE_EVENT, showInstall);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener(OPEN_ONBOARDING_GUIDE_EVENT, showWelcome);
      window.removeEventListener(OPEN_INSTALL_GUIDE_EVENT, showInstall);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  useEffect(() => {
    if (
      user.role !== "viewer" ||
      welcomeOpen ||
      installOpen ||
      installed ||
      stored(INSTALL_GUIDE_DISMISSED_KEY) ||
      (pathname !== "/" && pathname !== "/unread")
    )
      return;
    const timer = window.setTimeout(() => setInstallOpen(true), 12_000);
    return () => window.clearTimeout(timer);
  }, [installOpen, installed, pathname, user.role, welcomeOpen]);

  const closeWelcome = () => {
    remember(ONBOARDING_SEEN_KEY);
    setWelcomeOpen(false);
  };

  const closeInstall = () => {
    remember(INSTALL_GUIDE_DISMISSED_KEY);
    setInstallOpen(false);
  };

  const requestInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") remember(INSTALL_GUIDE_DISMISSED_KEY);
      setInstallOpen(false);
    } finally {
      installPromptStore.consume(installPrompt);
    }
  };

  return (
    <>
      {welcomeOpen && <WelcomeGuide close={closeWelcome} />}
      {installOpen && (
        <InstallGuide
          environment={environment}
          canPrompt={Boolean(installPrompt)}
          close={closeInstall}
          install={() => void requestInstall()}
        />
      )}
    </>
  );
}

function WelcomeGuide({ close }: { close: () => void }) {
  return (
    <div className="modal-backdrop pwa-guide-backdrop">
      <section
        className="pwa-guide-modal welcome-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
      >
        <button className="icon-button pwa-guide-close" type="button" onClick={close} aria-label="初回ガイドを閉じる">
          <X />
        </button>
        <span className="pwa-guide-symbol" aria-hidden>
          <ShieldCheck />
        </span>
        <p className="pwa-guide-eyebrow">このごろへようこそ</p>
        <h2 id="welcome-title">家族だけで、思い出を見られます</h2>
        <p>招待されたメンバーだけで写真や動画を共有する、家族のための場所です。</p>
        <ul>
          <li>
            <Check aria-hidden />
            ホームに未閲覧の件数が表示されます
          </li>
          <li>
            <Check aria-hidden />
            「新しい思い出を見る」で順番に確認できます
          </li>
          <li>
            <Check aria-hidden />
            写真にはコメントで一言返せます
          </li>
        </ul>
        <button className="primary-button wide" type="button" onClick={close} autoFocus>
          思い出を見る
        </button>
      </section>
    </div>
  );
}

function InstallGuide({
  environment,
  canPrompt,
  close,
  install,
}: {
  environment: PwaEnvironment;
  canPrompt: boolean;
  close: () => void;
  install: () => void;
}) {
  const content = installGuideContent(environment);
  return (
    <div className="modal-backdrop pwa-guide-backdrop install-guide-backdrop">
      <section
        className="pwa-guide-modal install-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
      >
        <button
          className="icon-button pwa-guide-close"
          type="button"
          onClick={close}
          aria-label="ホーム画面追加案内を閉じる"
        >
          <X />
        </button>
        <span className="pwa-guide-symbol" aria-hidden>
          <Smartphone />
        </span>
        <h2 id="install-title">{content.title}</h2>
        <p>{content.body}</p>
        {content.steps.length > 0 && (
          <ol>
            {content.steps.map((step, index) => (
              <li key={step}>
                <span>{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        )}
        {canPrompt && environment === "android-browser" && (
          <button className="primary-button wide" type="button" onClick={install}>
            ホーム画面に追加
          </button>
        )}
        <button className="text-button wide" type="button" onClick={close}>
          {environment === "installed" ? "閉じる" : "あとで"}
        </button>
      </section>
    </div>
  );
}

export function installGuideContent(environment: PwaEnvironment): { title: string; body: string; steps: string[] } {
  if (environment === "installed")
    return { title: "ホーム画面から開けます", body: "このごろはすでにアプリとして追加されています。", steps: [] };
  if (environment === "ios-line")
    return {
      title: "次から、すぐに開けます",
      body: "まずLINEからSafariで開き、ホーム画面へ追加します。",
      steps: [
        "LINEのメニューから「デフォルトのブラウザで開く」を選ぶ",
        "Safari下部の共有ボタンを押す",
        "「ホーム画面に追加」→「追加」を押す",
      ],
    };
  if (environment === "ios-browser")
    return {
      title: "次から、すぐに開けます",
      body: "ホーム画面へ追加すると、写真を見るたびにLINEを探さずに済みます。",
      steps: ["Safari下部の共有ボタンを押す", "「ホーム画面に追加」を選ぶ", "右上の「追加」を押す"],
    };
  if (environment === "android-line")
    return {
      title: "次から、すぐに開けます",
      body: "まずLINEから標準ブラウザで開き、ホーム画面へ追加します。",
      steps: [
        "LINEのメニューから「デフォルトのブラウザで開く」を選ぶ",
        "ブラウザのメニューを押す",
        "「アプリをインストール」または「ホーム画面に追加」を選ぶ",
      ],
    };
  if (environment === "android-browser")
    return {
      title: "次から、すぐに開けます",
      body: "ホーム画面へ追加すると、写真を見るたびにLINEを探さずに済みます。",
      steps: ["ブラウザのメニューを押す", "「アプリをインストール」または「ホーム画面に追加」を選ぶ"],
    };
  return {
    title: "この端末へ追加できます",
    body: "対応ブラウザのメニューから、このごろをアプリまたはホーム画面へ追加できます。",
    steps: ["ブラウザのメニューを開く", "アプリのインストールまたはホーム画面への追加を選ぶ"],
  };
}
