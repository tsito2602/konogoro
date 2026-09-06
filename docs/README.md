# このごろ — 開発ドキュメント

## 読む順番と役割

1. [プロダクト概要](00_PRODUCT_OVERVIEW.md): 目的・非SNS方針
2. [機能要件](01_REQUIREMENTS.md): 権限・データの意味・機能範囲
3. [デザインの考え方](DESIGN.md): このごろ固有の判断の軸
4. [デザインガイド](05_DESIGN_GUIDE.md): 視覚・部品・確認基準
5. [UI・UX仕様](04_UI_UX_SPEC.md): 画面・操作・状態・遷移
6. [設計](02_ARCHITECTURE.md)・[データモデル](03_DATA_MODEL.md): 技術上の制約
7. [改訂記録](11_DESIGN_REVISION.md): 2026-09の変更理由と後続Issueへの適用順
8. [運用](08_OPERATIONS.md)・[ステージング](09_STAGING.md): 検証と反映
9. [整理方法の判断](10_MEMORY_DISCOVERY_DECISION.md): 検索を拡張する判断記録

実装前にAGENTS.mdと関連文書を確認する。ユーザーの明示指示を優先し、各文書の役割を越えた矛盾は関連箇所を同時に修正する。機能要件中の古い配置文言を理由に、改訂した画面仕様を無効にしない。

[Phase 1用プロンプト](06_PHASE1_IMPLEMENTATION_PROMPT.md)と[ロードマップ](07_ROADMAP.md)は段階別の資料。完了した初期段階の制約を、実装済みの認証・通知等の禁止として解釈しない。[旧参考](DESIGN_REFERENCE.md)は保存資料であり実装基準ではない。

新しい目標仕様は実装済みと区別する。個別Issueの範囲と依存関係はIssue本文を確認し、文書変更だけでアプリの改善完了とは扱わない。
