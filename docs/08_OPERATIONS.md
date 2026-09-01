# Production Operations

## 監視

`wrangler.jsonc`でWorkers Logsを有効化し、小規模運用中は全invocationを保存する。トラフィックやログ料金が増えた場合は`head_sampling_rate`を下げる。

Cloudflare Dashboardの「Workers & Pages」→`konogoro`→「Observability」で次を確認する。

- HTTP 5xxとuncaught exceptionの有無
- `event = api_error`のAPIエラー
- `event = r2_delete_error`のR2削除失敗
- `event = notification_batch_failed`のLINE通知失敗
- `event = notification_cron_completed`の`failedCount`と実行数

ログにはsecret、LINE user ID、セッションtoken、コメントや投稿本文を含めない。障害調査時はエラー種別、`requestId`、発生時刻、対象IDを使う。

リリース後は次を手動確認する。

1. ログインとタイムライン表示
2. 画像1枚の投稿と表示
3. Cron実行後の`notification_cron_completed`
4. LINE通知の受信

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
