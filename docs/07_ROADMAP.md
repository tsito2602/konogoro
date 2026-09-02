# Roadmap

## Phase 1 — Core

- React / Vite / Hono / Workers
- D1
- R2
- Event / Scene / Post / Media
- Timeline
- Event List / Detail
- Post Create / Detail
- Media Viewer
- Comments
- Seen By
- Empty / Error states

## Phase 1.5 — Review / UI polish

Phase 1完成後、LINE連携前に実施。

確認:

- Mobile usability
- Media prominence
- DESIGN.mdとの整合
- Header subtitleが紛れ込んでいないか
- いいね / reactionが勝手に追加されていないか
- Event / Scene / Postの階層がUI上で過剰になっていないか
- Upload UX
- Media Grid
- Event Cover

## Phase 2 — Authentication & Family

- LINE Login
- Session
- Family member
- Invite
- role/permission
- [x] LINE公式アカウント友だち追加導線

## Phase 3 — Notification

- [x] LINE Messaging API
- [x] notification batch
- [x] Cron Trigger
- [x] per-user notification ON/OFF
- [x] 10分程度の投稿まとめ通知

## Phase 4 — Hardening

- [x] PWA
- [x] thumbnail / preview最適化
- [x] video thumbnail
- [x] retry UX
- [x] production monitoring
- [x] backup / export検討

## Phase 5 — Role-based access

- [x] viewer向け管理導線の非表示
- [x] role別クライアントルーティング制御
- [x] 家族情報・管理APIの認可強化
- [x] 投稿アップロード・公開APIの認可強化
- [x] 招待時のrole選択
- [x] メンバーのrole変更
