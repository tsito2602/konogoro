import { Bell, BellOff, Copy, ExternalLink, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CurrentUser, FamilyMember } from "../../shared/types";
import { api } from "../api";
import { EmptyState, ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

export function FamilyPage() {
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);

  const load = () => {
    setError("");
    void Promise.all([api<{ members: FamilyMember[] }>("/family/members"), api<CurrentUser>("/me")])
      .then(([family, me]) => { setMembers(family.members); setCurrentUser(me); })
      .catch((reason) => setError((reason as Error).message));
  };

  useEffect(() => {
    void Promise.all([api<{ members: FamilyMember[] }>("/family/members"), api<CurrentUser>("/me")])
      .then(([family, me]) => { setMembers(family.members); setCurrentUser(me); })
      .catch((reason) => setError((reason as Error).message));
  }, []);

  const createInvite = async () => {
    setCreatingInvite(true); setInviteError("");
    try {
      const result = await api<{ inviteUrl: string }>("/family/invites", { method: "POST", body: JSON.stringify({ role: "viewer" }) });
      setInviteUrl(result.inviteUrl);
    } catch (reason) { setInviteError((reason as Error).message); }
    finally { setCreatingInvite(false); }
  };

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); }
    catch { setInviteError("招待URLをコピーできませんでした"); }
  };

  return <>
    <PageHeader title="家族" action={<Link className="icon-button" to="/settings" aria-label="設定"><Settings /></Link>} />
    <main className="page-content family-page">
      {error ? <ErrorState message={error} retry={load} /> : members === null ? <Loading /> : <>
        <section className="family-section">
          <h2>メンバー</h2>
          {members.length === 0 ? <EmptyState title="メンバーはいません" body="家族を招待すると、ここに表示されます。" /> : <div className="member-list">
            {members.map((member) => <article className="member-row" key={member.id}>
              <div className="member-avatar">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.displayName.slice(0, 1)}</div>
              <div className="member-copy"><strong>{member.displayName}</strong><span>{member.role}</span></div>
              <span className={`notification-state${member.notificationEnabled ? " enabled" : ""}`}>{member.notificationEnabled ? <Bell /> : <BellOff />}LINE通知{member.notificationEnabled ? "ON" : "OFF"}</span>
            </article>)}
          </div>}
        </section>
        {currentUser?.role === "owner" && <section className="family-section invite-section">
          <h2>招待</h2><p>家族に送る参加用URLを発行します。</p>
          {!inviteUrl ? <button className="primary-button" type="button" onClick={createInvite} disabled={creatingInvite}>{creatingInvite ? "発行中…" : "招待URLを発行"}</button> : <div className="invite-result">
            <input value={inviteUrl} readOnly aria-label="招待URL" />
            <div><button className="outline-button" type="button" onClick={copyInvite}><Copy />コピー</button><a className="primary-button" href={`https://line.me/R/msg/text/?${encodeURIComponent(inviteUrl)}`} target="_blank" rel="noreferrer"><ExternalLink />LINEで送る</a></div>
          </div>}
          {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
        </section>}
      </>}
    </main>
  </>;
}
