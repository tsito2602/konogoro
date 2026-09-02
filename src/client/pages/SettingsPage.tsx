import { Bell, BellOff, Check, ChevronRight, LogOut, Monitor, Moon, Sun, Users, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import packageInfo from "../../../package.json";
import type { CurrentUser, FamilyMember, User } from "../../shared/types";
import { api } from "../api";
import { ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { useToast } from "../components/Toast";
import { getThemePreference, setThemePreference, type ThemePreference } from "../theme";

const themeOptions = [
  { value: "system", label: "システム", description: "端末に合わせる", icon: Monitor },
  { value: "light", label: "ライト", description: "明るい表示", icon: Sun },
  { value: "dark", label: "ダーク", description: "暗い表示", icon: Moon },
] satisfies { value: ThemePreference; label: string; description: string; icon: typeof Monitor }[];

const roleLabels: Record<User["role"], string> = {
  owner: "管理者",
  uploader: "投稿者",
  viewer: "閲覧者",
};

export function SettingsPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [error, setError] = useState("");
  const [familyError, setFamilyError] = useState("");
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  const showToast = useToast();

  const loadFamily = useCallback(() => {
    setFamilyError("");
    void api<{ members: FamilyMember[] }>("/family/members")
      .then((family) => setMembers(family.members))
      .catch((reason) => setFamilyError((reason as Error).message));
  }, []);

  const applyUser = useCallback((result: CurrentUser) => {
    setUser(result); setDisplayName(result.displayName); setNotificationEnabled(result.notificationEnabled ?? false);
    if (result.role === "owner") loadFamily();
  }, [loadFamily]);

  const load = () => {
    setError("");
    void api<CurrentUser>("/me").then(applyUser).catch((reason) => setError((reason as Error).message));
  };

  useEffect(() => {
    void api<CurrentUser>("/me").then(applyUser).catch((reason) => setError((reason as Error).message));
  }, [applyUser]);

  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await api<CurrentUser>("/me", { method: "PATCH", body: JSON.stringify({ displayName, notificationEnabled }) });
      setUser(result); setDisplayName(result.displayName); setNotificationEnabled(result.notificationEnabled ?? false); showToast("設定を保存しました");
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  };

  const logout = async () => {
    setBusy(true); setError("");
    try {
      await api<void>("/auth/logout", { method: "POST" });
      navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_MEDIA_CACHE" });
      window.location.assign("/");
    }
    catch (reason) { setError((reason as Error).message); setBusy(false); }
  };

  return <>
    <PageHeader title="設定" />
    <main className="page-content settings-page">
      {error && !user ? <ErrorState message={error} retry={load} /> : !user ? <Loading /> : <>
        <form className="settings-form" onSubmit={save}>
          <section className="settings-section">
            <h2>プロフィール</h2>
            <div className="settings-card"><label className="settings-field"><span>表示名</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={100} disabled={busy} /></label></div>
          </section>

          <section className="settings-section">
            <h2>表示</h2>
            <fieldset className="settings-card theme-setting">
              <legend className="visually-hidden">テーマ</legend>
              <div>{themeOptions.map(({ value, label, description, icon: Icon }) => <label className={theme === value ? "selected" : ""} key={value}>
                <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => { setTheme(value); setThemePreference(value); }} />
                <Icon aria-hidden />
                <span><strong>{label}</strong><small>{description}</small></span>
              </label>)}</div>
            </fieldset>
          </section>

          <section className="settings-section">
            <h2>LINE</h2>
            <div className="settings-card">
              <label className={`notification-toggle${notificationEnabled ? " enabled" : ""}${!user.lineFriend ? " unavailable" : ""}`}>
                <input className="notification-toggle-input" type="checkbox" checked={notificationEnabled} onChange={(event) => setNotificationEnabled(event.target.checked)} disabled={busy || !user.lineFriend} />
                <span className="notification-toggle-icon" aria-hidden><Bell className="notification-bell-on" /><BellOff className="notification-bell-off" /></span>
                <span className="notification-toggle-copy"><strong>LINE通知 <small>{!user.lineFriend ? "利用不可" : notificationEnabled ? "オン" : "オフ"}</small></strong><span>{!user.lineFriend ? "友だち追加後に利用できる" : notificationEnabled ? "新しい投稿をLINEでお知らせします" : "新しい投稿のLINE通知は届きません"}</span></span>
                <span className="notification-switch" aria-hidden><span><Check className="notification-switch-on" /><X className="notification-switch-off" /></span></span>
              </label>
              <div className="setting-status"><strong>LINE連携</strong><span className={user.lineConnected ? "linked" : ""}>{user.lineConnected ? "連携済み" : "未連携"}</span></div>
              <div className="setting-status"><strong>公式アカウント</strong><span className={user.lineFriend ? "linked" : ""}>{user.lineFriend ? "友だち追加済み" : "未追加"}</span></div>
              {user.lineConnected && !user.lineFriend && <a className="outline-button wide settings-line-action" href="/api/auth/line">友だち追加を確認</a>}
            </div>
          </section>

          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wide" disabled={busy || !displayName.trim()}>{busy ? "保存中…" : "設定を保存"}</button>
        </form>

        {user.role === "owner" && <section className="settings-section">
          <h2>家族</h2>
          <div className="settings-card">
            {familyError ? <div className="settings-family-error"><p>{familyError}</p><button className="text-button" type="button" onClick={loadFamily}>再読み込み</button></div>
              : members === null ? <div className="settings-card-loading" role="status"><span className="spinner" />読み込み中</div>
              : members.map((member) => <article className="member-row" key={member.id}>
                <div className="member-avatar">{member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.displayName.slice(0, 1)}</div>
                <div className="member-copy"><strong>{member.displayName}</strong><span>{roleLabels[member.role]}</span></div>
                <span className={`notification-state${member.notificationEnabled ? " enabled" : ""}`}>{member.notificationEnabled ? <Bell /> : <BellOff />}LINE通知{member.notificationEnabled ? "ON" : "OFF"}</span>
              </article>)}
            <Link className="settings-menu-row" to="/settings/family"><Users aria-hidden /><span><strong>家族の管理</strong><small>権限設定・招待URL発行</small></span><ChevronRight aria-hidden /></Link>
          </div>
        </section>}

        <section className="settings-section">
          <h2>その他</h2>
          <div className="settings-card"><button className="settings-menu-row settings-logout" type="button" onClick={logout} disabled={busy}><LogOut aria-hidden /><span><strong>ログアウト</strong></span></button></div>
        </section>

        <section className="settings-app-info" aria-label="アプリ情報">
          <span aria-hidden>
            <img className="settings-app-icon settings-app-icon-light" src="/icons/icon-light-192.png" alt="" />
            <img className="settings-app-icon settings-app-icon-dark" src="/icons/icon-dark-192.png" alt="" />
          </span>
          <strong>このごろ</strong>
          <small>バージョン {packageInfo.version}</small>
        </section>
      </>}
    </main>
  </>;
}
