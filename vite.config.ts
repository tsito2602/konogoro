import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    // 日本語フォントは unicode-range ごとの小さなファイルに分かれる。CSS へ埋め込まず、使う文字の分だけ取得させる。
    assetsInlineLimit: (file) => (/\.woff2?$/.test(file) ? false : undefined),
  },
});
