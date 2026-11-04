import { setReadingIdentity } from "../reading-context";
import { Bell, BookOpen, ChevronRight, Link2, Pencil, Smartphone, Users } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import packageInfo from "../../../package.json";
import type { CurrentUser, FamilyMember, User } from "../../shared/types";
import { api } from "../api";
import { useAppUpdate } from "../app-update";
import { spring } from "../cartoon/cartoon";
import { canInviteFamily } from "../../shared/permissions";
import { ErrorState } from "../components/AsyncState";
import { PageHeader } from "../components/PageHeader";
import { useCurrentUser } from "../components/AppLayout";
import { PageSkeleton } from "../components/PageSkeleton";
import { openInstallGuide, openOnboardingGuide } from "../components/PwaGuide";
import { useToast } from "../components/Toast";
import { getThemePreference, setThemePreference, type ThemePreference } from "../theme";

// kondo の設定（kondo src/web/settings.tsx・styles/settings.css）の形に合わせた設定画面。
// 一度決めれば済むものだけを、区切りの見出しと面のまとまりに並べる。表示名と通知は変えたときにすぐ保存する。

const roleLabels: Record<User["role"], string> = {
  owner: "管理者",
  uploader: "投稿者",
  viewer: "閲覧者",
};

const stagingRoleOptions = [
  { value: "owner", label: "管理者", description: "投稿・イベント・メンバーをすべて管理できます" },
  { value: "uploader", label: "投稿者", description: "投稿とイベントを作成・編集できます" },
  { value: "viewer", label: "閲覧者", description: "思い出の閲覧とコメントだけができます" },
] satisfies { value: User["role"]; label: string; description: string }[];

type StagingRoleGuideProps = {
  currentRole: User["role"];
  disabled: boolean;
  onChange: (role: User["role"]) => void;
};

export function StagingRoleGuide({ currentRole, disabled, onChange }: StagingRoleGuideProps) {
  return (
    <div className="settings-card staging-role-guide">
      <p className="staging-role-guide-title" aria-hidden="true">
        確認する権限
      </p>
      <fieldset className="role-guide" disabled={disabled}>
        <legend className="visually-hidden">確認する権限</legend>
        {stagingRoleOptions.map((option) => (
          <label className={currentRole === option.value ? "selected" : ""} key={option.value}>
            <input
              type="radio"
              name="staging-role"
              value={option.value}
              checked={currentRole === option.value}
              onChange={() => onChange(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              <p>{option.description}</p>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** 面のまとまりの中の1行。左に線のアイコン、まん中に名前と説明、右に状態や ›。 */
function Row({
  icon,
  title,
  note,
  end,
  danger = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  note?: ReactNode;
  end?: ReactNode;
  danger?: boolean;
}) {
  return (
    <>
      {icon}
      <span className="settings-row-copy">
        <b className={danger ? "danger" : undefined}>{title}</b>
        {note && <small>{note}</small>}
      </span>
      {end !== undefined && <span className="settings-row-end">{end}</span>}
    </>
  );
}

const chevron = <ChevronRight aria-hidden />;
const okMark = (
  <span className="settings-ok" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <path
        d="M5 12.5l4.5 4.5L19 7.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  </span>
);

/** アカウントの面：顔、その場で書き換えられる表示名、下の点線の欄に権限のはんこ。 */
function Passport({ user, onSaved }: { user: CurrentUser; onSaved: (user: CurrentUser) => void }) {
  const showToast = useToast();
  const nameId = useId();
  const [name, setName] = useState(user.displayName);
  const saved = useRef(user.displayName);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const save = useCallback(() => {
    clearTimeout(timer.current);
    const next = pending.current?.trim();
    pending.current = null;
    if (!next || next.length > 50 || next === saved.current) return;
    const previous = saved.current;
    saved.current = next;
    void api<CurrentUser>("/me", { method: "PATCH", body: JSON.stringify({ displayName: next }) })
      .then((result) => {
        onSaved(result);
        showToast("表示名を保存しました", { success: true });
      })
      .catch((reason: unknown) => {
        saved.current = previous;
        showToast(reason instanceof Error ? reason.message : "表示名を保存できませんでした");
      });
  }, [onSaved, showToast]);
  // 入力の途中で設定を離れても、最後に書いた名前を保存する。
  useEffect(() => save, [save]);

  const role = roleLabels[user.role];
  return (
    <div className="passport">
      <span className="passport-photo" aria-hidden="true">
        {user.avatarUrl ? <img src={user.avatarUrl} alt="" /> : <span>{user.displayName.slice(0, 1)}</span>}
      </span>
      <div className="passport-fields">
        <label className="passport-key" htmlFor={nameId}>
          NAME / 表示名
        </label>
        <span className="passport-name-field">
          <input
            id={nameId}
            className="passport-name"
            value={name}
            maxLength={50}
            autoComplete="nickname"
            enterKeyHint="done"
            onChange={(event) => {
              setName(event.target.value);
              pending.current = event.target.value;
              clearTimeout(timer.current);
              timer.current = setTimeout(save, 700);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            onBlur={() => {
              save();
              if (!name.trim()) setName(saved.current);
            }}
          />
          <label htmlFor={nameId} className="passport-name-edit" aria-label="表示名を変更">
            <Pencil aria-hidden />
          </label>
        </span>
      </div>
      <div className="passport-stamps">
        <small>このごろでの権限</small>
        <span role="img" aria-label={role} title={role}>
          {role}
        </span>
      </div>
    </div>
  );
}

/** LINE：通知のオンとオフは押したときに保存する。連携と受け取りの状態は右に出す。 */
function LineRows({ user, onSaved }: { user: CurrentUser; onSaved: (user: CurrentUser) => void }) {
  const showToast = useToast();
  const [enabled, setEnabled] = useState(user.notificationEnabled ?? false);
  const [busy, setBusy] = useState(false);
  const available = user.lineFriend;
  const toggle = async (next: boolean) => {
    setEnabled(next);
    setBusy(true);
    try {
      const result = await api<CurrentUser>("/me", {
        method: "PATCH",
        body: JSON.stringify({ notificationEnabled: next }),
      });
      onSaved(result);
      setEnabled(result.notificationEnabled ?? false);
      showToast(next ? "LINE通知をオンにしました" : "LINE通知をオフにしました", { success: true });
    } catch (reason) {
      setEnabled(!next);
      showToast((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="settings-group settings-line">
        <label className={`settings-row settings-switch-row${available ? "" : " unavailable"}`}>
          <Row
            icon={<Bell className="settings-row-icon" aria-hidden />}
            title="LINE通知"
            note={
              !available
                ? "友だち追加後に利用できる"
                : enabled
                  ? "新しい投稿をLINEでお知らせします"
                  : "新しい投稿のLINE通知は届きません"
            }
            end={
              <>
                <input
                  className="settings-switch-input"
                  type="checkbox"
                  role="switch"
                  checked={enabled}
                  disabled={busy || !available}
                  onChange={(event) => void toggle(event.target.checked)}
                />
                <span className="settings-switch" aria-hidden="true" />
              </>
            }
          />
        </label>
        <div className="settings-row">
          <Row
            icon={<Link2 className="settings-row-icon" aria-hidden />}
            title="LINEアカウント"
            end={
              user.lineConnected ? (
                <>
                  {okMark}
                  連携済み
                </>
              ) : (
                "未連携"
              )
            }
          />
        </div>
        <div className="settings-row">
          <Row
            title="アプリからの通知"
            end={
              user.lineFriend ? (
                <>
                  {okMark}
                  受信可能
                </>
              ) : (
                "受信不可"
              )
            }
          />
        </div>
      </div>
      {!user.lineFriend && (
        <p className="settings-note">LINEで「このごろ」アカウントをブロックしていないか確認してください。</p>
      )}
    </>
  );
}

const THEME_ICONS: Record<ThemePreference, ReactNode> = {
  system: (
    <>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </>
  ),
  light: (
    <>
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path
        d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </>
  ),
  dark: (
    <path
      d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinejoin="round"
    />
  ),
};
const THEMES = [
  { value: "system", label: "自動" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
] satisfies { value: ThemePreference; label: string }[];

/** 外観：3つのボタン。選んだものが紙の面になり、押したものは弾む。 */
function Appearance() {
  const [theme, setTheme] = useState<ThemePreference>(getThemePreference);
  return (
    <div className="settings-theme" role="group" aria-label="表示モード">
      {THEMES.map((entry) => (
        <button
          key={entry.value}
          type="button"
          aria-pressed={theme === entry.value}
          data-feedback="none"
          onClick={(event) => {
            setTheme(entry.value);
            setThemePreference(entry.value);
            void spring(event.currentTarget, [{ transform: "scale(.9)" }, { transform: "none" }], "boing");
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {THEME_ICONS[entry.value]}
          </svg>
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/** 一番下のアイコン：押すと跳ねて、着地で少しつぶれる。 */
function FooterLogo() {
  const mark = useRef<HTMLSpanElement>(null);
  return (
    <footer className="settings-foot">
      <button
        type="button"
        aria-label="このごろ"
        data-feedback="none"
        onClick={() => {
          if (!mark.current) return;
          void spring(
            mark.current,
            [
              { transform: "translateY(0)" },
              { transform: "translateY(-26px) scale(.92,1.08)", offset: 0.4 },
              { transform: "translateY(0) scale(1.12,.86)", offset: 0.75 },
              { transform: "none" },
            ],
            "boing",
          );
        }}
      >
        <span ref={mark} className="settings-logo" aria-hidden="true">
          <img className="settings-app-icon-light" src="/icons/icon-light-transparent.png" alt="" />
          <img className="settings-app-icon-dark" src="/icons/icon-dark-transparent.png" alt="" />
        </span>
      </button>
      <b>このごろ</b>
    </footer>
  );
}

export function SettingsPage() {
  const currentUser = useCurrentUser();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [members, setMembers] = useState<FamilyMember[] | null>(null);
  const [error, setError] = useState("");
  const [familyError, setFamilyError] = useState("");
  const [busy, setBusy] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const update = useAppUpdate();

  const loadFamily = useCallback(() => {
    setFamilyError("");
    void api<{ members: FamilyMember[] }>("/family/members")
      .then((family) => setMembers(family.members))
      .catch((reason) => setFamilyError((reason as Error).message));
  }, []);

  const applyUser = useCallback(
    (result: CurrentUser) => {
      setUser(result);
      if (canInviteFamily(result)) loadFamily();
    },
    [loadFamily],
  );

  const load = () => {
    setError("");
    void api<CurrentUser>("/me")
      .then(applyUser)
      .catch((reason) => setError((reason as Error).message));
  };

  useEffect(() => {
    void api<CurrentUser>("/me")
      .then(applyUser)
      .catch((reason) => setError((reason as Error).message));
  }, [applyUser]);

  const logout = async () => {
    setBusy(true);
    setError("");
    try {
      await api<void>("/auth/logout", { method: "POST" });
      setReadingIdentity(null);
      navigator.serviceWorker?.controller?.postMessage({ type: "CLEAR_MEDIA_CACHE" });
      window.location.assign("/");
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  };

  const switchStagingRole = async (role: User["role"]) => {
    if (!user || role === user.role) return;
    setSwitchingRole(true);
    setError("");
    try {
      await api<void>("/staging/role", {
        method: "POST",
        body: JSON.stringify({ role }),
      });
      window.location.assign("/");
    } catch (reason) {
      setError((reason as Error).message);
      setSwitchingRole(false);
    }
  };

  const updateLabel = update.version && update.version !== packageInfo.version ? update.version : "新しいバージョン";

  return (
    <>
      <PageHeader title="設定" />
      <main className="page-content settings-page">
        {error && !user ? (
          <ErrorState message={error} retry={load} />
        ) : !user ? (
          <PageSkeleton variant="settings" currentUser={currentUser} />
        ) : (
          <>
            <section className="settings-section">
              <h2>アカウント</h2>
              <Passport user={user} onSaved={setUser} />
              <LineRows user={user} onSaved={setUser} />
            </section>

            <section className="settings-section">
              <h2>外観</h2>
              <Appearance />
            </section>

            {canInviteFamily(user) && (
              <section className="settings-section">
                <h2>メンバー</h2>
                <div className="settings-group">
                  {familyError ? (
                    <div className="settings-row">
                      <Row
                        title={<span className="settings-error">{familyError}</span>}
                        end={
                          <button className="text-button" type="button" onClick={loadFamily}>
                            再読み込み
                          </button>
                        }
                      />
                    </div>
                  ) : members === null ? (
                    <div className="settings-row" role="status">
                      <span className="spinner" />
                      <Row title="読み込み中" />
                    </div>
                  ) : (
                    members.map((member) => (
                      <div className="settings-row settings-member" key={member.id}>
                        <span className="settings-member-avatar" aria-hidden="true">
                          {member.avatarUrl ? <img src={member.avatarUrl} alt="" /> : member.displayName.slice(0, 1)}
                        </span>
                        <Row
                          title={member.displayName}
                          note={roleLabels[member.role]}
                          end={`LINE通知${member.notificationEnabled ? "オン" : "オフ"}`}
                        />
                      </div>
                    ))
                  )}
                  <Link className="settings-row" to="/settings/family">
                    <Row
                      icon={<Users className="settings-row-icon" aria-hidden />}
                      title="メンバーの管理"
                      note="権限設定・招待URL発行"
                      end={chevron}
                    />
                  </Link>
                </div>
              </section>
            )}

            <section className="settings-section">
              <h2>アプリ</h2>
              <div className="settings-group">
                <button className="settings-row" type="button" onClick={() => openOnboardingGuide()}>
                  <Row
                    icon={<BookOpen className="settings-row-icon" aria-hidden />}
                    title="このごろの使い方"
                    note="初回ガイドをもう一度見る"
                    end={chevron}
                  />
                </button>
                <button className="settings-row" type="button" onClick={() => openInstallGuide()}>
                  <Row
                    icon={<Smartphone className="settings-row-icon" aria-hidden />}
                    title="ホーム画面に追加"
                    note="アプリのように全画面で開ける"
                    end={chevron}
                  />
                </button>
                <div className="settings-row" role="status" aria-live="polite">
                  <Row
                    title={`バージョン ${packageInfo.version}`}
                    end={
                      update.available ? (
                        `${updateLabel} が届いています`
                      ) : (
                        <>
                          {okMark}
                          最新です
                        </>
                      )
                    }
                  />
                </div>
              </div>
            </section>

            {user.isStaging && (
              <section className="settings-section">
                <h2>ステージング確認</h2>
                <div className="settings-group">
                  <Link className="settings-row" to="/settings/design">
                    <Row title="新しい触り心地を試す" note="イベント・写真・LINE通知のデザイン試作" end={chevron} />
                  </Link>
                </div>
                <StagingRoleGuide
                  currentRole={user.role}
                  disabled={switchingRole}
                  onChange={(role) => void switchStagingRole(role)}
                />
                <p className="settings-note">
                  このブラウザだけの確認用設定です。切り替えるとタイムラインへ移動します。
                </p>
              </section>
            )}

            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}

            <section className="settings-section settings-signout" aria-label="ログアウト">
              <div className="settings-group">
                <button className="settings-row" type="button" onClick={() => void logout()} disabled={busy}>
                  <Row title="ログアウト" danger />
                </button>
              </div>
            </section>

            <section className="settings-section settings-foot-section" aria-label="アプリ情報">
              <FooterLogo />
            </section>
          </>
        )}
      </main>
    </>
  );
}
