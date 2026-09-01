# Codex Prompt — Phase 1 Implementation

まず `docs/README.md` から順に、`docs/` 内のドキュメントをすべて読んでください。
また、`docs/DESIGN.md` も参照してください。

上記ドキュメントをこのプロジェクトの要求仕様として扱ってください。

---

# 今回のゴール

**Phase 1のみ実装してください。**

Phase 2のLINE連携・家族招待・通知には進まないでください。

## Phase 1対象

- React + Vite + Hono + Cloudflare Workers初期構成
- D1 migration
- R2 binding
- 開発用仮ユーザー
- Event
- Section
- Post
- Media
- Timeline
- Event List
- Event Detail
- Post Create
- Post Detail
- Media Viewer
- Comments
- Seen Byの最低限
- Empty State
- Upload Error handling

## Phase 1対象外

- LINE Login
- LINE Messaging API
- Family invitation
- Cron notification
- 本番用member management

---

# 開発用ユーザー

Phase 1では仮ユーザー1名を利用してください。

例:

```text
display_name: 翼
role: owner
```

ただし仮ユーザー処理をUIやdomain logicへ直接埋め込まないでください。

後からLINE Loginへ置き換えられるよう、
current user取得を分離してください。

---

# R2 Upload

大容量ファイル本体をWorker経由で中継しないでください。

```text
Browser
→ Worker: Presigned URL request
→ auth / authorization
→ media row: pending
→ Presigned PUT URL
→ Browser → R2 direct PUT
→ complete API
→ media.status = uploaded
```

複数Mediaでは、一部失敗しても成功済みを保持してください。

失敗Mediaだけ再試行可能にしてください。

---

# Thumbnail

Timeline / Event Detailでoriginalを大量ロードしない設計にしてください。

最低限、thumbnail object keyを利用できるinterfaceを用意してください。

Phase 1で画像変換まで実装するのが過剰なら、変換処理を明確なTODOとして残して構いません。

UIをoriginal URLへ密結合させないでください。

---

# Seen By

目安:

- Post Card 50%以上表示
- 2秒以上

IntersectionObserverなどを利用して構いません。

同一Post / Userへ無駄なwriteを繰り返さないこと。

---

# Testing

最低限:

- business logic
- API validation
- permission logic
- media upload state

UI snapshotを大量に作る必要はありません。

---

# Code Quality

- TypeScript strict
- `any`を極力使わない
- 巨大React componentを避ける
- domain logicをUIへ直接書かない
- DB accessをroute handlerへ散乱させない
- R2 accessをservice化
- auth/current user取得を抽象化
- API input validation
- error response形式を統一
- 過剰設計はしない

---

# 実装前

いきなりコードを書き始めず、まず以下を提示してください。

1. 推奨ディレクトリ構成
2. D1 schema
3. R2 object key設計
4. API endpoint一覧
5. React route一覧
6. Phase 1実装順序
7. 技術的懸念点

**ここで一旦停止してください。**

設計レビュー後、ユーザーから承認を得てから実装してください。

---

# 実装承認後

承認を受けたらPhase 1を実装してください。

実装後に必ず:

1. typecheck
2. lint
3. test
4. build

を実行し、エラーを修正してください。

その後、主要フローをブラウザで確認してください。

```text
Event作成
→ Section作成
→ Post作成
→ 写真複数upload
→ Timeline
→ Event Detail
→ Post Detail
→ Media Viewer
```

---

# Phase 1完了条件

1. 写真を複数選択できる
2. R2へアップロードできる
3. PostとしてD1へ登録できる
4. Timelineに表示される
5. Eventを作成できる
6. Sectionを作成できる
7. Event DetailでSection → Postが表示される
8. Post Detailへ移動できる
9. Media Viewerで写真を閲覧できる
10. コメント追加・表示ができる
11. Empty / upload error stateが確認できる

---

# 完了報告

以下を報告してください。

## 1. 実装した内容
画面・API・DB・R2。

## 2. 主なファイル
重要ファイルと役割。

## 3. D1 migration
テーブル・index・constraint。

## 4. R2
Object keyとupload flow。

## 5. テスト結果
- typecheck
- lint
- test
- build

## 6. 未実装 / TODO
Phase 2以降へ回したもの。

## 7. 確認方法
ローカル起動方法とURL・操作順。

要求仕様を勝手に変更しないでください。
変更が必要な場合は理由を説明し、最小限にしてください。
