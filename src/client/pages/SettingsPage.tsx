import { Bell, BellOff, Check, Monitor, Moon, Sun, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import packageInfo from "../../../package.json";
import type { CurrentUser } from "../../shared/types";
import { api } from "../api";
import { ErrorState, Loading } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { getThemePreference, setThemePreference, type ThemePreference } from "../theme";

const themeOptions = [
  { value: "system", label: "システム", description: "端末に合わせる", icon: Monitor },
  { value: "light", label: "ライト", description: "明るい表示", icon: Sun },
  { value: "dark", label: "ダーク", description: "暗い表示", icon: Moon },
] satisfies { value: ThemePreference; label: string; description: string; icon: typeof Monitor }[];

export function SettingsPage() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);

  const load = () => {
    setError("");
    void api<CurrentUser>("/me").then((result) => {
      setUser(result); setDisplayName(result.displayName); setNotificationEnabled(result.notificationEnabled ?? false);
    }).catch((reason) => setError((reason as Error).message));
  };

  useEffect(() => {
    void api<CurrentUser>("/me").then((result) => {
      setUser(result); setDisplayName(result.displayName); setNotificationEnabled(result.notificationEnabled ?? false);
    }).catch((reason) => setError((reason as Error).message));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setSaved(false);
    try {
      const result = await api<CurrentUser>("/me", { method: "PATCH", body: JSON.stringify({ displayName, notificationEnabled }) });
      setUser(result); setDisplayName(result.displayName); setNotificationEnabled(result.notificationEnabled ?? false); setSaved(true);
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
    <PageHeader title="設定" back />
    <main className="page-content form-page">
      {error && !user ? <ErrorState message={error} retry={load} /> : !user ? <Loading /> : <><form className="form-stack settings-form" onSubmit={save}>
        <fieldset className="theme-setting">
          <legend>テーマ</legend>
          <div>{themeOptions.map(({ value, label, description, icon: Icon }) => <label className={theme === value ? "selected" : ""} key={value}>
            <input type="radio" name="theme" value={value} checked={theme === value} onChange={() => { setTheme(value); setThemePreference(value); }} />
            <Icon aria-hidden />
            <span><strong>{label}</strong><small>{description}</small></span>
          </label>)}</div>
        </fieldset>
        <label>表示名<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required maxLength={100} disabled={busy} /></label>
        <label className={`notification-toggle${notificationEnabled ? " enabled" : ""}${!user.lineFriend ? " unavailable" : ""}`}>
          <input className="notification-toggle-input" type="checkbox" checked={notificationEnabled} onChange={(event) => setNotificationEnabled(event.target.checked)} disabled={busy || !user.lineFriend} />
          <span className="notification-toggle-icon" aria-hidden><Bell className="notification-bell-on" /><BellOff className="notification-bell-off" /></span>
          <span className="notification-toggle-copy"><strong>LINE通知 <small>{!user.lineFriend ? "利用不可" : notificationEnabled ? "オン" : "オフ"}</small></strong><span>{!user.lineFriend ? "友だち追加後に利用できる" : notificationEnabled ? "新しい投稿をLINEでお知らせします" : "新しい投稿のLINE通知は届きません"}</span></span>
          <span className="notification-switch" aria-hidden><span><Check className="notification-switch-on" /><X className="notification-switch-off" /></span></span>
        </label>
        <div className="setting-status"><strong>LINE連携状態</strong><span className={user.lineConnected ? "linked" : ""}>{user.lineConnected ? "連携済み" : "未連携"}</span></div>
        <div className="setting-status"><strong>公式アカウント</strong><span className={user.lineFriend ? "linked" : ""}>{user.lineFriend ? "友だち追加済み" : "未追加"}</span></div>
        {user.lineConnected && !user.lineFriend && <a className="outline-button wide" href="/api/auth/line">友だち追加を確認</a>}
        {saved && <p className="save-message" role="status">設定を保存しました</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button wide" disabled={busy || !displayName.trim()}>{busy ? "保存中…" : "保存"}</button>
        <button className="danger-button settings-logout" type="button" onClick={logout} disabled={busy}>ログアウト</button>
      </form>
      <section className="settings-app-info" aria-label="アプリ情報">
        <span aria-hidden>
          <img className="settings-app-icon settings-app-icon-light" src="/icons/icon-light-192.png" alt="" />
          <img className="settings-app-icon settings-app-icon-dark" src="/icons/icon-dark-192.png" alt="" />
        </span>
        <strong>このごろ</strong>
        <small>バージョン {packageInfo.version}</small>
      </section></>}
    </main>
  </>;
}
