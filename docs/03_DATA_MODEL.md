# Data Model

Phase 1で想定する主要テーブル:

- users
- events
- event_sections
- posts
- media
- comments
- view_histories

Phase 2以降:

- invites
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
created_by
created_at
updated_at
```

## event_sections

```text
id
event_id
title
sort_order
created_at
updated_at
```

Sectionのネストは禁止。

## posts

```text
id
event_id nullable
section_id nullable
created_by
title
caption nullable
taken_date nullable
created_at
updated_at
```

制約:

- section_idがある場合はevent_idも存在すること
- sectionは該当eventに属していること
- title必須

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
created_by
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
