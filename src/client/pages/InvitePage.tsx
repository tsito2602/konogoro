import { CheckCircle2, Clock3, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import type { InviteAccess } from "../../shared/types";
import { api } from "../api";
import { PageHeader } from "../components/PageHeader";

const unavailableCopy: Record<Exclude<InviteAccess["reason"], "available">, string> = {
  expired: "この招待URLの有効期限が切れています。",
  closed: "この招待URLの受付は終了しました。",
  full: "この招待URLでは、これ以上リクエストを受け付けられません。",
  invalid: "この招待URLを確認できませんでした。",
};

export function InvitePage() {
  const { token = "" } = useParams();
  const [access, setAccess] = useState<InviteAccess | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(() => {
    void api<InviteAccess>(`/family/invites/${encodeURIComponent(token)}/access`)
      .then((result) => {
        setError("");
        setAccess(result);
      })
      .catch((reason: Error) => setError(reason.message));
  }, [token]);

  useEffect(() => {
    load();
    const resume = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", resume);
    return () => document.removeEventListener("visibilitychange", resume);
  }, [load]);

  const requestAccess = async () => {
    setSubmitting(true);
    setError("");
    try {
      await api(`/family/invites/${encodeURIComponent(token)}/requests`, { method: "POST" });
      setAccess((current) => (current ? { ...current, requestStatus: "pending" } : current));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const loginUrl = `/api/auth/line?invite=${encodeURIComponent(token)}&returnTo=${encodeURIComponent(`/invite/${token}`)}`;
  let content;
  if (error) {
    content = (
      <div className="invite-state" role="alert">
        <h2>招待を確認できませんでした</h2>
        <p>{error}</p>
        <button className="outline-button" type="button" onClick={load}>
          もう一度試す
        </button>
      </div>
    );
  } else if (!access) {
    content = <div className="invite-loading" aria-label="招待を確認中" />;
  } else if (access.member || access.requestStatus === "approved") {
    content = (
      <div className="invite-state">
        <CheckCircle2 className="invite-state-icon" aria-hidden />
        <h2>写真や動画を見られます</h2>
        <p>このごろで、家族の日々の様子をお楽しみください。</p>
        <a className="primary-button wide" href="/">
          このごろを開く
        </a>
      </div>
    );
  } else if (access.requestStatus === "pending") {
    content = (
      <div className="invite-state">
        <Clock3 className="invite-state-icon" aria-hidden />
        <h2>閲覧リクエストを送りました</h2>
        <p>管理者が確認すると、写真や動画を見られるようになります。準備ができたらLINEでお知らせします。</p>
        {access.lineFriend === false && (
          <p className="invite-notice">
            LINE通知を受け取るには、「このごろ」のLINEアカウントを友だちに追加してください。
          </p>
        )}
      </div>
    );
  } else if (access.requestStatus === "rejected") {
    content = (
      <div className="invite-state">
        <h2>閲覧リクエストを確認できませんでした</h2>
        <p>心当たりがある場合は、この招待URLを共有した方へご確認ください。</p>
      </div>
    );
  } else if (!access.available) {
    content = (
      <div className="invite-state">
        <h2>招待を利用できません</h2>
        <p>{unavailableCopy[access.reason as Exclude<InviteAccess["reason"], "available">]}</p>
      </div>
    );
  } else if (!access.authenticated) {
    content = (
      <div className="invite-state">
        <Users className="invite-state-icon" aria-hidden />
        <h2>写真や動画を見るための招待です</h2>
        <p>LINEで本人確認したあと、管理者へ閲覧リクエストを送れます。</p>
        <a className="line-login-button" href={loginUrl}>
          LINEでログイン
        </a>
      </div>
    );
  } else {
    content = (
      <div className="invite-state">
        <Users className="invite-state-icon" aria-hidden />
        <h2>写真や動画を見ますか？</h2>
        <p>管理者が確認した方だけが、このごろの写真や動画を見られます。</p>
        <button className="primary-button wide" type="button" onClick={requestAccess} disabled={submitting}>
          {submitting ? "送信中…" : "閲覧をリクエストする"}
        </button>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="このごろへの招待" />
      <main className="page-content invite-page">
        <section>{content}</section>
      </main>
    </>
  );
}
