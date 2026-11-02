# cartoon

[cartoon-kit](https://github.com/tsito2602/cartoon-kit) `9b05f6e` からコピーしたファイルです。数値（ばねの k / d、つぶれ量）は cartoon-kit で決めたものなので、ここで変えるときは cartoon-kit 側と合わせて決めます。

| ファイル | 元 | 使い方 |
| --- | --- | --- |
| `cartoon.ts` | `src/cartoon.ts` | ばね、`Live`、squish、pop / sink / poof など。`interaction-feedback.ts` が押したときのつぶれに使う |
| `theme.css` | `src/styles/theme.css` | 素材 `--p-*` と書体 `--f-*`。`styles.css` の役割名（`--carbon`、`--surface` など）はここへ対応づける |
| `fonts.css` | `src/styles/fonts.css` | Bricolage Grotesque、Zen Kaku Gothic New、IBM Plex Mono を `@fontsource` から自前で読む。本文書体は CSS の量を抑えるため 400 と 700 だけにしている |
