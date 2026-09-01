import { useParams } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";

export function InvitePage() {
  const { token = "" } = useParams();
  return <>
    <PageHeader title="家族に参加" />
    <main className="page-content invite-page"><section>
      <h2>家族タイムラインに招待されています</h2>
      <p>LINEアカウントでログインして、家族の写真や動画を見られるようにします。</p>
      <a className="line-login-button" href={`/api/auth/line?invite=${encodeURIComponent(token)}`}>LINEでログインして参加</a>
    </section></main>
  </>;
}
