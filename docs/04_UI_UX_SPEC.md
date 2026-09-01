# UI / UX Specification

## 共通

モバイルファースト。

主対象:

- 320px〜430px

PCでも使用可能だが、スマホUIを無制限に横へ引き伸ばさない。

画面ヘッダーは原則:

- 画面タイトル
- 必要なアクション

のみ。

説明サブタイトルは不要。

## Bottom Navigation

```text
タイムライン
イベント
家族
```

「＋追加」はBottom Navigationから独立させ、そのすぐ上の画面右下へ固定表示する。ownerが押すと「写真・動画」と「イベント」を選択できる。uploaderはPost Createへ直接遷移し、viewerには表示しない。

---

# Timeline

タイトル:

```text
タイムライン
```

Postは複数Mediaのまとまり。

代表例:

```text
Day 2 - シュトゥットガルト

ポルシェミュージアム
[ Media Grid ]

翼
写真18枚

念願のポルシェミュージアム...

コメント 2件
👀 3
```

## Media Grid

1枚:
- 大きく1枚

2枚:
- 2分割

3枚:
- 大1 + 小2

4枚以上:
- 代表3枚 + `+N`

写真・動画をできるだけ大きく表示。

表示済みのthumbnailとpreviewは端末へ最大300件キャッシュする。originalとvideoはService Workerのキャッシュ対象外とし、ログアウト時にメディアキャッシュを削除する。

---

# Event List

各Eventカードの背景全面にCover Mediaを表示。

下部へdark gradient。

表示:

- Event title
- start/end date
- 写真数
- 動画数

必要以上のmetadataは表示しない。

---

# Event Detail

Eventだけに絞ったTimeline。

上部:

- 大きなCover
- Event title
- dates
- 写真数
- 動画数
- Post数

その下:

```text
Day 2 - シュトゥットガルト

Post Card
Post Card

Day 1 - フランクフルト

Post Card
```

Section titleは必ず1行の文字列として扱う。

---

# Post Detail

表示:

- Post title
- Section
- Event
- date
- uploader
- Media Grid
- caption
- seen by
- comments

Mediaを押すとMedia Viewer。

---

# Media Viewer

写真・動画が主役。

- 大画面表示
- 前後移動
- `5 / 18`
- thumbnail strip
- 撮影日時
- uploader
- Event / Section / Post
- 保存

画像間の移動はブラウザ履歴へ追加しない。閉じる操作ではPost Detailへ戻り、その後の戻る操作でMedia Viewerへ戻らない。

外部共有ボタンは置かない。

---

# Post Create

順番:

```text
写真・動画
Event
Section
Post title
Caption
投稿
```

Event / Sectionはoptional。

SectionはEvent選択時のみ。

Section新規作成可能。

写真・動画の選択後はローカルでの準備中とアップロード中を区別して表示する。アップロード中に再試行ボタンを表示せず、失敗または中断した後だけ再試行導線を表示する。

不要:

```text
撮影日の扱い
写真・動画の撮影日時を...
```

これは内部仕様。

---

# Family

表示:

- メンバー
- role
- LINE通知ON/OFF
- 招待

例:

```text
翼 owner
妻 owner
父 viewer
母 viewer
```

招待時の権限は、権限名と操作説明を含むカード型ラジオボタンから選択し、そのまま招待URLを発行する。

---

# Invite

owner:

- 招待URL発行
- LINE等で送信

invitee:

```text
家族タイムラインに招待されています
[ LINEでログインして参加 ]
```

---

# Event Create / Edit

- title
- start_date
- end_date
- description
- Section管理
- Cover変更
- Event削除

---

# Cover Select

Event内Mediaをgridで表示。

- 写真
- 動画thumbnail

選択可能。

「自動選択に戻す」を用意。

---

# Settings

最低限:

- 表示名
- LINE通知
- LINE連携状態
- ログアウト
