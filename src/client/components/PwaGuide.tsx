import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Heart,
  Images,
  MessageCircle,
  ShieldCheck,
  Smile,
  Smartphone,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import type { CurrentUser } from "../../shared/types";
import { installPromptStore } from "../install-prompt";

export const OPEN_ONBOARDING_GUIDE_EVENT = "konogoro:open-onboarding-guide";
export const OPEN_INSTALL_GUIDE_EVENT = "konogoro:open-install-guide";
const ONBOARDING_SEEN_KEY = "konogoro:onboarding-seen:v1";

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

export function PwaGuide({ user }: { user: CurrentUser }) {
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

  const closeWelcome = () => {
    remember(ONBOARDING_SEEN_KEY);
    setWelcomeOpen(false);
  };

  const closeInstall = () => {
    setInstallOpen(false);
  };

  const requestInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
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

type GuideVisual = "welcome" | "timeline" | "events" | "album" | "comments" | "line";

type GuideSlide = { eyebrow: string; titleLines: string[]; body: string; visual: GuideVisual };

export function onboardingGuideSlides(): GuideSlide[] {
  return [
    {
      eyebrow: "このごろへようこそ",
      titleLines: ["家族だけで、", "思い出を残す"],
      body: "招待されたメンバーだけで写真や動画を共有できます。大切な記録を、安心して見返せる場所です。",
      visual: "welcome",
    },
    {
      eyebrow: "タイムライン",
      titleLines: ["新しい思い出から、", "順番に見られる"],
      body: "未閲覧の件数がひと目で分かります。「新しい思い出を見る」を押すと、まだ見ていない投稿を続けて見られます。",
      visual: "timeline",
    },
    {
      eyebrow: "イベント",
      titleLines: ["旅行やお出かけごとに、", "思い出を見られる"],
      body: "旅行や記念日などのまとまりから、写真と動画を見られます。家族の思い出を出来事ごとに振り返れます。",
      visual: "events",
    },
    {
      eyebrow: "アルバム",
      titleLines: ["撮影した時期から、", "すぐ探せる"],
      body: "写真と動画は撮影年月ごとに自動で並びます。年と月を切り替えて、過去の思い出まで素早くたどれます。",
      visual: "album",
    },
    {
      eyebrow: "コメントとお知らせ",
      titleLines: ["思い出に、", "家族の言葉を添える"],
      body: "投稿にはコメントを残せます。新しい投稿やコメントは「お知らせ」にまとまり、見逃しません。",
      visual: "comments",
    },
    {
      eyebrow: "LINE通知",
      titleLines: ["新しい思い出を、", "LINEでお知らせ"],
      body: "新しい投稿が届くとLINEでお知らせします。通知から、そのまま新しい思い出を見られます。通知は設定画面でいつでも切り替えられます。",
      visual: "line",
    },
  ];
}

function WelcomeGuide({ close }: { close: () => void }) {
  const slides = useMemo(() => onboardingGuideSlides(), []);
  const [page, setPage] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const lastPage = page === slides.length - 1;
  const move = (nextPage: number) => setPage(Math.max(0, Math.min(slides.length - 1, nextPage)));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") move(page - 1);
    if (event.key === "ArrowRight") move(page + 1);
    if (event.key === "Escape") close();
  };

  const slide = slides[page];
  return (
    <div className="onboarding-guide-backdrop">
      <section
        className="onboarding-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onKeyDown={onKeyDown}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          touchStart.current = { x: touch.clientX, y: touch.clientY };
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (!start) return;
          const touch = event.changedTouches[0];
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          if (Math.abs(deltaX) < 48 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
          move(deltaX < 0 ? page + 1 : page - 1);
        }}
      >
        <button
          className="icon-button onboarding-guide-close"
          type="button"
          onClick={close}
          aria-label="使い方を閉じる"
        >
          <X />
        </button>
        <div className="onboarding-guide-page" key={`${slide.visual}-${page}`}>
          <GuideIllustration kind={slide.visual} />
          <div className="onboarding-guide-copy" aria-live="polite">
            <p className="pwa-guide-eyebrow">{slide.eyebrow}</p>
            <h2 id="welcome-title">
              {slide.titleLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </h2>
            <p>{slide.body}</p>
          </div>
        </div>
        <footer className="onboarding-guide-footer">
          <div className="onboarding-guide-dots" aria-label={`${slides.length}ページ中${page + 1}ページ目`}>
            {slides.map((item, index) => (
              <button
                className={index === page ? "active" : ""}
                type="button"
                onClick={() => move(index)}
                aria-label={`${index + 1}ページ目へ移動`}
                aria-current={index === page ? "step" : undefined}
                key={item.titleLines.join("")}
              />
            ))}
          </div>
          <div className="onboarding-guide-actions">
            <button className="text-button" type="button" onClick={() => move(page - 1)} disabled={page === 0}>
              <ChevronLeft />
              前へ
            </button>
            {lastPage ? (
              <button className="primary-button" type="button" onClick={close} autoFocus>
                はじめる
              </button>
            ) : (
              <button className="primary-button" type="button" onClick={() => move(page + 1)} autoFocus>
                次へ
                <ChevronRight />
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}

function GuideIllustration({ kind }: { kind: GuideVisual }) {
  if (kind === "welcome")
    return (
      <div className="guide-visual guide-welcome" role="img" aria-label="家族だけで写真を共有するイメージ">
        <div className="guide-photo guide-photo-one" />
        <div className="guide-photo guide-photo-two" />
        <span className="guide-shield">
          <ShieldCheck />
        </span>
        <div className="guide-family">
          <span>
            <UserRound />
          </span>
          <span>
            <Heart />
          </span>
          <span>
            <Smile />
          </span>
        </div>
      </div>
    );
  if (kind === "timeline")
    return (
      <div
        className="guide-visual guide-phone"
        role="img"
        aria-label="未閲覧の思い出が表示されたタイムラインのイメージ"
      >
        <div className="guide-phone-top">
          <Images />
          <strong>タイムライン</strong>
          <span>3</span>
        </div>
        <span className="guide-unread-button">新しい思い出を見る</span>
        <div className="guide-post">
          <div />
          <div />
          <small>未閲覧</small>
        </div>
      </div>
    );
  if (kind === "events")
    return (
      <div className="guide-visual guide-events" role="img" aria-label="旅行やお出かけのイベント一覧のイメージ">
        <article>
          <CalendarDays />
          <span>
            <strong>旅行</strong>
            <small>2泊3日</small>
          </span>
        </article>
        <article>
          <CalendarDays />
          <span>
            <strong>記念日</strong>
            <small>8月</small>
          </span>
        </article>
      </div>
    );
  if (kind === "album")
    return (
      <div className="guide-visual guide-album" role="img" aria-label="年月ごとに写真を探せるアルバムのイメージ">
        <div className="guide-album-year">
          <ChevronLeft />
          <strong>2026</strong>
          <ChevronRight />
        </div>
        <div className="guide-months">
          <span>
            <Grid2X2 />
          </span>
          <span>7</span>
          <span className="active">8</span>
          <span>9</span>
        </div>
        <div className="guide-album-cover">
          <strong>8月</strong>
          <small>12件の思い出</small>
        </div>
        <div className="guide-album-grid">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  if (kind === "comments")
    return (
      <div className="guide-visual guide-comments" role="img" aria-label="家族からのコメントとお知らせのイメージ">
        <div>
          <span className="guide-avatar">母</span>
          <p>
            <strong>いい写真だね！</strong>
            <small>
              <MessageCircle /> 旅行の思い出
            </small>
          </p>
        </div>
        <div>
          <span className="guide-avatar accent">
            <Bell />
          </span>
          <p>
            <strong>新しい思い出が届きました</strong>
            <small>たった今</small>
          </p>
        </div>
      </div>
    );
  if (kind === "line")
    return (
      <div className="guide-visual guide-line" role="img" aria-label="新しい思い出を知らせるLINE通知のイメージ">
        <div className="guide-line-header">
          <MessageCircle />
          <strong>LINE通知</strong>
          <small>たった今</small>
        </div>
        <article>
          <span>
            <Bell />
          </span>
          <p>
            <strong>新しい思い出が届きました</strong>
            <small>家族が写真を追加しました</small>
          </p>
        </article>
        <div className="guide-line-preview">
          <div />
          <div />
          <div />
        </div>
        <span className="guide-line-action">新しい思い出を見る</span>
      </div>
    );
  return null;
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
