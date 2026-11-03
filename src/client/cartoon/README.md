# cartoon

[cartoon-kit](https://github.com/tsito2602/cartoon-kit) `9b05f6e` からコピーしたファイルです。数値（ばねの k / d、つぶれ量）は cartoon-kit で決めたものなので、ここで変えるときは cartoon-kit 側と合わせて決めます。

| ファイル | 元 | 使い方 |
| --- | --- | --- |
| `cartoon.ts` | `src/cartoon.ts` | ばね、`Live`、squish、pop / sink / poof など。`interaction-feedback.ts` が押したときのつぶれに使う |
| `theme.css` | `src/styles/theme.css` | 素材 `--p-*` と書体 `--f-*`。`styles.css` の役割名（`--carbon`、`--surface` など）はここへ対応づける |
| `fonts.css` | `src/styles/fonts.css` | Bricolage Grotesque と IBM Plex Mono を `@fontsource` から自前で読む。本文は Zen Kaku Gothic New の代わりに端末の標準フォントで、ここでは読まない。`styles.css` で `--f-body` を上書きしている |
| `cartoon-dock.tsx` | `src/cartoon-dock.tsx` | 親指ドック。`components/MainDock.tsx` がボトムナビに使う |
| `dock-morph.ts` | `src/dock-morph.ts` | ドックの島の輪郭と変形 |
| `dock.css` | `src/styles/dock.css` | 島と中のボタンの部分だけ。置き場所は `dock-layout.css` |
