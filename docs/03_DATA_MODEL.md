# Data Model

Phase 1で想定する主要テーブル:

- users
- events
- event_scenes
- posts
- media
- comments
- view_histories

Phase 2以降:

- invites
- invite_requests
- notification_batches

IDはULIDを優先。
日時はUTC保存。

## users

```text
id
line_user_id nullable in Phase 1
display_name
avatar_url
role: owner | uploader | viewer
notification_enabled
line_friend_enabled
created_at
updated_at
```

## events

```text
id
title
description
start_date
end_date
cover_media_id
cover_object_key
cover_source: auto | manual
cover_position_x: 0〜100（既定50）
cover_position_y: 0〜100（既定50）
created_by
created_at
updated_at
```

## event_scenes

```text
id
event_id
title
sort_order
created_at
updated_at
```

Sceneのネストは禁止。

## posts

```text
id
event_id nullable
scene_id nullable
created_by
caption nullable
taken_date nullable
created_at
updated_at
```

制約:

- scene_idがある場合はevent_idも存在すること
- sceneは該当eventに属していること

## media

```text
id
post_id
uploaded_by
media_type: photo | video
original_object_key
preview_object_key nullable
thumbnail_object_key nullable
original_filename
mime_type
file_size
width
height
duration_seconds nullable
taken_at nullable
upload_status: pending | uploaded | failed
created_at
```

## comments

```text
id
post_id
user_id
body
created_at
updated_at
```

## view_histories

Post単位で保持。

```text
id
post_id
user_id
first_viewed_at
last_viewed_at
```

推奨:

```text
UNIQUE(post_id, user_id)
```

## invites

Phase 2。

```text
id
token_hash
role
expires_at
max_uses
use_count
approval_required
closed_at nullable
created_by
created_at
```

新規に発行する家族共通URLは`role = viewer`、`approval_required = 1`とする。既存の個別招待は`approval_required = 0`として従来のログイン時付与を維持する。

## invite_requests

家族共通URLから送られた閲覧リクエストと審査状態を保持する。申請中ユーザーは`users.is_active = 0`のため、招待画面と申請API以外の非公開データへアクセスできない。

```text
id
invite_id
user_id
status: pending | approved | rejected
requested_at
reviewed_by nullable
reviewed_at nullable
notification_error nullable
```

`UNIQUE(invite_id, user_id)`で同じURLからの重複申請を防ぐ。承認時にユーザーをviewerとして有効化し、招待の`use_count`を増やす。

## sessions

LINE Login後のログイン状態を保持する。token本体はCookieだけに保存し、D1にはhashのみ保存する。有効期限はアプリ起動時の認証確認で最終利用から約90日へ更新する。

```text
token_hash
user_id
expires_at
created_at
```

## line_login_requests

LINE認証を開始したブラウザとCallbackを受け取るブラウザが異なる場合に備え、認証要求と完了ユーザーを10分間保持する。

```text
state_hash
nonce
verifier
invite_token_hash
completed_user_id
expires_at
created_at
```

## notification_batches

Phase 2。

投稿通知を一定時間まとめるために使用。

詳細schemaはLINE通知実装時に確定する。
