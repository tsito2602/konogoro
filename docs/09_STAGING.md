# Staging Environment

複数のPRをまとめてスマートフォンで確認するため、`staging`ブランチを常設の統合確認用ブランチとして使う。

## 構成

| 対象 | staging | production |
|---|---|---|
| Git branch | `staging` | `main` |
| Worker | `konogoro-staging` | `konogoro` |
| URL | `https://konogoro-staging.tsito-apps.workers.dev` | `https://konogoro.tsito-apps.workers.dev` |
| D1 | `family-timeline-staging` | `family-timeline` |
| R2 | `family-timeline-media-staging` | `family-timeline-media` |
| Cron / LINE通知 | 無効 | 有効 |

stagingは本番D1・R2を参照しない。初回デプロイ時にGitHub Actionsがstaging用D1とR2を作成し、migrationを適用する。LINE Loginを設定しないため、migrationで作成される固定の開発ユーザーでログインする。

## 権限ごとの表示を確認する

設定画面の「ステージング確認」で、確認する権限を管理者・投稿者・閲覧者から選択する。切り替えるとタイムラインへ移動し、画面の表示とAPIの認可が選択した権限へ変わる。

選択はCookieでブラウザごとに保持するため、別の端末やブラウザで確認している人には影響しない。この切替機能はstagingでのみ有効で、本番のユーザー権限やD1上の固定開発ユーザーは変更しない。

## 複数PRをまとめて確認する

1. `staging`を最新の`main`と同じcommitへ更新する。
2. 実機確認する作業ブランチを、依存関係の順に`staging`へmergeする。
3. `staging`をpushし、`Deploy staging to Cloudflare`の成功を確認する。
4. staging URLをスマートフォンで開き、対象機能をまとめて確認する。
5. 問題なければ、元の各PRを依存関係の順に`main`へmergeする。
6. 本番反映後、`staging`を最新の`main`と同じcommitへ戻す。

`staging`自体から`main`へのPRは作らない。各Issueとの対応、レビュー履歴、バージョン判断を保つため、必ず元のPRを個別にmainへmergeする。

## データの扱い

- stagingには本番データを複製しない。
- 誰でも推測できるURLなので、個人情報を含む写真・動画・コメントを登録しない。
- 初期状態では写真・動画アップロード用のR2 S3資格情報を設定しない。閲覧、画面遷移、コメントなど、アップロードを必要としない確認に使う。
- アップロード確認が必要な場合は、staging bucketだけへPUTできるR2 API tokenを発行し、GitHub Actions secretsへ`STAGING_R2_ACCESS_KEY_ID`と`STAGING_R2_SECRET_ACCESS_KEY`として登録する。

## 自動デプロイ

`.github/workflows/deploy-staging.yml`は`staging`へのpushまたは手動実行で次を行う。

1. `npm run check`
2. staging用D1・R2の存在確認と初回作成
3. D1 migration
4. R2 CORS設定
5. staging Workerのデプロイ
6. HTTP 200の確認

本番の`.github/workflows/deploy.yml`および本番Cloudflareリソースは変更しない。
