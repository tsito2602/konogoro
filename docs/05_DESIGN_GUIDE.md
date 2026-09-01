# Design Guide — このごろ Overrides

`docs/DESIGN.md` をデザイン言語として参照する。

ただし、Apple.comのマーケティングページをそのまま再現しない。

## 優先順位

1. Product requirements
2. Mobile usability
3. Photography / video prominence
4. DESIGN.md principles
5. DESIGN.mdの厳密な数値

## Core Principles

- Photography and video are the primary visual content.
- UI chrome must remain quieter than user media.
- Do not introduce social engagement mechanics.
- Comments and passive "seen by" indicators are allowed.
- Screen headers normally contain only title and actions.
- Explanatory subtitles below screen headers are normally omitted.

## Mobile-first

- Primary target: 320px–430px
- Horizontal padding: 16px
- Minimum tap target: 44px
- Bottom navigation for primary navigation
- Avoid marketing-page hero typography
- Avoid oversized 56px headings

## Shape Overrides

`DESIGN.md`の8pxカード固定はこのアプリでは緩和する。

推奨:

```css
--radius-card: 16px;
--radius-media: 12px;
--radius-input: 12px;
--radius-button: 999px;
```

## Media

- Event cards use cover image as full-bleed background.
- Add subtle dark gradient under overlaid text.
- Timeline Media Grid should use as much width as practical.
- Avoid decorative illustrations when user photography exists.

## Color

- ライトテーマとダークテーマを提供し、既定値は`prefers-color-scheme`によるシステム設定に従う。
- ダークテーマでは背景・surface・区切り線・補助文字を暗色向けに切り替え、写真と動画を主役に保つ。
- `docs/DESIGN.md`の青いaccentは、このアプリではアプリアイコンの朝日`#FFD166`へ置き換える。
- Primary actionの背景は`#FFD166`、その上の文字とアイコンは`#1F2733`を使う。
- 白背景上のlink、outline、active stateには、可読性を確保した`#6B4B00`を使う。黄色を文字色として直接使わない。
- ボトムナビの選択中アイコンは、追加ボタンと同じ`#FFD166`を背景に使い、未選択タブとの差を明確にする。
- Metadata, comments, seen indicators should remain neutral.
- UI should be mostly monochrome because user photos provide color.

## Typography

- System font stack is sufficient.
- Do not bundle or redistribute SF Pro font files.
- Prefer 17px body text.
- Typical screen titles: 21–28px.
- Avoid oversized promotional typography.

## Shadows

- Avoid card/button drop shadows.
- Prefer hairline borders and surface changes.
