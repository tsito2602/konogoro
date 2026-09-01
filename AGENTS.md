# 開発ルール

- 実装前に`docs/`内の関連ファイルを確認し、その内容を要求仕様として実装を進める。
- 作業内容がまとまった適切な単位でコミットする。
- Phase完了時など区切りのよい時点で、検証結果と作業ツリーの状態を確認してリモートへpushする。
- コミットメッセージは`prefix: 日本語メッセージ`形式にする。
  - 例: `feat: コメント機能を追加`
- オーバーエンジニアリングを避け、要件を満たす最小で単純な実装を優先する。
- 依存関係がなく競合しない作業は、ブランチやworktree等で分離し、可能な限り並列で進める。統合前に各差分を確認し、統合後に全体の検証を行う。
- 作業ごとに、実装内容を簡潔に説明する。
- 人間による操作が必要な場合は、必要な理由と実行手順を明確に示す。

## 本番反映

- ユーザーがデプロイ不要と明示した場合を除き、実装作業の完了時は次の固定手順で本番反映する。コード・設定・配信物が変わらないドキュメントのみの変更はデプロイしない。
  1. `npm run check`を実行する。
  2. `git diff --check`と`git status --short`で差分を確認し、対象変更だけをコミットして`main`へpushする。
  3. 新しいD1 migrationがある場合だけ、`npx wrangler d1 migrations apply DB --remote`で本番D1へ先に適用する。
  4. `npm run deploy`を実行する。このscriptはbuild、R2 CORS反映、Workerデプロイを行う。
  5. `npx wrangler deployments status --json`で最新Versionが100%配信されていることを確認する。
  6. `curl -fsSI https://konogoro.tsito-apps.workers.dev/`でHTTP 200を確認し、変更内容に応じた最小限の本番確認を行う。
- 通常デプロイではこの固定手順を使い、追加の手順探索を行わない。Cloudflare・Wranglerの追加調査は、`wrangler.jsonc`、binding、migration、package script、デプロイ方式を変更するとき、コマンドが失敗したとき、または上位指示で必要なときだけ行う。
- 作業ツリーに別作業の未コミット差分がある場合は混ぜず、対象コミットの一時worktreeからデプロイする。
