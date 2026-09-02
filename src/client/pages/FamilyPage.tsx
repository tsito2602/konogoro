import { Bell, BellOff, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { FamilyMember, User } from "../../shared/types";
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
  const [error, setError] = useState("");

  const load = () => {
    setError("");
    void api<{ members: FamilyMember[] }>("/family/members")
      .then((family) => setMembers(family.members))
      .catch((reason) => setError((reason as Error).message));
  };

  useEffect(() => {
    void api<{ members: FamilyMember[] }>("/family/members")
      .then((family) => setMembers(family.members))
      .catch((reason) => setError((reason as Error).message));
  }, []);

  return <>
    <PageHeader title="家族" action={<Link className="icon-button" to="/settings" aria-label="設定"><Settings /></Link>} />
    <main className="page-content family-page">
      {error ? <ErrorState message={error} retry={load} /> : members === null ? <Loading /> : <>
        <section className="family-section">
          <h2>メンバー</h2>
          {members.length === 0 ? <EmptyState title="メンバーはいません" body="家族を招待すると、ここに表示されます。" /> : <div className="member-list">
            {members.map((member) => <article className="member-row" key={member.id}>
              <div className="member-avatar">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.displayName.slice(0, 1)}</div>
              <div className="member-copy"><strong>{member.displayName}</strong><span>{roleLabels[member.role]}</span></div>
              <span className={`notification-state${member.notificationEnabled ? " enabled" : ""}`}>{member.notificationEnabled ? <Bell /> : <BellOff />}LINE通知{member.notificationEnabled ? "ON" : "OFF"}</span>
            </article>)}
          </div>}
        </section>
      </>}
    </main>
  </>;
}
