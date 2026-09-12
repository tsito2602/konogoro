---
name: konogoro-staging
description: konogoroのPR作成・更新後にstagingへ統合し、デプロイ結果を確認する。stagingの反映失敗を調べる場合にも使う。
---

# konogoroのstaging反映

対象PRの最新commitをstagingへ反映し、そのcommitを含むデプロイの成功まで確認する。文書のみのPRやDraftも対象とする。

- 環境と統合手順は[staging運用](../../../docs/09_STAGING.md)の該当節を参照する。デプロイが失敗した場合は、該当runの失敗jobと[workflow](../../../.github/workflows/deploy-staging.yml)から調べる。
- 更新直前のstagingと確認中PRを確認し、既存の確認中変更を保持して対象PRを統合する。最新mainから再構成する場合も必要なPRをすべて再統合し、同時更新を上書きしない。
- `Deploy staging to Cloudflare`の対象commitに対する成功を確認する。UI・配信物を変更した場合は対象画面や表示バージョンも確認し、未反映の状態でユーザーへ実機確認を依頼しない。
- stagingのD1・R2は本番と分離し、本番データや個人情報を登録しない。stagingからLINE通知を送信しない。
- 完了時は反映したPR・commitとデプロイ結果を報告する。権限・保護ルール・デプロイ失敗で止まる場合は、原因と未完了の操作を示す。Draft・目視確認待ち・ローカルブラウザ不調を理由に反映を省略しない。

本番mainへのマージにはユーザーの明示指示が必要。stagingをmainと同じcommitへ戻すのは、確認中PRが残っていない場合だけにする。
