# Production Operations

## 監視

`wrangler.jsonc`でWorkers Logsを有効化し、小規模運用中は全invocationを保存する。トラフィックやログ料金が増えた場合は`head_sampling_rate`を下げる。

Cloudflare Dashboardの「Workers & Pages」→`konogoro`→「Observability」で次を確認する。

- HTTP 5xxとuncaught exceptionの有無
- `event = api_error`のAPIエラー
- `event = r2_delete_error`のR2削除失敗
- `event = notification_batch_failed`のLINE通知失敗
- `event = invite_request_notification_failed`の閲覧リクエスト通知失敗
- `event = invite_approval_notification_failed`の承認結果通知失敗
- `event = notification_cron_completed`の`failedCount`と実行数

ログにはsecret、LINE user ID、セッションtoken、コメントや投稿本文を含めない。障害調査時はエラー種別、`requestId`、発生時刻、対象IDを使う。

リリース後は次を手動確認する。

1. ログインとタイムライン表示
2. 画像1枚の投稿と表示
3. Cron実行後の`notification_cron_completed`
4. LINE通知の受信
5. 共通招待URLからの閲覧リクエスト、管理者の承認、承認後の閲覧

## LINE Webhook

Webhook URLは次を使用する。

```text
https://konogoro.tsito-apps.workers.dev/api/webhooks/line
```

署名検証にはLINE Loginの`LINE_CHANNEL_SECRET`ではなく、Messaging API ChannelのChannel Secretを使用する。本番Workerへsecretとして対話入力する。値をコマンド引数、ログ、リポジトリへ記録しない。

```sh
npx wrangler secret put LINE_MESSAGING_CHANNEL_SECRET
```

Workerをデプロイした後、LINE Developers Consoleで次を行う。

1. 「このごろ」に紐づくMessaging API Channelを開く。
2. 「Messaging API」タブのWebhook URLへ上記URLを登録する。
3. 「Verify」を実行し、`Success`になることを確認する。
4. 「Use webhook」を有効にする。
5. 「Webhook redelivery」を有効にする。
6. 検証用メンバーで「このごろ」をブロックし、設定画面が受信不可・通知OFFへ変わることを確認する。
7. ブロックを解除し、設定画面が受信可能へ変わること、通知はOFFのままであることを確認する。

LINEは友だち追加またはブロック解除時に`follow`、ブロック時に`unfollow`を送る。Webhookはraw bodyのHMAC-SHA256署名を検証し、不正な署名では状態を更新しない。LINE Developers Consoleの疎通確認はeventが空のリクエストを送るため、正常な署名であればHTTP 200を返す。LINE user IDやChannel Secretはログへ出力しない。

Webhookが反映されない場合は、LINE Developers ConsoleのWebhook error statisticsとCloudflare Workers LogsのWebhookエラーを確認する。復旧までの間は設定画面の「LINE通知の状態を確認」で手動同期できる。

## D1の復旧とエクスポート

D1 production databaseはTime Travelの対象で、特別な有効化は不要。復旧可能期間内の誤更新・誤削除はpoint-in-time recoveryを使う。

現在状態とbookmarkの確認:

```sh
npx wrangler d1 info DB
npx wrangler d1 time-travel info DB
```

本番migrationや大量の手動更新前は、復旧期間を超えて保存できるSQL exportも取得する。`backups/`は個人情報を含むためリポジトリへcommitせず、暗号化された保存先へ移す。export中はDBリクエストがブロックされるため、利用の少ない時間帯に実行する。

```sh
mkdir -p backups
npx wrangler d1 export DB --remote --output=backups/konogoro-YYYYMMDD.sql
```

復旧が必要な場合は、必ず先に現在のbookmarkとSQL exportを保存し、復旧対象の時刻と影響範囲を確認する。Time Travel restoreは本番DBを上書きする破壊的操作のため、人間の明示承認なしに実行しない。

## R2メディア

R2 bindingの`MEDIA`は非公開bucketを参照し、D1にobject keyのみ保存する。D1のTime TravelはR2 objectを復旧しない。投稿削除でR2 objectも削除する現行仕様のため、アプリ上の削除からの復元は非対応。

現時点では、家族の元写真・動画を端末または別のクラウドストレージに残すことをR2のバックアップ方針とする。R2の全object複製は保存容量と運用を二重化するため、利用量と復元要件が明確になるまで導入しない。

## 大容量動画の分割送信

64MiB以上の動画は8MiBずつ、画面全体で最大3パートを同時にR2へ直接送信する。元動画と任意の再生用動画が対象で、500MiBの上限は維持する。小さいファイルは従来のPUTを使う。R2のCORSは`PUT`、`Content-Type`とレスポンスの`ETag`公開が必要で、本番・stagingの設定ファイルに含まれている。

同じ画面での再試行は成功したパートを保持し、失敗したパートだけ新しい署名URLで送り直す。画面の再読み込みをまたぐ部分再開は提供しない。開始情報はD1の`multipart_uploads`に保存し、確定応答を失ったときはR2の容量と`multipart-session`メタデータを照合して二重送信を避ける。アップロードの中止はR2にも通知する。

タブ強制終了などで中止を送れなかった未完了パートは、R2の既定ライフサイクルで開始から7日後に削除される。ライフサイクルを変更するときはこの既定の中止ルールを維持する。アプリは6日を超えた未完了セッションの再開時に古いセッションを破棄する。

実機確認では、個人情報を含まない64MiB以上の動画を使い、通信遮断後の再試行で成功済みパートが送られないこと、合計進捗が100%を超えないこと、中止後に送信が止まることをネットワークパネルで確認する。

参考: https://developers.cloudflare.com/r2/objects/upload-objects/#multipart-upload-details

## ユーザー向けexport

仕様が未確定のため、現段階では管理者向けのD1 SQL exportのみ対象。ユーザー向けexportを実装する場合は、次を先に決める。

- exportの対象範囲と実行できるrole
- 写真・動画を含むか
- ZIP作成中の有効期限とダウンロード方法
- コメント、閲覧履歴、LINE関連情報の取り扱い

## 参考

- [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [D1 import / export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [LINE Webhookの受信](https://developers.line.biz/en/docs/messaging-api/receiving-messages/)
- [LINE Webhook署名検証](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/)
