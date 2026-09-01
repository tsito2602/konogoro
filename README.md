# Family Timeline

家族限定で写真を共有する、React・Hono・Cloudflare Workers製のWebアプリ。写真投稿、イベント、家族招待、LINE Login用の認証基盤を実装済み。

## 必要なもの

- Node.js 22以降
- Cloudflareアカウント
- D1 database `family-timeline`
- private R2 bucket `family-timeline-media`
- bucketへPUTできるR2 S3 API token

## セットアップ

```sh
npm install
cp .dev.vars.example .dev.vars
npx wrangler login
npx wrangler d1 create family-timeline
npx wrangler r2 bucket create family-timeline-media
npx wrangler d1 migrations apply family-timeline --local
npm run dev
```

`wrangler d1 create`が返すdatabase IDで`wrangler.jsonc`の`database_id`を置き換える。本番D1へのmigrationは次のコマンドを実行。

```sh
npx wrangler d1 migrations apply family-timeline --remote
```

`.dev.vars`へ`R2_ACCOUNT_ID`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`を設定する。`r2-cors.json`のoriginへ本番originを追加し、R2 bucketのCORSポリシーとして設定する。

```sh
npx wrangler r2 bucket cors set family-timeline-media --file r2-cors.json
```

本番Workerには同じ3値をsecretとして登録。値はコマンド引数やリポジトリへ書かず、各コマンドの入力待ちで設定する。

```sh
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

R2 bindingはローカル開発時も`remote: true`に設定。Presigned PUTの送信先と、完了APIがobjectを確認するbucketを一致させるため。D1はローカルを使用。

## LINE Login

LINE Login ChannelのCallback URLへ`https://<本番origin>/api/auth/line/callback`を登録する。Workerには次の値をsecretとして設定する。

```sh
npx wrangler secret put LINE_CHANNEL_ID
npx wrangler secret put LINE_CHANNEL_SECRET
npx wrangler secret put APP_ORIGIN
```

3値が揃っている環境ではLINE LoginとSession認証を使用する。未設定のローカル環境では固定の開発ユーザーを使用する。

## コマンド

```sh
npm run dev          # Vite + Workers開発サーバー
npm run typecheck    # TypeScript検査
npm run build        # 本番ビルド
npm run cf-typegen   # binding型を再生成
npm run db:migrate   # ローカルD1 migration
```

## 現在の制限

- 認証は固定の開発ユーザーを使う
- JPEG、PNG、WebP、MP4、WebM、MOVを1投稿30件まで扱う
- 写真は1枚25MB、動画は1本500MBまで扱う
- LINE Messaging APIによる通知配信とメンバー権限変更は後続フェーズで実装する
