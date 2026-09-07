import { Check, Copy, ExternalLink, Link2, Trash2, UserRoundCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { FamilyMember, InviteRequest, SharedInvite, User } from "../../shared/types";
import { api } from "../api";
import { useCurrentUser } from "../components/AppLayout";
import { EmptyState, ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { PageSkeleton } from "../components/PageSkeleton";
import { useToast } from "../components/Toast";

const roleLabels: Record<User["role"], string> = {
  owner: "管理者",
  uploader: "投稿者",
  viewer: "閲覧者",
};

export function FamilySettingsPage() {
  const currentUser = useCurrentUser();
  const showToast = useToast();
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [error, setError] = useState("");
  const [memberError, setMemberError] = useState("");
  const [updatingMemberId, setUpdatingMemberId] = useState("");
  const [removingMember, setRemovingMember] = useState<FamilyMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [sharedInvite, setSharedInvite] = useState<SharedInvite | null>(null);
  const [requests, setRequests] = useState<InviteRequest[] | null>(null);
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [closingInvite, setClosingInvite] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const load = () => {
    setError("");
    void api<{ members: FamilyMember[] }>("/family/members")
      .then((family) => setMembers(family.members))
      .catch((reason) => setError((reason as Error).message));
  };

  useEffect(() => {
    void Promise.all([
      api<{ members: FamilyMember[] }>("/family/members"),
      api<{ invite: SharedInvite | null }>("/family/shared-invite"),
      api<{ requests: InviteRequest[] }>("/family/invite-requests"),
    ])
      .then(([family, inviteResult, requestResult]) => {
        setMembers(family.members);
        setSharedInvite(inviteResult.invite);
        setRequests(requestResult.requests);
      })
      .catch((reason) => setError((reason as Error).message));
  }, []);

  const changeMemberRole = async (member: FamilyMember, role: User["role"]) => {
    if (role === member.role) return;
    setUpdatingMemberId(member.id);
    setMemberError("");
    try {
      const updated = await api<FamilyMember>(`/family/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      });
      setMembers((current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? null);
    } catch (reason) {
      setMemberError((reason as Error).message);
    } finally {
      setUpdatingMemberId("");
    }
  };

  const createInvite = async () => {
    setCreatingInvite(true);
    setInviteError("");
    try {
      const result = await api<SharedInvite>("/family/shared-invite", { method: "POST" });
      setSharedInvite(result);
      setInviteUrl(result.inviteUrl);
    } catch (reason) {
      setInviteError((reason as Error).message);
    } finally {
      setCreatingInvite(false);
    }
  };

  const closeInvite = async () => {
    if (!sharedInvite) return;
    setClosingInvite(true);
    setInviteError("");
    try {
      await api(`/family/shared-invite/${sharedInvite.id}`, { method: "DELETE" });
      setSharedInvite(null);
      setInviteUrl("");
      showToast("招待の受付を終了しました", { success: true });
    } catch (reason) {
      setInviteError((reason as Error).message);
    } finally {
      setClosingInvite(false);
    }
  };

  const reviewRequests = async (decision: "approved" | "rejected") => {
    if (selectedRequests.size === 0) return;
    setReviewing(true);
    setMemberError("");
    try {
      await api<{ reviewedCount: number }>("/family/invite-requests/review", {
        method: "POST",
        body: JSON.stringify({ requestIds: [...selectedRequests], decision }),
      });
      setRequests((current) => current?.filter((request) => !selectedRequests.has(request.id)) ?? null);
      setSelectedRequests(new Set());
      if (decision === "approved") load();
      showToast(decision === "approved" ? "閲覧リクエストを承認しました" : "閲覧リクエストを承認しませんでした", {
        success: true,
      });
    } catch (reason) {
      setMemberError((reason as Error).message);
    } finally {
      setReviewing(false);
    }
  };

  const removeMember = async () => {
    if (!removingMember) return;
    setRemoving(true);
    setMemberError("");
    try {
      await api(`/family/members/${removingMember.id}`, { method: "DELETE" });
      setMembers((current) => current?.filter((member) => member.id !== removingMember.id) ?? null);
      showToast(`${removingMember.displayName}をメンバーから削除しました`);
      setRemovingMember(null);
    } catch (reason) {
      setMemberError((reason as Error).message);
    } finally {
      setRemoving(false);
    }
  };

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      showToast("招待URLをコピーしました", { success: true });
    } catch {
      setInviteError("招待URLをコピーできませんでした");
    }
  };

  return (
    <>
      <PageHeader title="メンバーの管理" back />
      <main className="page-content family-page">
        {error ? (
          <ErrorState message={error} retry={load} />
        ) : members === null ? (
          <PageSkeleton variant="members" />
        ) : (
          <>
            <section className="family-section request-section" id="requests">
              <div className="family-section-heading">
                <div>
                  <h2>閲覧リクエスト</h2>
                  <p>名前を確認し、このごろを見られる人だけ承認してください。</p>
                </div>
                {requests && requests.length > 0 && <span className="request-count">{requests.length}件</span>}
              </div>
              {!requests || requests.length === 0 ? (
                <div className="request-empty">
                  <UserRoundCheck aria-hidden />
                  <p>確認待ちのリクエストはありません</p>
                </div>
              ) : (
                <>
                  <div className="request-list">
                    {requests.map((request) => {
                      const selected = selectedRequests.has(request.id);
                      return (
                        <label className={`request-row${selected ? " selected" : ""}`} key={request.id}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() =>
                              setSelectedRequests((current) => {
                                const next = new Set(current);
                                if (next.has(request.id)) next.delete(request.id);
                                else next.add(request.id);
                                return next;
                              })
                            }
                          />
                          <span className="member-avatar">
                            {request.avatarUrl ? (
                              <img src={request.avatarUrl} alt="" />
                            ) : (
                              request.displayName.slice(0, 1)
                            )}
                          </span>
                          <span className="request-copy">
                            <strong>{request.displayName}</strong>
                            <small>閲覧をリクエスト</small>
                          </span>
                          <span className="request-check" aria-hidden>
                            {selected && <Check />}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <div className="request-actions">
                    <button
                      className="outline-button"
                      type="button"
                      disabled={reviewing || selectedRequests.size === 0}
                      onClick={() => void reviewRequests("rejected")}
                    >
                      <X />
                      承認しない
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      disabled={reviewing || selectedRequests.size === 0}
                      onClick={() => void reviewRequests("approved")}
                    >
                      <Check />
                      {reviewing ? "処理中…" : selectedRequests.size > 0 ? `${selectedRequests.size}人を承認` : "承認"}
                    </button>
                  </div>
                </>
              )}
              {memberError && (
                <p className="form-error" role="alert">
                  {memberError}
                </p>
              )}
            </section>
            <section className="family-section invite-section">
              <div className="family-section-heading">
                <div>
                  <h2>家族を招待</h2>
                  <p>共通URLを家族のグループLINEへ一度送れば、複数人から閲覧リクエストを受け取れます。</p>
                </div>
                {sharedInvite && <span className="invite-active-badge">受付中</span>}
              </div>
              {inviteUrl ? (
                <div className="invite-result">
                  <div className="invite-created-message">
                    <Link2 aria-hidden />
                    <div>
                      <strong>家族共通の招待URLを発行しました</strong>
                      <p>URLを知っているだけでは写真や動画は見られません。管理者の承認が必要です。</p>
                    </div>
                  </div>
                  <input value={inviteUrl} readOnly aria-label="家族共通の招待URL" />
                  <div>
                    <button className="outline-button" type="button" onClick={copyInvite}>
                      <Copy />
                      コピー
                    </button>
                    <a
                      className="primary-button"
                      href={`https://line.me/R/msg/text/?${encodeURIComponent(`写真や動画を見るための招待です。\n${inviteUrl}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink />
                      LINEで送る
                    </a>
                  </div>
                </div>
              ) : sharedInvite ? (
                <div className="invite-active-state">
                  <p>家族共通の招待を受け付けています。新しいURLが必要な場合は、再発行してください。</p>
                  <div>
                    <button className="outline-button" type="button" onClick={createInvite} disabled={creatingInvite}>
                      <Link2 />
                      {creatingInvite ? "発行中…" : "新しいURLを発行"}
                    </button>
                    <button
                      className="text-button danger-text"
                      type="button"
                      onClick={closeInvite}
                      disabled={closingInvite}
                    >
                      {closingInvite ? "終了中…" : "受付を終了"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="invite-start">
                  <p>招待URLの有効期限は30日です。受付はいつでも終了できます。</p>
                  <button
                    className="primary-button wide"
                    type="button"
                    onClick={createInvite}
                    disabled={creatingInvite}
                  >
                    <Link2 />
                    {creatingInvite ? "発行中…" : "家族共通の招待URLを発行"}
                  </button>
                </div>
              )}
              {sharedInvite && inviteUrl && (
                <button
                  className="text-button danger-text"
                  type="button"
                  onClick={closeInvite}
                  disabled={closingInvite}
                >
                  {closingInvite ? "終了中…" : "このURLの受付を終了"}
                </button>
              )}
              {inviteError && (
                <p className="form-error" role="alert">
                  {inviteError}
                </p>
              )}
            </section>
            <section className="family-section">
              <h2>権限設定</h2>
              {members.length === 0 ? (
                <EmptyState title="メンバーはいません" body="招待URLを発行してメンバーを招待できます。" />
              ) : (
                <div className="member-list">
                  {members.map((member) => (
                    <article className="member-row" key={member.id}>
                      <div className="member-avatar">
                        {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.displayName.slice(0, 1)}
                      </div>
                      <div className="member-copy">
                        <strong>{member.displayName}</strong>
                        {member.id === currentUser.id ? (
                          <span>{roleLabels[member.role]}</span>
                        ) : (
                          <select
                            className="member-role-select"
                            value={member.role}
                            disabled={updatingMemberId === member.id}
                            aria-label={`${member.displayName}の権限`}
                            onChange={(event) => void changeMemberRole(member, event.target.value as User["role"])}
                          >
                            <option value="viewer">閲覧者</option>
                            <option value="uploader">投稿者</option>
                            <option value="owner">管理者</option>
                          </select>
                        )}
                      </div>
                      {member.id !== currentUser.id && (
                        <button
                          className="icon-button member-delete-button"
                          type="button"
                          aria-label={`${member.displayName}をメンバーから削除`}
                          onClick={() => {
                            setMemberError("");
                            setRemovingMember(member);
                          }}
                        >
                          <Trash2 />
                        </button>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
      {removingMember && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (!removing) setRemovingMember(null);
          }}
        >
          <section
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-member-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="remove-member-title">{removingMember.displayName}を削除する？</h2>
            <p>このメンバーはログインできなくなる。これまでの投稿やコメントは残る。</p>
            {memberError && (
              <p className="form-error" role="alert">
                {memberError}
              </p>
            )}
            <div>
              <button
                className="outline-button"
                type="button"
                disabled={removing}
                onClick={() => setRemovingMember(null)}
              >
                キャンセル
              </button>
              <button
                className="danger-confirm-button"
                type="button"
                disabled={removing}
                onClick={() => void removeMember()}
              >
                {removing ? "削除中…" : "削除する"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
