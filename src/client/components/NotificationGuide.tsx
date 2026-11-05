import { Bell, BellOff, Check, CircleAlert, Smartphone, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { RM } from "../cartoon/cartoon";
import { haptic } from "../haptics";
import {
  disablePush,
  enablePush,
  isAppleMobile,
  readPushState,
  sendTestPush,
  waitForTestPush,
  type PushState,
} from "../push";

export const OPEN_NOTIFICATION_GUIDE_EVENT = "konogoro:open-notification-guide";
export const PUSH_STATE_CHANGED_EVENT = "konogoro:push-state-changed";

/** invite は最初のお誘い、test は設定の「試しにお知らせを送る」。 */
export type NotificationGuideMode = "invite" | "test";

export function openNotificationGuide(mode: NotificationGuideMode = "invite") {
  window.dispatchEvent(new CustomEvent<NotificationGuideMode>(OPEN_NOTIFICATION_GUIDE_EVENT, { detail: mode }));
}

function announce(state: PushState) {
  window.dispatchEvent(new CustomEvent<PushState>(PUSH_STATE_CHANGED_EVENT, { detail: state }));
}

/** 画面の進み方。親が答える問いは置かず、アプリが受け取ったかどうかで次へ進む。 */
type Step = "loading" | "ask" | "waiting" | "done" | "missing" | "denied" | "needs-install" | "unsupported";

const symbols: Record<Step, ReactNode> = {
  loading: <Bell />,
  ask: <Bell />,
  waiting: <Bell />,
  done: <Check />,
  missing: <CircleAlert />,
  denied: <BellOff />,
  "needs-install": <Smartphone />,
  unsupported: <BellOff />,
};

function Steps({ items }: { items: string[] }) {
  return (
    <ol>
      {items.map((text, index) => (
        <li key={text}>
          <span>{index + 1}</span>
          {text}
        </li>
      ))}
    </ol>
  );
}

/**
 * お知らせを受け取れるようにする画面。親がするのは「お知らせを受け取る」と「許可」を押すことだけ。
 * そのあと試しのお知らせを送り、アプリが受け取ったのを確かめて「届きました」に進む。
 */
export function NotificationGuide({
  publicKey,
  mode,
  close,
  openInstallGuide,
}: {
  publicKey: string;
  mode: NotificationGuideMode;
  close: () => void;
  openInstallGuide: () => void;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const started = useRef(false);
  const apple = isAppleMobile();

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  // 下へ沈んでから閉じる。動きを減らす設定ならすぐ閉じる。
  const dismiss = (after: () => void = close) => {
    if (closing) return;
    setClosing(true);
    closeTimer.current = setTimeout(after, RM() ? 0 : 220);
  };

  /** 試しのお知らせを送り、この端末のアプリが受け取るのを待つ。 */
  const tryDelivery = async () => {
    setStep("waiting");
    const received = waitForTestPush();
    const sent = await sendTestPush().then(
      () => true,
      () => false,
    );
    const ok = sent && (await received);
    if (ok) haptic();
    setStep(ok ? "done" : "missing");
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void readPushState().then((state) => {
      if (state === "on") {
        // 設定から開いたときは、すぐに試しのお知らせを送る。最初のお誘いでは、もう受け取れているので閉じる。
        if (mode === "test") void tryDelivery();
        else close();
        return;
      }
      setStep(state === "off" ? "ask" : state);
    });
    // 開いたときに一度だけ状態を読む。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } finally {
      setBusy(false);
    }
  };

  const turnOn = () =>
    run(async () => {
      const state = await enablePush(publicKey).catch((): PushState => "off");
      announce(state);
      if (state === "on") await tryDelivery();
      else setStep(state === "off" ? "missing" : state);
    });

  const backToLine = () =>
    run(async () => {
      await disablePush();
      announce(await readPushState());
      dismiss();
    });

  const settingsSteps = apple
    ? ["「設定」アプリを開く", "「通知」→「このごろ」を押す", "「通知を許可」をオンにする"]
    : ["「設定」アプリを開く", "「アプリ」→「このごろ」を押す", "「通知」をオンにする"];

  return (
    <div
      className={`modal-backdrop pwa-guide-backdrop install-guide-backdrop notify-guide-backdrop${closing ? " closing" : ""}`}
      onClick={(event) => {
        if (event.target === event.currentTarget && step !== "waiting") dismiss();
      }}
    >
      <section
        className="pwa-guide-modal install-guide notify-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notify-title"
        aria-busy={busy || step === "waiting"}
      >
        {step !== "waiting" && (
          <button
            className="icon-button pwa-guide-close"
            type="button"
            onClick={() => dismiss()}
            aria-label="お知らせの案内を閉じる"
          >
            <X />
          </button>
        )}

        <div className="notify-step" key={step}>
          {step === "ask" ? (
            <div className="notify-preview" aria-hidden>
              <div>
                <img src="/icons/icon-light-192.png" alt="" />
                <p>
                  <b>新しい思い出が届きました</b>
                  <small>投稿2件（写真5枚）</small>
                </p>
              </div>
            </div>
          ) : (
            <span className={`pwa-guide-symbol notify-bell ${step}`} aria-hidden>
              {symbols[step]}
            </span>
          )}

          {step === "loading" && <h2 id="notify-title">お知らせの状態を確かめています</h2>}

          {step === "ask" && (
            <>
              <h2 id="notify-title">
                新しい写真が届いたら
                <br />
                スマホにお知らせします
              </h2>
              <p>ボタンを押したあと、「許可」を押してください。</p>
              <button className="primary-button wide" type="button" onClick={() => void turnOn()} disabled={busy}>
                お知らせを受け取る
              </button>
              <button className="outline-button wide" type="button" onClick={() => dismiss()}>
                あとで
              </button>
            </>
          )}

          {step === "waiting" && (
            <>
              <h2 id="notify-title">試しのお知らせを送っています</h2>
              <p>画面の上にお知らせが出るまで、少し待ってください。</p>
            </>
          )}

          {step === "done" && (
            <>
              <h2 id="notify-title">お知らせが届きました</h2>
              <p>これからは、新しい写真のお知らせがこのアプリに届きます。</p>
              <button className="primary-button wide" type="button" onClick={() => dismiss()}>
                {mode === "test" ? "閉じる" : "はじめる"}
              </button>
            </>
          )}

          {step === "missing" && (
            <>
              <h2 id="notify-title">お知らせが届きませんでした</h2>
              <Steps items={settingsSteps} />
              <button className="primary-button wide" type="button" onClick={() => void turnOn()} disabled={busy}>
                もう一度ためす
              </button>
              <button className="outline-button wide" type="button" onClick={() => void backToLine()} disabled={busy}>
                今までどおりLINEで受け取る
              </button>
            </>
          )}

          {step === "denied" && (
            <>
              <h2 id="notify-title">お知らせが止められています</h2>
              <p>次のとおりに直すと、このアプリでお知らせを受け取れます。それまではLINEでお知らせします。</p>
              <Steps items={settingsSteps} />
              <button className="outline-button wide" type="button" onClick={() => dismiss()}>
                閉じる
              </button>
            </>
          )}

          {step === "needs-install" && (
            <>
              <h2 id="notify-title">まず、ホーム画面に追加します</h2>
              <p>iPhoneでは、ホーム画面に追加したこのごろにお知らせが届きます。</p>
              <button className="primary-button wide" type="button" onClick={() => dismiss(openInstallGuide)}>
                追加のしかたを見る
              </button>
              <button className="outline-button wide" type="button" onClick={() => dismiss()}>
                あとで
              </button>
            </>
          )}

          {step === "unsupported" && (
            <>
              <h2 id="notify-title">この端末では、LINEでお知らせします</h2>
              <p>このままで大丈夫です。</p>
              <button className="outline-button wide" type="button" onClick={() => dismiss()}>
                閉じる
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
