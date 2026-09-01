# このごろ アイコンアセット

`icon-master-*.svg`を背景付きアプリアイコン、`logo-symbol-*.svg`を背景透過のロゴシンボルの正本とする。

## カラー

- ライト背景: `#FFF9F2`
- ダーク背景: `#1F2733`
- ライトの空: `#DDEBFA`
- ダークの空: `#BFD6F6`
- ライトの丘: `#A9CDBF`
- ダークの丘: `#A6D2C2`
- 朝日: `#FFD166`

## 書き出し

プロジェクトルートで次を実行する。

```sh
npm run icons:export
```

`scripts/export-icons.mjs`がSVGから`public/`内のPNGとfaviconをすべて再生成する。
