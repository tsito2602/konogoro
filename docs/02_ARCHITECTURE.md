# Architecture

## 技術スタック

固定:

- TypeScript
- React
- Vite
- Hono
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Cloudflare Cron Triggers
- LINE Login
- LINE Messaging API

使用しない:

- Supabase
- Firebase
- Vercel
- AWS
- 独自ID/Password認証

## 構成

```text
React + Vite
      ↓
Cloudflare Workers / Hono
      ├─ D1
      ├─ R2
      ├─ Cron Triggers
      └─ LINE APIs
```

フロントエンドとAPIは同一Workersプロジェクト内で扱える構成を優先。

## R2

Bucketはprivate。

D1には完全URLを保存せずObject Keyを保存。

例:

```text
media/{media_id}/original/{filename}
media/{media_id}/preview/preview.webp
media/{media_id}/thumbnail/thumbnail.webp
```

## Upload Flow

大容量Media本体をWorker経由で中継しない。

```text
Browser
→ Worker: upload URL request
→ auth / authorization
→ media row: pending
→ Presigned PUT URL
→ Browser → R2 direct upload
→ complete API
→ media.status = uploaded
```

動画再生では、Workerで認証・Media確認後に15分有効のPresigned GET URLを発行し、307でR2へ接続する。Range配信はR2へ任せ、Workerで大容量動画を中継しない。写真表示と元ファイル保存は認証済みWorker経由を維持する。

## 認証

最終的にLINE Login。

独自ID/Passwordは持たない。

LINE Login ChannelとMessaging API Channelは同一LINE Provider配下を前提。

SessionはHttpOnly + Secure Cookie。

LINE認証のstate・nonce・PKCE verifierは有効期限10分でD1へ保存する。Safari PWAからLINEを経由して別ブラウザへ戻った場合は、認証結果をD1へ一時保存し、PWA再表示時に認証開始Cookieを使ってPWA側のSessionを発行する。

Phase 1では仮ユーザーを利用し、後からLINE認証へ差し替えやすくする。

## コスト方針

基本無料運用。

R2無料枠を超えても、数十GB程度で月100円前後なら許容。

## コード品質

- TypeScript strict
- `any`を極力避ける
- UIにdomain logicを埋め込まない
- DB accessをroute handlerへ散乱させない
- R2 accessをservice化
- current user取得を抽象化
- API input validationを行う
- error response形式を統一
- 過剰な抽象化はしない
