# Functional Requirements

## 1. ユーザー

role:

- `owner`
- `uploader`
- `viewer`

想定:

- 夫: owner
- 妻: owner
- 両親・兄弟など: viewer

### owner

- 投稿
- 閲覧
- コメント
- イベント作成・編集
- 家族招待
- メンバー管理
- 全投稿削除

ownerは他のメンバーのroleを変更できる。唯一のownerがいなくなる状態を避けるため、自分自身のroleは変更できない。

### uploader

- 投稿
- 閲覧
- コメント
- 自分の投稿削除

### viewer

- 閲覧
- コメント

#### viewer向けUI

viewerには閲覧・コメントに不要な管理導線や家族情報を表示しない。

表示するもの:

- タイムライン
- イベント一覧・詳細
- 投稿詳細・Media Viewer
- コメント追加
- 自分のコメント削除
- 自分の表示名など最低限の個人設定

表示しないもの:

- 投稿追加タブ・投稿作成画面
- Event・Sectionの作成・編集・削除
- 投稿・Mediaの削除操作
- 家族タブ・メンバー一覧・role・通知状態
- 招待・メンバー管理
- owner・uploader向け管理設定

非表示だけに依存せず、APIの認可とクライアントルーティングでもアクセスを拒否する。

---

## 2. データ階層

トップレベルの `Album` データ概念は作らない。アルバム画面は既存Mediaを年月ごとに表示するviewとして扱う。

アプリ全体が1つの「このごろ」。

```text
Event
  └─ Section (optional)
      └─ Post
          └─ Media
```

例:

```text
ドイツ新婚旅行
  └─ Day 2 - シュトゥットガルト
      ├─ ポルシェミュージアム
      │   └─ 写真18枚
      └─ 夜ごはん
          └─ 写真6枚
```

### Event

旅行や大きなお出かけ単位。

例:

- ドイツ新婚旅行
- 箱根温泉
- 佐原ドライブ
- 結婚記念日ディナー

Eventは任意。

### Section

Event内の整理単位。

例:

- Day 1 - フランクフルト
- Day 2 - シュトゥットガルト

Sectionは任意。

Sectionは1階層のみ。ネスト不可。

### Post

実際の投稿単位。

例:

- ポルシェミュージアム
- 夜ごはん
- ドイツ到着

Post title は必須。
caption は任意。

### Media

写真または動画。

複数Mediaを1Postにまとめる。

---

## 3. タイムライン

画面名は **「タイムライン」**。

すべてのPostを新しい順に表示する。

Eventに属さないPostも表示する。

Postカードには原則として以下を表示:

- Section title（存在する場合）
- Post title
- Media Grid
- 投稿者
- Caption
- Comments count
- Seen by

写真1枚ごとをSNS投稿にしない。

---

## 4. 撮影日時

Mediaには撮影日時を保持する。

タイムラインの日付処理は原則としてアップロード日時ではなく撮影日時を利用する。

ただし投稿画面に「撮影日の扱い」などの説明UIは表示しない。

---

## 5. イベント

Eventには以下を持つ:

- id
- title
- description
- start_date
- end_date
- cover_media_id
- cover_object_key
- cover_source
- created_by
- created_at
- updated_at

`cover_source`:

- `auto`
- `manual`

### カバー画像

原則自動選択。

1. 写真がある場合は写真から選択
2. 写真がなく動画のみなら動画の代表フレーム
3. ユーザーは手動変更可能
4. manualになった後は勝手に変更しない
5. 「自動選択に戻す」を用意する

動画の代表フレームは、Workerで重い動画処理をせず、ブラウザ側生成を優先する。

---

## 6. Event Detail

Event Detailは「そのEventだけに絞ったTimeline」。

上部:

- Cover
- Event title
- start/end date
- 写真数
- 動画数
- Post数

下部:

```text
Section
  ↓
Post
  ↓
Media
```

Section titleは1文字列として表示する。

NG:

```text
Day 2
シュトゥットガルト
```

OK:

```text
Day 2 - シュトゥットガルト
```

---

## 7. Post Detail

Timeline / Event Detail のどちらから入っても同じPost Detailを使う。

表示:

- Post title
- Event（存在する場合）
- Section（存在する場合）
- 撮影日
- 投稿者
- Media
- Caption
- Seen by
- Comments

Event / Sectionがない場合、空ラベルを出さない。

---

## 8. Media Viewer

写真・動画を大きく表示する。

最低限:

- 写真表示
- 動画再生
- 前後移動
- 現在位置 / 全件数
- サムネイル一覧
- 撮影日時
- 投稿者
- Event / Section / Post情報
- 保存

外部共有ボタンは不要。

右上メニュー候補:

- 保存
- 削除（権限ありのみ）
- 情報

---

## 9. 投稿作成

フロー:

1. 写真・動画を複数選択
2. Event選択
3. Section選択
4. Post title
5. Caption
6. 投稿

Event: optional  
Section: optional  
Post title: required  
Caption: optional

SectionはEvent選択時のみ利用可能。

投稿画面からSection新規作成可能。

アップロード進捗を表示。

---

## 10. コメント

実装:

- コメント一覧
- コメント追加
- 自分のコメント削除

不要:

- 返信スレッド
- メンション
- スタンプ
- リアクション

---

## 11. 「見たよ」

ユーザー操作ではなく自動既読。

目安:

- Post Cardの50%以上が画面内
- 2秒以上表示

同一ユーザー・同一Postへ大量writeしないこと。

UI:

```text
👀 3
```

両目のアイコンの右に見た人数を表示する。タップすると「みたよ」と見た人の一覧を表示する。数字やランキングを強調しない。

---

## 12. 家族招待

ownerが招待URLを発行。

token:

- 7日間有効
- 原則1回利用
- D1にはtoken hashのみ保存

フロー:

```text
Invite URL
→ LINE Login
→ 参加確認
→ User登録
→ Timeline
```

---

## 13. LINE通知

LINE公式アカウントから通知する。

Mediaごと / Postごとの即時通知はしない。

短時間の投稿をまとめる。

例:

```text
22:00 写真10枚
22:03 写真5枚
22:06 動画2本
↓
約10分後
写真15枚・動画2本が追加されました
```

Cloudflare Cron Triggersで通知batchを処理。

ユーザーごとに通知ON/OFFを持つ。

---

## 14. 空状態

### Timeline

「まだ投稿がありません」
→ 投稿追加

### Event List

「まだイベントがありません」
→ Event作成

### Event Detail

「まだ投稿がありません」
→ 投稿追加

---

## 15. エラー

考慮するもの:

- D1 error
- R2 upload error
- Presigned URL取得失敗
- upload途中失敗
- complete API失敗
- unsupported file
- file size error

複数uploadでは1件失敗で全体を失敗扱いにしない。

成功済みMediaは維持。
失敗Mediaのみ再試行可能にする。
