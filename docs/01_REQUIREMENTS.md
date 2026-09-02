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
- 全投稿編集・削除

ownerは他のメンバーのroleを変更できる。唯一のownerがいなくなる状態を避けるため、自分自身のroleは変更できない。

### uploader

- 投稿
- 閲覧
- コメント
- イベント作成・編集・削除
- 全投稿編集・削除

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
- Event・Sceneの作成・編集・削除
- 投稿の編集、投稿・Mediaの削除操作
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
  └─ Scene (optional)
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

### Scene

Event内の整理単位。

例:

- Day 1 - フランクフルト
- Day 2 - シュトゥットガルト

Sceneは任意。

Sceneは1階層のみ。ネスト不可。

### Post

実際の投稿単位。

例:

- ポルシェミュージアム
- 夜ごはん
- ドイツ到着

Post titleは持たない。
Caption（画面上は「ひとこと」）は任意。

### Media

写真または動画。

複数Mediaを1Postにまとめる。

---

## 3. タイムライン

画面名は **「タイムライン」**。

すべてのPostを新しい順に表示する。

Eventに属さないPostも表示する。

Postカードには原則として以下を表示:

- 投稿者のプロフィールアイコン
- Event titleとScene title（存在する場合）
- Media Grid
- 「見た人」の人数とComment数
- Caption（存在する場合）
- 最新のComment 1件
- 残りのCommentを開く導線

写真1枚ごとをSNS投稿にしない。

Event titleとScene titleは投稿者アイコンとともにMedia Gridの上へ表示し、Post Detailを開けることが分かる矢印を添える。Event titleにはカレンダーアイコンを付け、Scene titleは装飾のない補助行としてEventとの違いを示す。Eventがない場合は「日常の投稿」と表示する。投稿者名は常時表示せず、プロフィールアイコンで表現する。「見た人」とCommentの右端には撮影日をカメラアイコン付きで表示し、撮影日がない場合は投稿日をアップロードアイコン付きで表示する。Comment数はコメントアイコンの右へ表示する。Commentが2件以上ある場合も、最新の1件の下に表示する導線は「ほかのコメントを見る」とし、Comment数を重複表示しない。

### 近況

近況では公開投稿とコメントを新しい順に表示する。各項目には誰が、どの投稿に、いつ操作したかを表示し、対象のPost Detailへ移動できる。投稿を表す名称はCaptionではなくScene titleを優先し、Sceneがない場合はEvent title、どちらもない場合は「投稿」とする。リスト上部には、メンバーごとの最終閲覧時刻をアイコンと相対時間で表示する。

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

### イベント一覧の状態と表示順

Eventの状態は保存せず、日本時間の当日とstart_date・end_dateから自動判定する。日付が片方だけの場合は、その日だけのEventとして扱う。

1. 進行中: 開始日から終了日まで。終了日が近い順
2. 予定: 開始日前。開始日が近い順
3. 日付未定: 日付が両方未設定。更新が新しい順
4. 終了: 終了日を過ぎたもの。終了日が新しい順

進行中と予定のEvent Cardには状態を表示する。予定Eventも家族全員へ表示し、事前にSceneやPostを準備できるようにする。

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
Scene
  ↓
Post
  ↓
Media
```

Scene titleは1文字列として表示する。

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

画面上部のヘッダーには共通タイトルを表示せず、戻るボタンと権限に応じた投稿メニューだけを配置する。投稿情報はTimelineと同じ順序で表示し、Event titleにはカレンダーアイコン、Scene titleには装飾を付けない。CaptionとComment一覧は同じsurface上に置き、細い区切り線と余白で区別する。コメント投稿フォームはBottom Navigationの直上へ固定する。

表示:

- Event（存在する場合）
- Scene（存在する場合）
- 撮影日
- 投稿者
- Media
- Caption
- Seen by
- Comments

右上の3点メニューから、権限があるユーザーだけが投稿を編集・削除できる。編集対象はEvent、Scene、Captionとし、既存Mediaは保持する。削除前には写真・動画とコメントも削除され、元に戻せないことを確認するモーダルを表示する。

Event / Sceneがない場合、空ラベルを出さない。

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
- Event / Scene / Post情報
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
3. Scene選択
4. ひとこと
5. 投稿

Event: optional
Scene: optional
Caption: optional

SceneはEvent選択時のみ利用可能。

投稿作成画面と投稿編集画面の両方からSceneを新規作成できる。Sceneの追加後は、そのSceneを選択した状態にする。

Sceneの管理はEvent Editへ集約する。

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

## 11. 「見た人」

ユーザー操作ではなく自動既読。

目安:

- Post Cardの50%以上が画面内
- 2秒以上表示

同一ユーザー・同一Postへ大量writeしないこと。

現在のユーザーがまだ見ていないPostは、TimelineとEvent DetailのPost Cardへ「未閲覧」と表示する。自動既読が記録されたら、その場で表示を消す。

UI:

```text
👀 3
```

元の目の絵文字を思わせる、可愛らしく横方向へ視線を向けたオリジナルの両目アイコンの右に見た人数を表示する。両目アイコンは塗りつぶさず、コメントアイコンと調和する輪郭線で表現する。タップするとボタンの上に「見た人」と閲覧者の一覧を表示し、各ユーザー名の左にプロフィール画像または頭文字アイコンを添える。数字やランキングを強調しない。近況上部では各メンバーの最終閲覧からの相対時間を「最後に見た時間」として表示する。

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
→ LINE公式アカウント友だち追加確認
→ 参加確認
→ User登録
→ Timeline
```

LINE Login ChannelにはMessaging API ChannelのLINE公式アカウントをリンクする。ログイン後に友だち状態を保存し、未追加の場合は設定画面から再確認できるようにする。

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

ユーザーごとに通知ON/OFFを持つ。LINE公式アカウントを友だち追加済みのユーザーだけを送信対象にする。

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
