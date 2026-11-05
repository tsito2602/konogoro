import { Bell, BellOff, X } from "lucide-react";
import { useEffect, useState } from "react";
import { disablePush, enablePush, isAppleMobile, readPushState, sendTestPush, type PushState } from "../push";

export const OPEN_NOTIFICATION_GUIDE_EVENT = "konogoro:open-notification-guide";
export const PUSH_STATE_CHANGED_EVENT = "konogoro:push-state-changed";

export function openNotificationGuide() {
  window.dispatchEvent(new Event(OPEN_NOTIFICATION_GUIDE_EVENT));
}

function announce(state: PushState) {
  window.dispatchEvent(new CustomEvent<PushState>(PUSH_STATE_CHANGED_EVENT, { detail: state }));
}

/** 画面の進み方。押すたびに1つずつ進み、どこからでも閉じられる。 */
type Step =
  "loading" | "ask" | "testing" | "check" | "done" | "missing" | "denied" | "on" | "needs-install" | "unsupported";

function initialStep(state: PushState): Step {
  if (state === "off") return "ask";
  return state;
}

/**
 * 機械に詳しくない人でも迷わないよう、1画面に1つの操作だけを出す。
 * オンにした直後に試しの通知を送り、届いたかを本人に確かめてもらう。
 */
export function NotificationGuide({
  publicKey,
  close,
  openInstallGuide,
}: {
  publicKey: string;
  close: () => void;
  openInstallGuide: () => void;
}) {
  const [step, setStep] = useState<Step>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const apple = isAppleMobile();

  useEffect(() => {
    let active = true;
    void readPushState().then((state) => {
      if (active) setStep(initialStep(state));
    });
    return () => {
      active = false;
    };
  }, []);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "うまくいきませんでした。もう一度お試しください");
    } finally {
      setBusy(false);
    }
  };

  const sendTest = () =>
    run(async () => {
      setStep("testing");
      try {
        await sendTestPush();
        setStep("check");
      } catch (reason) {
        setStep("missing");
        throw reason;
      }
    });

  const turnOn = () =>
    run(async () => {
      const state = await enablePush(publicKey);
      announce(state);
      if (state === "on") {
        setStep("testing");
        await sendTestPush().catch(() => undefined);
        setStep("check");
        return;
      }
      setStep(initialStep(state));
    });

  const backToLine = () =>
    run(async () => {
      await disablePush();
      announce(await readPushState());
      close();
    });

  return (
    <div className="modal-backdrop pwa-guide-backdrop install-guide-backdrop">
      <section
        className="pwa-guide-modal install-guide notify-guide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="notify-title"
        aria-busy={busy}
      >
        <button className="icon-button pwa-guide-close" type="button" onClick={close} aria-label="通知の案内を閉じる">
          <X />
        </button>
        <span className="pwa-guide-symbol" aria-hidden>
          {step === "denied" || step === "unsupported" ? <BellOff /> : <Bell />}
        </span>

        {step === "loading" && <h2 id="notify-title">通知の状態を確かめています</h2>}

        {step === "ask" && (
          <>
            <h2 id="notify-title">新しい思い出を、このアプリでお知らせします</h2>
            <p>下のボタンを押すと、確認が出ます。「許可」を押してください。</p>
            <button className="primary-button wide" type="button" onClick={() => void turnOn()} disabled={busy}>
              通知をオンにする
            </button>
            <button className="text-button wide" type="button" onClick={close}>
              あとで
            </button>
          </>
        )}

        {step === "testing" && (
          <>
            <h2 id="notify-title">試しの通知を送っています</h2>
            <p>少しお待ちください。</p>
          </>
        )}

        {step === "check" && (
          <>
            <h2 id="notify-title">試しの通知が届きましたか？</h2>
            <p>画面の上に「このごろ」のお知らせが出たら、届いています。</p>
            <button className="primary-button wide" type="button" onClick={() => setStep("done")}>
              届いた
            </button>
            <button className="text-button wide" type="button" onClick={() => setStep("missing")}>
              届かない
            </button>
          </>
        )}

        {step === "done" && (
          <>
            <h2 id="notify-title">準備ができました</h2>
            <p>これからは、新しい思い出のお知らせがLINEではなく、このアプリに届きます。</p>
            <button className="primary-button wide" type="button" onClick={close}>
              閉じる
            </button>
          </>
        )}

        {step === "missing" && (
          <>
            <h2 id="notify-title">届かないときは</h2>
            <p>次のところを確かめてから、もう一度送ってみてください。</p>
            <ol>
              {(apple
                ? [
                    "「設定」アプリを開き、「通知」→「このごろ」を押す",
                    "「通知を許可」をオンにする",
                    "月のマークの「集中モード」がオンなら、オフにする",
                  ]
                : [
                    "「設定」アプリを開き、「アプリ」→「このごろ」を押す",
                    "「通知」をオンにする",
                    "「サイレントモード」がオンなら、オフにする",
                  ]
              ).map((text, index) => (
                <li key={text}>
                  <span>{index + 1}</span>
                  {text}
                </li>
              ))}
            </ol>
            <button className="primary-button wide" type="button" onClick={() => void sendTest()} disabled={busy}>
              もう一度送る
            </button>
            <button className="text-button wide" type="button" onClick={() => void backToLine()} disabled={busy}>
              今までどおりLINEで受け取る
            </button>
          </>
        )}

        {step === "on" && (
          <>
            <h2 id="notify-title">この端末で受け取っています</h2>
            <p>新しい思い出のお知らせは、このアプリに届きます。</p>
            <button className="primary-button wide" type="button" onClick={() => void sendTest()} disabled={busy}>
              試しの通知を送る
            </button>
            <button className="text-button wide" type="button" onClick={() => void backToLine()} disabled={busy}>
              この端末では受け取らない
            </button>
          </>
        )}

        {step === "denied" && (
          <>
            <h2 id="notify-title">通知が止められています</h2>
            <p>次の手順で通知を許可すると、このアプリでお知らせを受け取れます。それまではLINEでお知らせします。</p>
            <ol>
              {(apple
                ? ["「設定」アプリを開く", "「通知」→「このごろ」を押す", "「通知を許可」をオンにする"]
                : ["「設定」アプリを開く", "「アプリ」→「このごろ」を押す", "「通知」をオンにする"]
              ).map((text, index) => (
                <li key={text}>
                  <span>{index + 1}</span>
                  {text}
                </li>
              ))}
            </ol>
            <button className="text-button wide" type="button" onClick={close}>
              閉じる
            </button>
          </>
        )}

        {step === "needs-install" && (
          <>
            <h2 id="notify-title">まず、ホーム画面に追加します</h2>
            <p>iPhoneでは、ホーム画面に追加したこのごろから通知を受け取れます。</p>
            <button className="primary-button wide" type="button" onClick={openInstallGuide}>
              追加のしかたを見る
            </button>
            <button className="text-button wide" type="button" onClick={close}>
              あとで
            </button>
          </>
        )}

        {step === "unsupported" && (
          <>
            <h2 id="notify-title">この端末では、LINEでお知らせします</h2>
            <p>
              {apple
                ? "iPhoneのソフトウェアが古いため、アプリの通知を受け取れません。iOS 16.4以降にすると受け取れます。"
                : "このブラウザでは、アプリの通知を受け取れません。"}
            </p>
            <button className="text-button wide" type="button" onClick={close}>
              閉じる
            </button>
          </>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
