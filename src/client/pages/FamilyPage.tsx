import { Bell, BellOff, Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CurrentUser, FamilyMember, User } from "../../shared/types";
import { api } from "../api";
import { EmptyState, ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";

const roleLabels: Record<User["role"], string> = {
  owner: "管理者",
  uploader: "投稿者",
  viewer: "閲覧者",
};

export function FamilyPage() {
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [inviteRole, setInviteRole] = useState<User["role"]>("viewer");
  const [updatingMemberId, setUpdatingMemberId] = useState("");
  const [memberError, setMemberError] = useState("");

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
      const result = await api<{ inviteUrl: string }>("/family/invites", { method: "POST", body: JSON.stringify({ role: inviteRole }) });
      setInviteUrl(result.inviteUrl);
    } catch (reason) { setInviteError((reason as Error).message); }
    finally { setCreatingInvite(false); }
  };

  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); }
    catch { setInviteError("招待URLをコピーできませんでした"); }
  };

  const changeMemberRole = async (member: FamilyMember, role: User["role"]) => {
    if (role === member.role) return;
    setUpdatingMemberId(member.id); setMemberError("");
    try {
      const updated = await api<FamilyMember>(`/family/members/${member.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      setMembers((current) => current?.map((item) => item.id === updated.id ? updated : item) ?? null);
    } catch (reason) { setMemberError((reason as Error).message); }
    finally { setUpdatingMemberId(""); }
  };

  return <>
    <PageHeader title="家族" action={<Link className="header-link" to="/settings">設定</Link>} />
    <main className="page-content family-page">
      {error ? <ErrorState message={error} retry={load} /> : members === null ? <Loading /> : <>
        <section className="family-section">
          <h2>メンバー</h2>
          {members.length === 0 ? <EmptyState title="メンバーはいません" body="家族を招待すると、ここに表示されます。" /> : <div className="member-list">
            {members.map((member) => <article className="member-row" key={member.id}>
              <div className="member-avatar">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.displayName.slice(0, 1)}</div>
              <div className="member-copy"><strong>{member.displayName}</strong>{currentUser?.role === "owner" && member.id !== currentUser.id
                ? <select className="member-role-select" value={member.role} disabled={updatingMemberId === member.id} aria-label={`${member.displayName}の権限`} onChange={(event) => void changeMemberRole(member, event.target.value as User["role"])}>
                  <option value="viewer">閲覧者</option>
                  <option value="uploader">投稿者</option>
                  <option value="owner">管理者</option>
                </select>
                : <span>{roleLabels[member.role]}</span>}</div>
              <span className={`notification-state${member.notificationEnabled ? " enabled" : ""}`}>{member.notificationEnabled ? <Bell /> : <BellOff />}LINE通知{member.notificationEnabled ? "ON" : "OFF"}</span>
            </article>)}
            {memberError && <p className="form-error" role="alert">{memberError}</p>}
          </div>}
        </section>
        {currentUser?.role === "owner" && <section className="family-section invite-section">
          <h2>招待</h2><p>家族に送る参加用URLを発行します。</p>
          {!inviteUrl ? <div className="form-stack"><fieldset className="role-guide">
            <legend>権限</legend>
            <label className={inviteRole === "viewer" ? "selected" : ""}><input type="radio" name="invite-role" value="viewer" checked={inviteRole === "viewer"} onChange={() => setInviteRole("viewer")} /><div><strong>閲覧者</strong><p>タイムライン・イベント・投稿の閲覧、コメント、自分のコメントの削除</p></div></label>
            <label className={inviteRole === "uploader" ? "selected" : ""}><input type="radio" name="invite-role" value="uploader" checked={inviteRole === "uploader"} onChange={() => setInviteRole("uploader")} /><div><strong>投稿者</strong><p>投稿・閲覧・コメント、イベント管理、すべての投稿の削除</p></div></label>
            <label className={inviteRole === "owner" ? "selected" : ""}><input type="radio" name="invite-role" value="owner" checked={inviteRole === "owner"} onChange={() => setInviteRole("owner")} /><div><strong>管理者</strong><p>投稿・閲覧・コメント、イベント管理、家族の招待、すべての投稿の削除</p></div></label>
          </fieldset><button className="primary-button wide" type="button" onClick={createInvite} disabled={creatingInvite}>{creatingInvite ? "発行中…" : "招待URLを発行"}</button></div> : <div className="invite-result">
            <input value={inviteUrl} readOnly aria-label="招待URL" />
            <div><button className="outline-button" type="button" onClick={copyInvite}><Copy />コピー</button><a className="primary-button" href={`https://line.me/R/msg/text/?${encodeURIComponent(inviteUrl)}`} target="_blank" rel="noreferrer"><ExternalLink />LINEで送る</a></div>
            <button className="text-button" type="button" onClick={() => setInviteUrl("")}>別の招待URLを発行</button>
          </div>}
          {inviteError && <p className="form-error" role="alert">{inviteError}</p>}
        </section>}
      </>}
    </main>
  </>;
}
